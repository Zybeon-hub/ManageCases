const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Security configuration
const DEMO_MODE = process.env.DEMO_MODE === 'true' || !IS_PRODUCTION;
const MAX_REQUESTS_PER_MINUTE = 60;
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

// Rate limiting storage
const requestCounts = new Map();
const activeSessions = new Map();

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

// Secure user storage (in production, use proper database)
const USERS = {
  'lead1': { 
    id: 'lead1', 
    name: 'John Lead', 
    role: 'LEAD',
    password: DEMO_MODE ? 'demo123' : process.env.LEAD_PASSWORD || 'ChangeMe123!'
  },
  'manager1': { 
    id: 'manager1', 
    name: 'Jane Manager', 
    role: 'MANAGER',
    password: DEMO_MODE ? 'demo123' : process.env.MANAGER_PASSWORD || 'ChangeMe123!'
  },
  'admin1': { 
    id: 'admin1', 
    name: 'Mike Admin', 
    role: 'ADMIN',
    password: DEMO_MODE ? 'demo123' : process.env.ADMIN_PASSWORD || 'ChangeMe123!'
  },
  'ops1': { 
    id: 'ops1', 
    name: 'Sarah Ops', 
    role: 'OPS',
    password: DEMO_MODE ? 'demo123' : process.env.OPS1_PASSWORD || 'ChangeMe123!'
  },
  'ops2': { 
    id: 'ops2', 
    name: 'Tom Ops', 
    role: 'OPS',
    password: DEMO_MODE ? 'demo123' : process.env.OPS2_PASSWORD || 'ChangeMe123!'
  }
};

// Security functions
function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'salt').digest('hex');
}

function isValidSession(sessionToken) {
  const session = activeSessions.get(sessionToken);
  if (!session) return null;
  
  if (Date.now() - session.created > SESSION_TIMEOUT) {
    activeSessions.delete(sessionToken);
    return null;
  }
  
  return session;
}

function rateLimit(clientIP) {
  const now = Date.now();
  const windowStart = now - 60000; // 1 minute window
  
  if (!requestCounts.has(clientIP)) {
    requestCounts.set(clientIP, []);
  }
  
  const requests = requestCounts.get(clientIP);
  
  // Remove old requests
  while (requests.length > 0 && requests[0] < windowStart) {
    requests.shift();
  }
  
  // Add current request
  requests.push(now);
  
  return requests.length <= MAX_REQUESTS_PER_MINUTE;
}

function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[<>]/g, '') // Remove HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .trim()
    .substring(0, 1000); // Limit length
}

function validateCaseData(data) {
  if (!data.title || !data.description) {
    throw new Error('Title and description are required');
  }
  
  if (data.title.length > 200) {
    throw new Error('Title too long (max 200 characters)');
  }
  
  if (data.description.length > 2000) {
    throw new Error('Description too long (max 2000 characters)');
  }
  
  return {
    title: sanitizeInput(data.title),
    description: sanitizeInput(data.description),
    priority: ['Low', 'Medium', 'High'].includes(data.priority) ? data.priority : 'Medium',
    assignedTo: sanitizeInput(data.assignedTo) || 'Unassigned',
    status: data.status || 'Open'
  };
}

// Add security headers
function addSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  
  if (DEMO_MODE) {
    res.setHeader('X-Demo-Warning', 'This is a demo application - not for production use');
  }
}

console.log(`🔒 Security Mode: ${DEMO_MODE ? 'DEMO' : 'PRODUCTION'}`);
console.log(`🛡️ Rate Limit: ${MAX_REQUESTS_PER_MINUTE} requests/minute`);
console.log(`⏰ Session Timeout: ${SESSION_TIMEOUT / 1000 / 60} minutes`);

// [Rest of your existing server code would go here, but modified to use the secure functions above]

module.exports = {
  generateSessionToken,
  isValidSession,
  rateLimit,
  sanitizeInput,
  validateCaseData,
  addSecurityHeaders
};
