const fs = require('fs');
const path = require('path');

/**
 * Advanced Database Manager for Case Workflow Application
 * Supports multiple storage formats: JSON, CSV/Excel, SQLite-like operations
 */
class ApplicationDatabase {
  constructor(dataDir = './data', options = {}) {
    this.dataDir = dataDir;
    this.options = {
      format: options.format || 'json', // 'json', 'csv', 'hybrid'
      autoBackup: options.autoBackup !== false,
      backupInterval: options.backupInterval || 300000, // 5 minutes
      compression: options.compression || false,
      encryption: options.encryption || false,
      ...options
    };
    
    // Database schema
    this.schema = {
      users: {
        fields: ['id', 'username', 'password', 'email', 'role', 'name', 'createdAt', 'updatedAt', 'isActive', 'lastLogin', 'loginCount'],
        indexes: ['username', 'email', 'role'],
        constraints: {
          username: { unique: true, required: true },
          email: { unique: true, required: true },
          role: { enum: ['ADMIN', 'MANAGER', 'LEAD', 'OPS'] }
        }
      },
      cases: {
        fields: ['id', 'title', 'description', 'status', 'priority', 'assignedTo', 'createdAt', 'updatedAt', 'createdBy', 'dueDate', 'category', 'tags'],
        indexes: ['status', 'priority', 'assignedTo', 'createdBy'],
        constraints: {
          title: { required: true },
          status: { enum: ['Open', 'Assigned', 'In Progress', 'Stage 1 Investigation', 'Stage 2 Investigation', 'Stage 3 Investigation', 'Hold', 'Closed-Approved', 'Closed-Reject', 'Reopen'] },
          priority: { enum: ['Low', 'Medium', 'High', 'Critical'] }
        }
      },
      comments: {
        fields: ['id', 'caseId', 'text', 'timestamp', 'author', 'type', 'attachments'],
        indexes: ['caseId', 'author', 'timestamp'],
        constraints: {
          caseId: { required: true, foreignKey: 'cases.id' },
          text: { required: true }
        }
      },
      audit_log: {
        fields: ['id', 'timestamp', 'userId', 'action', 'entity', 'entityId', 'oldData', 'newData', 'ipAddress'],
        indexes: ['timestamp', 'userId', 'action', 'entity'],
        constraints: {
          action: { required: true },
          entity: { required: true }
        }
      },
      sessions: {
        fields: ['sessionId', 'userId', 'createdAt', 'expiresAt', 'ipAddress', 'userAgent', 'isActive'],
        indexes: ['sessionId', 'userId', 'expiresAt'],
        constraints: {
          sessionId: { unique: true, required: true }
        }
      },
      settings: {
        fields: ['key', 'value', 'type', 'description', 'updatedAt', 'updatedBy'],
        indexes: ['key'],
        constraints: {
          key: { unique: true, required: true }
        }
      }
    };
    
    this.data = {};
    this.counters = {};
    this.backupTimer = null;
    
    this.initialize();
  }
  
  // Initialize database
  initialize() {
    this.ensureDirectory();
    this.loadAllData();
    this.startAutoBackup();
    this.initializeDefaultData();
  }
  
  ensureDirectory() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    
    // Create backup directory
    const backupDir = path.join(this.dataDir, 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
  }
  
  // Generate file paths based on format
  getFilePath(tableName, format = null) {
    const fmt = format || this.options.format;
    const ext = fmt === 'csv' ? 'csv' : 'json';
    return path.join(this.dataDir, `${tableName}.${ext}`);
  }
  
  // Load all data from files
  loadAllData() {
    console.log('Loading application database...');
    
    Object.keys(this.schema).forEach(tableName => {
      this.data[tableName] = this.loadTable(tableName);
    });
    
    this.loadCounters();
    console.log('Database loaded successfully');
  }
  
  // Load single table
  loadTable(tableName) {
    const filePath = this.getFilePath(tableName);
    
    try {
      if (fs.existsSync(filePath)) {
        if (this.options.format === 'csv') {
          return this.loadCSV(filePath);
        } else {
          const data = fs.readFileSync(filePath, 'utf8');
          return JSON.parse(data);
        }
      }
    } catch (error) {
      console.error(`Error loading table ${tableName}:`, error.message);
    }
    
    return [];
  }
  
