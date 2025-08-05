const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const querystring = require('querystring');
const DatabaseManager = require('./database-manager');

const PORT = process.env.PORT || 3000;

// Initialize Database Manager
const dbManager = new DatabaseManager();

// Data file paths (for backwards compatibility)
const DATA_DIR = path.join(__dirname, 'data');
const CASES_FILE = path.join(DATA_DIR, 'cases.json');
const COUNTERS_FILE = path.join(DATA_DIR, 'counters.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const COMMENTS_FILE = path.join(DATA_DIR, 'comments.json');
const AUDIT_FILE = path.join(DATA_DIR, 'audit_log.json');

// User roles and permissions
const USER_ROLES = {
  LEAD: { name: 'Lead', permissions: ['read'] },
  MANAGER: { name: 'Manager', permissions: ['read', 'update_status'] },
  ADMIN: { name: 'Admin', permissions: ['read', 'update_status', 'create', 'delete', 'assign', 'admin'] },
  OPS: { name: 'Ops', permissions: ['read', 'update_status', 'create', 'assign'] }
};

// Valid case statuses with their allowed transitions (forward-only workflow)
const CASE_STATUSES = {
  'Open': ['Assigned', 'Hold', 'Closed-Reject'],
  'Assigned': ['In Progress', 'Hold'],  // Cannot go back to Open
  'In Progress': ['Stage 1 Investigation', 'Hold'],  // Cannot go back to Assigned
  'Stage 1 Investigation': ['Stage 2 Investigation', 'Hold', 'Closed-Approved', 'Closed-Reject'],  // Cannot go back to In Progress
  'Stage 2 Investigation': ['Stage 3 Investigation', 'Hold', 'Closed-Approved', 'Closed-Reject'],  // Cannot go back to Stage 1
  'Stage 3 Investigation': ['Closed-Approved', 'Closed-Reject', 'Hold'],  // Cannot go back to Stage 2
  'Closed-Approved': ['Reopen'],  // Final state, only reopen allowed
  'Hold': [],  // Hold transitions are handled dynamically based on previousStatus
  'Closed-Reject': ['Reopen'],  // Final state, only reopen allowed
  'Reopen': ['Assigned', 'In Progress']  // Reopened cases can start fresh workflow
};

// User management system
let users = [
  // No default users - will be populated from database or created via signup
];

// Data arrays
let cases = [];
let comments = [];
let auditLog = [];
let nextCaseId = 1;
let nextCommentId = 1;

// For backwards compatibility with existing code, create USERS object from users array
let USERS = {};

// Helper function to sync USERS object from users array
function syncUsersObject() {
  USERS = {};
  users.forEach(user => {
    USERS[user.username] = user;
    // Also add by old IDs for compatibility
    if (user.username === 'admin') USERS['admin1'] = user;
  });
}

// Role limits configuration
const ROLE_LIMITS = {
  'LEAD': 2,
  'MANAGER': 2,
  'ADMIN': 2,
  'OPS': 4
};

// Get current role counts
function getRoleCounts() {
  const counts = { LEAD: 0, MANAGER: 0, ADMIN: 0, OPS: 0 };
  users.forEach(user => {
    if (user.isActive) {
      counts[user.role] = (counts[user.role] || 0) + 1;
    }
  });
  return counts;
}

// Check if role has available slots
function canAddRole(role) {
  const counts = getRoleCounts();
  return counts[role] < ROLE_LIMITS[role];
}

// Get user permissions based on role
function getUserPermissions(role) {
  return USER_ROLES[role]?.permissions || [];
}

// Hash password (simple implementation - use bcrypt in production)
function hashPassword(password) {
  // Simple hash for demo - use proper hashing in production
  return password; // For now, storing plain text for demo
}

// Current session (in real app, use proper session management)
let currentUser = null;

// Data persistence functions using Excel/CSV format
function ensureDataDirectory() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log('Created data directory:', DATA_DIR);
  }
}

