const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const querystring = require('querystring');

const PORT = process.env.PORT || 3000;

// Data file paths
const DATA_DIR = path.join(__dirname, 'data');
const CASES_FILE = path.join(DATA_DIR, 'cases.json');
const COUNTERS_FILE = path.join(DATA_DIR, 'counters.json');

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

// Mock users for demo
const USERS = {
  'lead1': { id: 'lead1', name: 'John Lead', role: 'LEAD' },
  'manager1': { id: 'manager1', name: 'Jane Manager', role: 'MANAGER' },
  'admin1': { id: 'admin1', name: 'Mike Admin', role: 'ADMIN' },
  'ops1': { id: 'ops1', name: 'Sarah Ops', role: 'OPS' },
  'ops2': { id: 'ops2', name: 'Tom Ops', role: 'OPS' }
};

// Current session (in real app, use proper session management)
let currentUser = null;

// Data persistence functions
function ensureDataDirectory() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log('Created data directory:', DATA_DIR);
  }
}

function saveData() {
  try {
    ensureDataDirectory();
    
    // Save cases
    fs.writeFileSync(CASES_FILE, JSON.stringify(cases, null, 2));
    
    // Save counters
    const counters = {
      nextCaseId,
      nextCommentId
    };
    fs.writeFileSync(COUNTERS_FILE, JSON.stringify(counters, null, 2));
    
    console.log('Data saved successfully');
  } catch (error) {
    console.error('Error saving data:', error);
  }
}

function loadData() {
  try {
    ensureDataDirectory();
    
    // Load cases if file exists
    if (fs.existsSync(CASES_FILE)) {
      const casesData = fs.readFileSync(CASES_FILE, 'utf8');
      cases = JSON.parse(casesData);
      console.log(`Loaded ${cases.length} cases from storage`);
    } else {
      console.log('No existing cases file, using default data');
    }
    
    // Load counters if file exists
    if (fs.existsSync(COUNTERS_FILE)) {
      const countersData = fs.readFileSync(COUNTERS_FILE, 'utf8');
      const counters = JSON.parse(countersData);
      nextCaseId = counters.nextCaseId || 4;
      nextCommentId = counters.nextCommentId || 3;
      console.log(`Loaded counters: nextCaseId=${nextCaseId}, nextCommentId=${nextCommentId}`);
    } else {
      console.log('No existing counters file, using defaults');
    }
  } catch (error) {
    console.error('Error loading data:', error);
    console.log('Using default data');
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
  // In a real app, extract from JWT token or session
  const userId = req.headers['x-user-id'] || 'admin1'; // Default for demo
  return USERS[userId] || null;
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

    // Login endpoint
    if (pathname === '/api/auth/login' && method === 'POST') {
      parseBody(req, (err, body) => {
        if (err) {
          sendError(res, 'Invalid JSON');
          return;
        }
        
        const { userId } = body;
        const user = USERS[userId];
        
        if (!user) {
          sendError(res, 'Invalid user', 401);
          return;
        }
        
        currentUser = user;
        sendJSON(res, {
          ...user,
          permissions: USER_ROLES[user.role].permissions,
          allowedStatuses: Object.keys(CASE_STATUSES)
        });
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

server.listen(PORT, () => {
  console.log(`Case Workflow Server running on http://localhost:${PORT}`);
  loadData(); // Load existing data on server start
});

// Graceful shutdown handlers
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT. Saving data and shutting down gracefully...');
  saveData();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM. Saving data and shutting down gracefully...');
  saveData();
  process.exit(0);
});

// Save data periodically (every 5 minutes)
setInterval(() => {
  saveData();
  console.log('Periodic data backup completed');
}, 5 * 60 * 1000);