  // Load CSV format
  loadCSV(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.trim().split('\n');
      
      if (lines.length <= 1) return [];
      
      const headers = lines[0].split(',').map(h => h.trim());
      const data = [];
      
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim()) {
          const values = this.parseCSVLine(lines[i]);
          const obj = {};
          
          headers.forEach((header, index) => {
            let value = values[index] || '';
            
            // Auto-convert types
            if (value === 'true') value = true;
            else if (value === 'false') value = false;
            else if (value && !isNaN(value) && !isNaN(parseFloat(value))) {
              value = parseInt(value);
            } else if (value && value.includes('T') && value.includes('Z')) {
              // ISO date string
              value = new Date(value);
            }
            
            obj[header] = value;
          });
          
          data.push(obj);
        }
      }
      
      return data;
    } catch (error) {
      console.error('Error loading CSV:', error);
      return [];
    }
  }
  
  // Parse CSV line with proper quote handling
  parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"' && inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }
  
  // Save all data to files
  saveAllData() {
    Object.keys(this.schema).forEach(tableName => {
      this.saveTable(tableName);
    });
    
    this.saveCounters();
    this.log('system', 'database_save', 'all_tables', null, { timestamp: new Date() });
  }
  
  // Save single table
  saveTable(tableName) {
    const filePath = this.getFilePath(tableName);
    const data = this.data[tableName] || [];
    
    try {
      if (this.options.format === 'csv') {
        this.saveCSV(filePath, data, this.schema[tableName].fields);
      } else {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
      }
    } catch (error) {
      console.error(`Error saving table ${tableName}:`, error);
    }
  }
  
  // Save CSV format
  saveCSV(filePath, data, fields) {
    let content = fields.join(',') + '\n';
    
    data.forEach(item => {
      const row = fields.map(field => {
        let value = item[field] || '';
        if (value instanceof Date) {
          value = value.toISOString();
        }
        // Escape CSV values
        if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
          value = '"' + value.replace(/"/g, '""') + '"';
        }
        return value;
      });
      content += row.join(',') + '\n';
    });
    
    fs.writeFileSync(filePath, content, 'utf8');
  }
  
  // Load/Save counters
  loadCounters() {
    const filePath = path.join(this.dataDir, 'counters.json');
    try {
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        this.counters = JSON.parse(data);
      } else {
        this.counters = {
          users: 1,
          cases: 1,
          comments: 1,
          audit_log: 1,
          sessions: 1
        };
      }
    } catch (error) {
      console.error('Error loading counters:', error);
      this.counters = { users: 1, cases: 1, comments: 1, audit_log: 1, sessions: 1 };
    }
  }
  
  saveCounters() {
    const filePath = path.join(this.dataDir, 'counters.json');
    fs.writeFileSync(filePath, JSON.stringify(this.counters, null, 2), 'utf8');
  }
  
  // Get next ID for a table
  getNextId(tableName) {
    if (!this.counters[tableName]) {
      this.counters[tableName] = 1;
    }
    return this.counters[tableName]++;
  }
  
  // Initialize default data
  initializeDefaultData() {
    // Default admin user
    if (!this.data.users || this.data.users.length === 0) {
      this.data.users = [{
        id: this.getNextId('users'),
        username: 'admin',
        password: 'admin123',
        email: 'admin@company.com',
        role: 'ADMIN',
        name: 'System Administrator',
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true,
        lastLogin: null,
        loginCount: 0
      }];
    }
    
    // Default settings
    if (!this.data.settings || this.data.settings.length === 0) {
      this.data.settings = [
        { key: 'app_name', value: 'Case Workflow Management', type: 'string', description: 'Application name', updatedAt: new Date(), updatedBy: 'system' },
        { key: 'max_users', value: '10', type: 'number', description: 'Maximum number of users', updatedAt: new Date(), updatedBy: 'system' },
        { key: 'role_limits', value: JSON.stringify({ ADMIN: 2, MANAGER: 2, LEAD: 2, OPS: 4 }), type: 'json', description: 'Role-based user limits', updatedAt: new Date(), updatedBy: 'system' },
        { key: 'session_timeout', value: '3600', type: 'number', description: 'Session timeout in seconds', updatedAt: new Date(), updatedBy: 'system' }
      ];
    }
    
    // Initialize empty arrays for other tables
    ['cases', 'comments', 'audit_log', 'sessions'].forEach(tableName => {
      if (!this.data[tableName]) {
        this.data[tableName] = [];
      }
    });
    
    this.saveAllData();
  }
  
  // CRUD Operations
  
  // Create record
  create(tableName, data) {
    if (!this.schema[tableName]) {
      throw new Error(`Table ${tableName} not found in schema`);
    }
    
    // Validate data
    this.validateData(tableName, data);
    
    // Add metadata
    const record = {
      id: this.getNextId(tableName),
      ...data,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Add to memory
    if (!this.data[tableName]) this.data[tableName] = [];
    this.data[tableName].push(record);
    
    // Save to file
    this.saveTable(tableName);
    this.saveCounters();
    
    // Log action
    this.log(data.createdBy || 'system', 'create', tableName, record.id, record);
    
    return record;
  }
  
  // Read records
  read(tableName, query = {}) {
    if (!this.data[tableName]) return [];
    
    let results = this.data[tableName];
    
    // Apply filters
    Object.keys(query).forEach(key => {
      if (query[key] !== undefined && query[key] !== null) {
        results = results.filter(record => {
          if (typeof query[key] === 'object' && query[key].$like) {
            return record[key] && record[key].toString().toLowerCase().includes(query[key].$like.toLowerCase());
          }
          return record[key] === query[key];
        });
      }
    });
    
    return results;
  }
  
  // Read single record by ID
  readById(tableName, id) {
    if (!this.data[tableName]) return null;
    return this.data[tableName].find(record => record.id === id);
  }
  
  // Update record
  update(tableName, id, updates, updatedBy = 'system') {
    if (!this.data[tableName]) return null;
    
    const index = this.data[tableName].findIndex(record => record.id === id);
    if (index === -1) return null;
    
    const oldData = { ...this.data[tableName][index] };
    
    // Validate updates
    this.validateData(tableName, updates, true);
    
    // Apply updates
    this.data[tableName][index] = {
      ...this.data[tableName][index],
      ...updates,
      updatedAt: new Date()
    };
    
    // Save to file
    this.saveTable(tableName);
    
    // Log action
    this.log(updatedBy, 'update', tableName, id, { oldData, newData: this.data[tableName][index] });
    
    return this.data[tableName][index];
  }
  
  // Delete record
  delete(tableName, id, deletedBy = 'system') {
    if (!this.data[tableName]) return false;
    
    const index = this.data[tableName].findIndex(record => record.id === id);
    if (index === -1) return false;
    
    const deletedRecord = this.data[tableName][index];
    this.data[tableName].splice(index, 1);
    
    // Save to file
    this.saveTable(tableName);
    
    // Log action
    this.log(deletedBy, 'delete', tableName, id, deletedRecord);
    
    return true;
  }
  
  // Validate data against schema
  validateData(tableName, data, isUpdate = false) {
    const schema = this.schema[tableName];
    if (!schema) return;
    
    const constraints = schema.constraints || {};
    
    Object.keys(constraints).forEach(field => {
      const constraint = constraints[field];
      const value = data[field];
      
      // Required field check (only for create operations)
      if (!isUpdate && constraint.required && (value === undefined || value === null || value === '')) {
        throw new Error(`Field ${field} is required for table ${tableName}`);
      }
      
      // Unique field check
      if (constraint.unique && value !== undefined) {
        const existing = this.data[tableName]?.find(record => record[field] === value);
        if (existing) {
          throw new Error(`Field ${field} must be unique. Value '${value}' already exists`);
        }
      }
      
      // Enum check
      if (constraint.enum && value !== undefined && !constraint.enum.includes(value)) {
        throw new Error(`Field ${field} must be one of: ${constraint.enum.join(', ')}`);
      }
    });
  }
  
  // Audit logging
  log(userId, action, entity, entityId, data) {
    const logEntry = {
      id: this.getNextId('audit_log'),
      timestamp: new Date(),
      userId: userId || 'system',
      action,
      entity,
      entityId,
      oldData: data?.oldData ? JSON.stringify(data.oldData) : null,
      newData: data?.newData ? JSON.stringify(data.newData) : JSON.stringify(data),
      ipAddress: '127.0.0.1' // This would come from request in real app
    };
    
    if (!this.data.audit_log) this.data.audit_log = [];
    this.data.audit_log.push(logEntry);
    
    // Keep only last 1000 log entries to prevent file bloat
    if (this.data.audit_log.length > 1000) {
      this.data.audit_log = this.data.audit_log.slice(-1000);
    }
    
    this.saveTable('audit_log');
  }
  
  // Backup operations
  createBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(this.dataDir, 'backups', timestamp);
    
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    // Copy all data files
    Object.keys(this.schema).forEach(tableName => {
      const sourceFile = this.getFilePath(tableName);
      const backupFile = path.join(backupDir, path.basename(sourceFile));
      
      if (fs.existsSync(sourceFile)) {
        fs.copyFileSync(sourceFile, backupFile);
      }
    });
    
    // Copy counters
    const countersFile = path.join(this.dataDir, 'counters.json');
    if (fs.existsSync(countersFile)) {
      fs.copyFileSync(countersFile, path.join(backupDir, 'counters.json'));
    }
    
    console.log(`Backup created: ${backupDir}`);
    return backupDir;
  }
  
  // Auto backup
  startAutoBackup() {
    if (this.options.autoBackup && !this.backupTimer) {
      this.backupTimer = setInterval(() => {
        this.createBackup();
      }, this.options.backupInterval);
    }
  }
  
  stopAutoBackup() {
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
      this.backupTimer = null;
    }
  }
  
  // Get database statistics
  getStats() {
    const stats = {
      tables: {},
      totalRecords: 0,
      lastBackup: null,
      databaseSize: 0
    };
    
    Object.keys(this.schema).forEach(tableName => {
      const recordCount = this.data[tableName]?.length || 0;
      stats.tables[tableName] = {
        records: recordCount,
        fields: this.schema[tableName].fields.length
      };
      stats.totalRecords += recordCount;
    });
    
    return stats;
  }
  
  // Export all data
  exportAll(format = 'json') {
    const exportData = {
      metadata: {
        exportDate: new Date(),
        version: '1.0',
        format: format
      },
      data: this.data,
      counters: this.counters,
      schema: this.schema
    };
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const exportFile = path.join(this.dataDir, `export_${timestamp}.json`);
    
    fs.writeFileSync(exportFile, JSON.stringify(exportData, null, 2), 'utf8');
    console.log(`Database exported to: ${exportFile}`);
    
    return exportFile;
  }
  
  // Close database
  close() {
    this.stopAutoBackup();
    this.saveAllData();
    console.log('Database closed');
  }
}

module.exports = ApplicationDatabase;