async function saveData() {
  try {
    console.log('Saving data to JSON files...');
    
    // Ensure data directory exists
    ensureDataDirectory();
    
    // Save to JSON files only (database bypassed)
    fs.writeFileSync(CASES_FILE, JSON.stringify(cases, null, 2));
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    fs.writeFileSync(COUNTERS_FILE, JSON.stringify({
      nextCaseId,
      nextCommentId
    }, null, 2));
    
    // Save comments if they exist
    if (typeof comments !== 'undefined' && Array.isArray(comments)) {
      fs.writeFileSync(COMMENTS_FILE, JSON.stringify(comments, null, 2));
    }
    
    // Save audit log if it exists
    if (typeof auditLog !== 'undefined' && Array.isArray(auditLog)) {
      fs.writeFileSync(AUDIT_FILE, JSON.stringify(auditLog, null, 2));
    }
    
    console.log('Data saved successfully to JSON files');
    console.log(`Saved ${users.length} users, ${cases.length} cases`);
  } catch (error) {
    console.error('Error saving data:', error);
  }
}

async function loadData() {
  try {
    console.log('Loading data from JSON files (temporary bypass)...');
    
    // Temporarily skip database loading and go straight to JSON
    await loadDataFromJSON();
    
  } catch (error) {
    console.error('Error loading data:', error);
    // Initialize with empty data if all fails
    users = [];
    cases = [];
    nextCaseId = 1;
    nextCommentId = 1;
    syncUsersObject();
  }
}

async function loadDataFromJSON() {
  try {
    ensureDataDirectory();
    
    // Load users from JSON if file exists
    if (fs.existsSync(USERS_FILE)) {
      const usersData = fs.readFileSync(USERS_FILE, 'utf8');
      const jsonUsers = JSON.parse(usersData);
      if (jsonUsers.length > users.length) {
        users = jsonUsers;
        console.log(`Loaded ${users.length} users from JSON backup`);
      }
    }
    
    // Load cases from JSON if file exists
    if (fs.existsSync(CASES_FILE)) {
      const casesData = fs.readFileSync(CASES_FILE, 'utf8');
      const jsonCases = JSON.parse(casesData);
      if (jsonCases.length > 0) {
        cases = jsonCases;
        console.log(`Loaded ${cases.length} cases from JSON backup`);
      }
    }
    
    // Load counters from JSON if file exists
    if (fs.existsSync(COUNTERS_FILE)) {
      const countersData = fs.readFileSync(COUNTERS_FILE, 'utf8');
      const counters = JSON.parse(countersData);
      nextCaseId = counters.nextCaseId || 4;
      nextCommentId = counters.nextCommentId || 3;
      console.log(`Loaded counters from JSON: nextCaseId=${nextCaseId}, nextCommentId=${nextCommentId}`);
    }
    
    // Sync USERS object for compatibility
    syncUsersObject();
    
    // Temporarily skip saving to database
    // await saveData();
    
  } catch (error) {
    console.error('Error loading data from JSON:', error);
    console.log('Using default data');
    syncUsersObject(); // Ensure USERS object is synced even on error
  }
}

// Remove hardcoded default cases and counters - they're loaded from JSON now
// let cases = []; // Already defined above
// let nextCaseId = 1; // Already defined above
// let nextCommentId = 1; // Already defined above

// Helper functions for authorization
function hasPermission(user, permission) {
  if (!user || !USER_ROLES[user.role]) return false;
  return USER_ROLES[user.role].permissions.includes(permission);
}

