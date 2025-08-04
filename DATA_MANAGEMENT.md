# Case Workflow Data Management

This application now includes persistent data storage using JSON files.

## Data Storage Location
- **Data Directory**: `c:\Cases\data\`
- **Cases File**: `c:\Cases\data\cases.json`
- **Counters File**: `c:\Cases\data\counters.json`

## Features
- ✅ **Auto-save**: Data is automatically saved when:
  - Cases are created, updated, or deleted
  - Comments are added
  - Status changes occur
- ✅ **Auto-load**: Data is loaded when server starts
- ✅ **Graceful shutdown**: Data is saved when server is stopped (Ctrl+C)
- ✅ **Periodic backup**: Data is automatically backed up every 5 minutes
- ✅ **Persistent counters**: Case and comment IDs continue from where they left off

## Manual Data Management

### Create a Backup
```powershell
# Create backup folder
mkdir backups
# Copy data files with timestamp
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
Copy-Item data\cases.json backups\cases_$timestamp.json
Copy-Item data\counters.json backups\counters_$timestamp.json
```

### Restore from Backup
```powershell
# Stop the server first (Ctrl+C)
# Then restore from a backup
Copy-Item backups\cases_2025-07-31_14-30-00.json data\cases.json
Copy-Item backups\counters_2025-07-31_14-30-00.json data\counters.json
# Restart the server
```

### Reset Data
```powershell
# Stop the server first
# Delete data files to start fresh
Remove-Item data\*.json
# Restart the server (will create default data)
```

## Data Format

### cases.json
```json
[
  {
    "id": 1,
    "title": "Case Title",
    "description": "Case description",
    "status": "Open",
    "priority": "High",
    "assignedTo": "User Name",
    "createdAt": "2025-07-31T...",
    "updatedAt": "2025-07-31T...",
    "createdBy": "user_id",
    "previousStatus": "In Progress",
    "comments": [
      {
        "id": 1,
        "text": "Comment text",
        "timestamp": "2025-07-31T...",
        "author": "Author Name"
      }
    ]
  }
]
```

### counters.json
```json
{
  "nextCaseId": 5,
  "nextCommentId": 10
}
```

## Benefits
- **Data Persistence**: Your cases and comments survive server restarts
- **No Data Loss**: Multiple save points ensure data safety
- **Easy Backup**: JSON format is human-readable and easy to backup
- **Portable**: Can easily move data between environments
- **Version Control**: Can track data changes over time
