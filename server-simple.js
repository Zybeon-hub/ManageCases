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

// User roles and permissions
const USER_ROLES = {
  LEAD: { name: 'Lead', permissions: ['read'] },
  MANAGER: { name: 'Manager', permissions: ['read', 'update_status'] },
  ADMIN: { name: 'Admin', permissions: ['read', 'update_status', 'create', 'delete', 'assign'] },
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
  // Default admin user
  {
    id: 1,
    username: 'admin',
    password: 'admin123',
    email: 'admin@company.com',
    role: 'ADMIN',
    name: 'System Admin',
    createdAt: new Date().toISOString(),
    isActive: true
  }
];

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
    console.log('Saving data to database...');
    
    // Save users
    for (const user of users) {
      try {
        await dbManager.updateUser(user.id, user, 'system');
      } catch (error) {
        // If user doesn't exist, create it
        await dbManager.createUser(user);
      }
    }
    
    // Save cases
    for (const caseItem of cases) {
      try {
        await dbManager.updateCase(caseItem.id, caseItem, 'system');
      } catch (error) {
        // If case doesn't exist, create it
        await dbManager.createCase(caseItem);
      }
    }
    
    // Save counters as settings
    await dbManager.setSetting('nextCaseId', nextCaseId, 'number', 'system');
    await dbManager.setSetting('nextCommentId', nextCommentId, 'number', 'system');
    
    // Also save JSON versions for backwards compatibility
    ensureDataDirectory();
    fs.writeFileSync(CASES_FILE, JSON.stringify(cases, null, 2));
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    fs.writeFileSync(COUNTERS_FILE, JSON.stringify({
      nextCaseId,
      nextCommentId
    }, null, 2));
    
    console.log('Data saved successfully to both Excel/CSV and JSON formats');
  } catch (error) {
    console.error('Error saving data:', error);
  }
}

async function loadData() {
  try {
    console.log('Loading data from database...');
    
    // Load users
    const loadedUsers = await dbManager.getUsers();
    if (loadedUsers.length > 0) {
      users = loadedUsers;
      console.log(`Loaded ${users.length} users from database`);
    }
    
    // Load cases
    const loadedCases = await dbManager.getCases();
    if (loadedCases.length > 0) {
      cases = loadedCases;
      console.log(`Loaded ${cases.length} cases from database`);
    }
    
    // Load counters from settings
    const nextCaseIdSetting = await dbManager.getSetting('nextCaseId');
    const nextCommentIdSetting = await dbManager.getSetting('nextCommentId');
    nextCaseId = nextCaseIdSetting ? parseInt(nextCaseIdSetting.value) : 4;
    nextCommentId = nextCommentIdSetting ? parseInt(nextCommentIdSetting.value) : 1;
    
    // Sync USERS object for compatibility
    syncUsersObject();
    
    console.log(`Loaded counters: nextCaseId=${nextCaseId}, nextCommentId=${nextCommentId}`);
    
    // Fallback to JSON if database is empty
    if (users.length === 0 && cases.length === 0) {
      console.log('Database seems empty, trying JSON fallback...');
      await loadDataFromJSON();
    }
    
  } catch (error) {
    console.error('Error loading data from database:', error);
    console.log('Trying JSON fallback...');
    await loadDataFromJSON();
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
    
    // Save to database for future use
    await saveData();
    
  } catch (error) {
    console.error('Error loading data from JSON:', error);
    console.log('Using default data');
    syncUsersObject(); // Ensure USERS object is synced even on error
  }
}

// In-memory storage for cases
let cases = [
  {
    id: 1,
    title: "Customer Complaint - Product Defect",
    description: "Customer reports defective product received",
    status: "Open",
    priority: "High",
    assignedTo: "Sarah Ops",
    createdAt: new Date('2025-07-28'),
    updatedAt: new Date('2025-07-28'),
    createdBy: "admin1",
    comments: [
      { id: 1, text: "Initial complaint received via email", timestamp: new Date('2025-07-28'), author: "System" }
    ]
  },
  {
    id: 2,
    title: "Billing Inquiry",
    description: "Customer questioning charges on their account",
    status: "In Progress",
    priority: "Medium",
    assignedTo: "Tom Ops",
    createdAt: new Date('2025-07-29'),
    updatedAt: new Date('2025-07-30'),
    createdBy: "manager1",
    comments: [
      { id: 1, text: "Reviewing customer account", timestamp: new Date('2025-07-29'), author: "Tom Ops" },
      { id: 2, text: "Found discrepancy in billing system", timestamp: new Date('2025-07-30'), author: "Tom Ops" }
    ]
  },
  {
    id: 3,
    title: "Technical Support Request",
    description: "Customer unable to access their account",
    status: "Closed-Approved",
    priority: "Low",
    assignedTo: "Sarah Ops",
    createdAt: new Date('2025-07-26'),
    updatedAt: new Date('2025-07-27'),
    createdBy: "ops1",
    comments: [
      { id: 1, text: "Password reset sent to customer", timestamp: new Date('2025-07-26'), author: "Sarah Ops" },
      { id: 2, text: "Customer confirmed access restored", timestamp: new Date('2025-07-27'), author: "Sarah Ops" }
    ]
  }
];

let nextCaseId = 4;
let nextCommentId = 3;

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
  if (!userId) return null;
  
  // Try to find by username first, then by old ID for compatibility
  return users.find(u => u.username === userId) || USERS[userId] || null;
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
const server = http.createServer((req, res) => {
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
      
      const userList = Object.values(USERS).map(u => ({
        id: u.id,
        name: u.name,
        role: u.role
      }));
      sendJSON(res, userList);
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