function canTransitionStatus(fromStatus, toStatus, caseItem = null) {
  // Special logic for putting a case on Hold
  if (toStatus === 'Hold') {
    // Can put any active status on hold (except final states and already on hold)
    return !['Closed-Approved', 'Closed-Reject', 'Hold'].includes(fromStatus);
  }
  
  // Special logic for resuming from Hold
  if (fromStatus === 'Hold') {
    if (!caseItem || !caseItem.previousStatus) {
      // If no previous status tracked, can only go to initial workflow states
      return ['Assigned', 'In Progress'].includes(toStatus);
    }
    
    // When resuming from Hold, can continue from where it was put on hold
    // or move forward in the workflow
    const previousStatus = caseItem.previousStatus;
    const allowedFromPrevious = CASE_STATUSES[previousStatus] || [];
    
    // Can resume to the same status it was before hold, or move forward
    return toStatus === previousStatus || allowedFromPrevious.includes(toStatus);
  }
  
  // Regular forward-only workflow validation
  if (!CASE_STATUSES[fromStatus]) return false;
  return CASE_STATUSES[fromStatus].includes(toStatus);
}

function getUserFromRequest(req) {
  // Get user from headers - no default fallback
  const userId = req.headers['x-user-id'] || req.headers['x-username'];
  console.log('getUserFromRequest - userId from headers:', userId);
  console.log('getUserFromRequest - all headers:', Object.keys(req.headers));
  
  if (!userId) {
    console.log('getUserFromRequest - no userId, returning null');
    return null;
  }
  
  // Try to find by username first, then by old ID for compatibility
  const user = users.find(u => u.username === userId) || USERS[userId] || null;
  console.log('getUserFromRequest - found user:', user ? user.username : 'null');
  return user;
}

// Helper function to get content type
function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  };
  return mimeTypes[ext] || 'text/plain';
}

// Helper function to parse JSON body
function parseBody(req, callback) {
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });
  req.on('end', () => {
    try {
      const parsed = body ? JSON.parse(body) : {};
      callback(null, parsed);
    } catch (error) {
      callback(error, null);
    }
  });
}

// Helper function to send JSON response
function sendJSON(res, data, statusCode = 200) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

