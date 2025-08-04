
// Database Manager for Case Workflow Application
const ApplicationDatabase = require('./application-database.js');

class DatabaseManager {
  constructor() {
    this.db = new ApplicationDatabase('./data', {
      format: 'json',
      autoBackup: true,
      backupInterval: 300000
    });
  }
  
  // User operations
  async createUser(userData) {
    try {
      return this.db.create('users', userData);
    } catch (error) {
      throw new Error(`Failed to create user: ${error.message}`);
    }
  }
  
  async getUsers(filters = {}) {
    return this.db.read('users', filters);
  }
  
  async getUserById(id) {
    return this.db.readById('users', id);
  }
  
  async getUserByUsername(username) {
    const users = this.db.read('users', { username });
    return users.length > 0 ? users[0] : null;
  }
  
  async updateUser(id, updates, updatedBy) {
    return this.db.update('users', id, updates, updatedBy);
  }
  
  async deleteUser(id, deletedBy) {
    return this.db.delete('users', id, deletedBy);
  }
  
  // Case operations
  async createCase(caseData) {
    return this.db.create('cases', caseData);
  }
  
  async getCases(filters = {}) {
    return this.db.read('cases', filters);
  }
  
  async getCaseById(id) {
    return this.db.readById('cases', id);
  }
  
  async updateCase(id, updates, updatedBy) {
    return this.db.update('cases', id, updates, updatedBy);
  }
  
  async deleteCase(id, deletedBy) {
    return this.db.delete('cases', id, deletedBy);
  }
  
  // Comment operations
  async createComment(commentData) {
    return this.db.create('comments', commentData);
  }
  
  async getCommentsByCase(caseId) {
    return this.db.read('comments', { caseId });
  }
  
  // Session operations
  async createSession(sessionData) {
    return this.db.create('sessions', sessionData);
  }
  
  async getSession(sessionId) {
    const sessions = this.db.read('sessions', { sessionId, isActive: true });
    return sessions.length > 0 ? sessions[0] : null;
  }
  
  async updateSession(sessionId, updates) {
    const sessions = this.db.read('sessions', { sessionId });
    if (sessions.length > 0) {
      return this.db.update('sessions', sessions[0].id, updates);
    }
    return null;
  }
  
  async expireSession(sessionId) {
    const sessions = this.db.read('sessions', { sessionId });
    if (sessions.length > 0) {
      return this.db.update('sessions', sessions[0].id, { isActive: false });
    }
    return false;
  }
  
  // Settings operations
  async getSetting(key) {
    const settings = this.db.read('settings', { key });
    if (settings.length > 0) {
      const setting = settings[0];
      // Parse JSON values
      if (setting.type === 'json') {
        try {
          return JSON.parse(setting.value);
        } catch (e) {
          return setting.value;
        }
      }
      // Parse numbers
      if (setting.type === 'number') {
        return parseFloat(setting.value);
      }
      return setting.value;
    }
    return null;
  }
  
  async setSetting(key, value, type = 'string', updatedBy = 'system') {
    const stringValue = typeof value === 'object' ? JSON.stringify(value) : value.toString();
    const existing = this.db.read('settings', { key });
    
    if (existing.length > 0) {
      return this.db.update('settings', existing[0].id, {
        value: stringValue,
        type,
        updatedAt: new Date(),
        updatedBy
      });
    } else {
      return this.db.create('settings', {
        key,
        value: stringValue,
        type,
        description: `Setting for ${key}`,
        updatedBy
      });
    }
  }
  
  // Audit operations
  async getAuditLogs(filters = {}) {
    return this.db.read('audit_log', filters);
  }
  
  // Database operations
  getStats() {
    return this.db.getStats();
  }
  
  createBackup() {
    return this.db.createBackup();
  }
  
  exportData() {
    return this.db.exportAll();
  }
  
  close() {
    this.db.close();
  }
}

module.exports = DatabaseManager;