// Helper function to send error
function sendError(res, message, statusCode = 400) {
  sendJSON(res, { error: message }, statusCode);
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  console.log(`${method} ${pathname}`);

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  // API Routes
  if (pathname.startsWith('/api/')) {
    
    // Get current user info
    if (pathname === '/api/auth/user' && method === 'GET') {
      const user = getUserFromRequest(req);
      if (!user) {
        sendError(res, 'User not found', 401);
        return;
      }
      sendJSON(res, {
        ...user,
        permissions: USER_ROLES[user.role].permissions,
        allowedStatuses: Object.keys(CASE_STATUSES)
      });
      return;
    }

    // Login endpoint with credentials
    if (pathname === '/api/auth/login' && method === 'POST') {
      parseBody(req, (err, body) => {
        if (err) {
          sendError(res, 'Invalid JSON');
          return;
        }
        
        const { username, password } = body;
        
        if (!username || !password) {
          sendError(res, 'Username and password are required', 400);
          return;
        }
        
        // Find user by username
        const user = users.find(u => u.username === username && u.isActive);
        
        if (!user || user.password !== password) {
          sendError(res, 'Invalid credentials', 401);
          return;
        }
        
        // Generate simple session token (in production, use proper JWT or session management)
        const sessionToken = 'session_' + user.username + '_' + Date.now();
        
        currentUser = user;
        sendJSON(res, {
          success: true,
          user: {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role,
            email: user.email,
            sessionToken
          },
          permissions: USER_ROLES[user.role].permissions,
          allowedStatuses: Object.keys(CASE_STATUSES)
        });
      });
      return;
    }
    
    // Signup endpoint
    if (pathname === '/api/auth/signup' && method === 'POST') {
      parseBody(req, (err, body) => {
        if (err) {
          sendError(res, 'Invalid JSON');
          return;
        }
        
        const { username, password, name, email, role } = body;
        
        // Validate required fields
        if (!username || !password || !name || !email || !role) {
          sendError(res, 'All fields are required', 400);
          return;
        }
        
        // Validate role
        if (!USER_ROLES[role]) {
          sendError(res, 'Invalid role', 400);
          return;
        }
        
        // Check if username already exists
        if (users.find(u => u.username === username)) {
          sendError(res, 'Username already exists', 409);
          return;
        }
        
        // Check if email already exists
        if (users.find(u => u.email === email)) {
          sendError(res, 'Email already exists', 409);
          return;
        }
        
        // Check role limits
        if (!canAddRole(role)) {
          const counts = getRoleCounts();
          sendError(res, `Role limit reached. Current: ${counts[role]}/${ROLE_LIMITS[role]} for ${role}`, 409);
          return;
        }
        
        // Check total user limit (10 users max)
        const activeUsers = users.filter(u => u.isActive).length;
        if (activeUsers >= 10) {
          sendError(res, 'Maximum user limit reached (10 users)', 409);
          return;
        }
        
        // Generate new user ID
        const newUserId = Math.max(...users.map(u => u.id), 0) + 1;
        
        // Create new user
        const newUser = {
          id: newUserId,
          username: username.toLowerCase(),
          password: hashPassword(password),
          name,
          email: email.toLowerCase(),
          role,
          createdAt: new Date().toISOString(),
          isActive: true
        };
        
        users.push(newUser);
        syncUsersObject();
        saveData();
        
        sendJSON(res, {
          success: true,
          message: 'User created successfully',
          user: {
            id: newUser.id,
            username: newUser.username,
            name: newUser.name,
            role: newUser.role,
            email: newUser.email
          }
        }, 201);
      });
      return;
    }

    // Get user role information and limits
    if (pathname === '/api/auth/roles' && method === 'GET') {
      const counts = getRoleCounts();
      const roleInfo = Object.keys(USER_ROLES).map(roleKey => ({
        key: roleKey,
        name: USER_ROLES[roleKey].name,
        permissions: USER_ROLES[roleKey].permissions,
        limit: ROLE_LIMITS[roleKey],
        current: counts[roleKey],
        available: ROLE_LIMITS[roleKey] - counts[roleKey] > 0
      }));
      
      const totalUsers = users.filter(u => u.isActive).length;
      
      sendJSON(res, {
        roles: roleInfo,
        totalUsers,
        maxUsers: 10,
        canAddUser: totalUsers < 10
      });
      return;
    }

    // Get all users (for assignment dropdown)
    if (pathname === '/api/users' && method === 'GET') {
      const user = getUserFromRequest(req);
      if (!user || !hasPermission(user, 'read')) {
        sendError(res, 'Unauthorized', 403);
        return;
      }
      
      const userList = users.map(u => ({
        id: u.id,
        name: u.name,
        username: u.username,
        email: u.email,
        role: u.role
      }));
      sendJSON(res, userList);
      return;
    }

    // Create new user (admin only)
    if (pathname === '/api/users' && method === 'POST') {
      const user = getUserFromRequest(req);
      if (!user || (user.role !== 'admin' && user.role !== 'ADMIN')) {
        sendError(res, 'Unauthorized - Admin access required', 403);
        return;
      }

      const body = await parseJSON(req);
      if (!body.username || !body.name || !body.role || !body.password) {
        sendError(res, 'Missing required fields: username, name, role, password', 400);
        return;
      }

      // Check if username already exists
      if (users.find(u => u.username === body.username)) {
        sendError(res, 'Username already exists', 400);
        return;
      }

      try {
        const newUser = await dbManager.createUser({
          username: body.username,
          name: body.name,
          email: body.email || '',
          role: body.role,
          password: body.password // In production, hash this password
        });

        // Update in-memory users array
        users.push(newUser);
        syncUsersObject();

        sendJSON(res, { success: true, user: { id: newUser.id, username: newUser.username, name: newUser.name, role: newUser.role } });
      } catch (error) {
        console.error('Error creating user:', error);
        sendError(res, 'Failed to create user', 500);
      }
      return;
    }

    // Update existing user (admin only)
    if (pathname.match(/^\/api\/users\/(\d+)$/) && method === 'PUT') {
      const user = getUserFromRequest(req);
      if (!user || (user.role !== 'admin' && user.role !== 'ADMIN')) {
        sendError(res, 'Unauthorized - Admin access required', 403);
        return;
      }

      const userId = parseInt(pathname.split('/')[3]);
      const body = await parseJSON(req);

      const existingUser = users.find(u => u.id === userId);
      if (!existingUser) {
        sendError(res, 'User not found', 404);
        return;
      }

      // Check if new username conflicts with other users
      if (body.username && body.username !== existingUser.username) {
        if (users.find(u => u.username === body.username && u.id !== userId)) {
          sendError(res, 'Username already exists', 400);
          return;
        }
      }

      try {
        const updateData = {
          username: body.username || existingUser.username,
          name: body.name || existingUser.name,
          email: body.email || existingUser.email,
          role: body.role || existingUser.role
        };

        // Only update password if provided
        if (body.password) {
          updateData.password = body.password; // In production, hash this password
        }

        const updatedUser = await dbManager.updateUser(userId, updateData, user.username);

        // Update in-memory users array
        const userIndex = users.findIndex(u => u.id === userId);
        if (userIndex !== -1) {
          users[userIndex] = { ...users[userIndex], ...updateData };
          syncUsersObject();
        }

        sendJSON(res, { success: true, user: { id: updatedUser.id, username: updatedUser.username, name: updatedUser.name, role: updatedUser.role } });
      } catch (error) {
        console.error('Error updating user:', error);
        sendError(res, 'Failed to update user', 500);
      }
      return;
    }

    // Delete user (admin only)
    if (pathname.match(/^\/api\/users\/(\d+)$/) && method === 'DELETE') {
      const user = getUserFromRequest(req);
      if (!user || (user.role !== 'admin' && user.role !== 'ADMIN')) {
        sendError(res, 'Unauthorized - Admin access required', 403);
        return;
      }

      const userId = parseInt(pathname.split('/')[3]);
      const existingUser = users.find(u => u.id === userId);
      
      if (!existingUser) {
        sendError(res, 'User not found', 404);
        return;
      }

      // Prevent deleting the last admin user
      if (existingUser.role === 'admin' || existingUser.role === 'ADMIN') {
        const adminCount = users.filter(u => u.role === 'admin' || u.role === 'ADMIN').length;
        if (adminCount <= 1) {
          sendError(res, 'Cannot delete the last admin user', 400);
          return;
        }
      }

      try {
        await dbManager.deleteUser(userId, user.username);

        // Remove from in-memory users array
        const userIndex = users.findIndex(u => u.id === userId);
        if (userIndex !== -1) {
          users.splice(userIndex, 1);
          syncUsersObject();
        }

        sendJSON(res, { success: true, message: 'User deleted successfully' });
      } catch (error) {
        console.error('Error deleting user:', error);
        sendError(res, 'Failed to delete user', 500);
      }
      return;
    }

    // Get workflow info
    if (pathname === '/api/workflow' && method === 'GET') {
      const user = getUserFromRequest(req);
      if (!user || !hasPermission(user, 'read')) {
        sendError(res, 'Unauthorized', 403);
        return;
      }
      
      sendJSON(res, {
        statuses: CASE_STATUSES,
        roles: USER_ROLES
      });
      return;
    }
    
    // Get all cases
    if (pathname === '/api/cases' && method === 'GET') {
      const user = getUserFromRequest(req);
      if (!user || !hasPermission(user, 'read')) {
        sendError(res, 'Unauthorized', 403);
        return;
      }

      const { status, priority, assignedTo } = parsedUrl.query;
      let filteredCases = [...cases];

      if (status && status !== 'All') {
        filteredCases = filteredCases.filter(c => c.status === status);
      }
      if (priority && priority !== 'All') {
        filteredCases = filteredCases.filter(c => c.priority === priority);
      }
      if (assignedTo && assignedTo !== 'All') {
        filteredCases = filteredCases.filter(c => c.assignedTo === assignedTo);
      }

      sendJSON(res, filteredCases);
      return;
    }

    // Get single case
    const caseIdMatch = pathname.match(/^\/api\/cases\/(\d+)$/);
    if (caseIdMatch && method === 'GET') {
      const user = getUserFromRequest(req);
      if (!user || !hasPermission(user, 'read')) {
        sendError(res, 'Unauthorized', 403);
        return;
      }

      const caseId = parseInt(caseIdMatch[1]);
      const caseItem = cases.find(c => c.id === caseId);
      
      if (!caseItem) {
        sendError(res, 'Case not found', 404);
        return;
      }
      
      sendJSON(res, caseItem);
      return;
    }

    // Create new case
    if (pathname === '/api/cases' && method === 'POST') {
      const user = getUserFromRequest(req);
      if (!user || !hasPermission(user, 'create')) {
        sendError(res, 'Unauthorized - insufficient permissions', 403);
        return;
      }

      parseBody(req, (err, body) => {
        if (err) {
          sendError(res, 'Invalid JSON');
          return;
        }

        const { title, description, priority, assignedTo } = body;
        
        if (!title || !description) {
          sendError(res, 'Title and description are required');
          return;
        }

        const newCase = {
          id: nextCaseId++,
          title,
          description,
          status: 'Open',
          priority: priority || 'Medium',
          assignedTo: assignedTo || 'Unassigned',
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: user.id,
          comments: [
            { 
              id: nextCommentId++, 
              text: `Case created by ${user.name}`, 
              timestamp: new Date(), 
              author: user.name 
            }
          ]
        };

        cases.push(newCase);
        nextCaseId++;
        saveData(); // Save data after creating new case
        sendJSON(res, newCase, 201);
      });
      return;
    }

    // Update case
    if (caseIdMatch && method === 'PUT') {
      const user = getUserFromRequest(req);
      const caseId = parseInt(caseIdMatch[1]);
      const caseIndex = cases.findIndex(c => c.id === caseId);
      
      if (caseIndex === -1) {
        sendError(res, 'Case not found', 404);
        return;
      }

      parseBody(req, (err, body) => {
        if (err) {
          sendError(res, 'Invalid JSON');
          return;
        }

        const { title, description, status, priority, assignedTo } = body;
        const caseItem = cases[caseIndex];
        const changes = [];

        // Check permissions for different operations
        if (status && status !== caseItem.status) {
          if (!hasPermission(user, 'update_status')) {
            sendError(res, 'Unauthorized - cannot change status', 403);
            return;
          }
          
          if (!canTransitionStatus(caseItem.status, status, caseItem)) {
            sendError(res, `Invalid status transition from ${caseItem.status} to ${status}`, 400);
            return;
          }
          
          // Track previous status when putting on hold
          if (status === 'Hold') {
            caseItem.previousStatus = caseItem.status;
            changes.push(`Status changed from ${caseItem.status} to ${status} (will resume from ${caseItem.status})`);
          } else if (caseItem.status === 'Hold') {
            // Clear previous status when resuming from hold
            changes.push(`Status changed from Hold to ${status} (resumed)`);
            delete caseItem.previousStatus;
          } else {
            changes.push(`Status changed from ${caseItem.status} to ${status}`);
          }
          
          caseItem.status = status;
        }

        if (assignedTo && assignedTo !== caseItem.assignedTo) {
          if (!hasPermission(user, 'assign')) {
            sendError(res, 'Unauthorized - cannot assign cases', 403);
            return;
          }
          changes.push(`Assigned to ${assignedTo}`);
          caseItem.assignedTo = assignedTo;
        }

        // Only admin can edit title/description
        if ((title && title !== caseItem.title) || (description && description !== caseItem.description)) {
          if (user.role !== 'ADMIN') {
            sendError(res, 'Unauthorized - only admin can edit case details', 403);
            return;
          }
          if (title) {
            changes.push(`Title updated`);
            caseItem.title = title;
          }
          if (description) {
            changes.push(`Description updated`);
            caseItem.description = description;
          }
        }

        if (priority && priority !== caseItem.priority) {
          if (!hasPermission(user, 'update_status')) {
            sendError(res, 'Unauthorized - cannot change priority', 403);
            return;
          }
          changes.push(`Priority changed from ${caseItem.priority} to ${priority}`);
          caseItem.priority = priority;
        }
        
        if (changes.length > 0) {
          caseItem.updatedAt = new Date();
          
          // Add comment for changes
          caseItem.comments.push({
            id: nextCommentId++,
            text: changes.join('; '),
            timestamp: new Date(),
            author: user.name
          });
        }

        saveData(); // Save data after updating case
        sendJSON(res, caseItem);
      });
      return;
    }

    // Delete case
    if (caseIdMatch && method === 'DELETE') {
      const user = getUserFromRequest(req);
      if (!user || !hasPermission(user, 'delete')) {
        sendError(res, 'Unauthorized - insufficient permissions', 403);
        return;
      }

      const caseId = parseInt(caseIdMatch[1]);
      const caseIndex = cases.findIndex(c => c.id === caseId);
      
      if (caseIndex === -1) {
        sendError(res, 'Case not found', 404);
        return;
      }

      cases.splice(caseIndex, 1);
      saveData(); // Save data after deleting case
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      res.end();
      return;
    }

    // Add comment to case
    const commentMatch = pathname.match(/^\/api\/cases\/(\d+)\/comments$/);
    if (commentMatch && method === 'POST') {
      const user = getUserFromRequest(req);
      if (!user || !hasPermission(user, 'read')) {
        sendError(res, 'Unauthorized', 403);
        return;
      }

      const caseId = parseInt(commentMatch[1]);
      const caseItem = cases.find(c => c.id === caseId);
      
      if (!caseItem) {
        sendError(res, 'Case not found', 404);
        return;
      }

      parseBody(req, (err, body) => {
        if (err) {
          sendError(res, 'Invalid JSON');
          return;
        }

        const { text } = body;
        
        if (!text) {
          sendError(res, 'Comment text is required');
          return;
        }

        const newComment = {
          id: nextCommentId++,
          text,
          timestamp: new Date(),
          author: user.name
        };

        caseItem.comments.push(newComment);
        caseItem.updatedAt = new Date();
        nextCommentId++;
        saveData(); // Save data after adding comment

        sendJSON(res, newComment, 201);
      });
      return;
    }

    // If no API route matched
    sendError(res, 'API endpoint not found', 404);
    return;
  }

  // Handle simple login redirect
  if (pathname === '/login' && method === 'GET') {
    const userId = parsedUrl.query.user;
    if (userId && USERS[userId]) {
      // Redirect to main app with user in query
      res.writeHead(302, {
        'Location': `/app?user=${userId}`
      });
      res.end();
    } else {
      res.writeHead(302, {
        'Location': '/'
      });
      res.end();
    }
    return;
  }

  // Serve simple login page
  if (pathname === '/simple' && method === 'GET') {
    const filePath = path.join(__dirname, 'public', 'simple-login.html');
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Server error');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
    return;
  }

  // Serve static files
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(__dirname, 'public', filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('File not found');
      } else {
        res.writeHead(500);
        res.end('Server error');
      }
      return;
    }

    const contentType = getContentType(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, async () => {
  console.log(`Case Workflow Server running on http://localhost:${PORT}`);
  await loadData(); // Load existing data on server start
});

// Graceful shutdown handlers
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT. Saving data and shutting down gracefully...');
  await saveData();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nReceived SIGTERM. Saving data and shutting down gracefully...');
  await saveData();
  process.exit(0);
});

// Save data periodically (every 5 minutes)
setInterval(() => {
  saveData();
  console.log('Periodic data backup completed');
}, 5 * 60 * 1000);
