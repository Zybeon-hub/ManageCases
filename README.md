# Case Workflow Management System

🏆 **Competition Entry** - A complete case management solution with user authentication, role-based permissions, and real-time updates.

## 🚀 **Live Demo**
**URL:** [Your Render URL]  
**Admin Login:** admin / admin123  
**Demo User:** manager / manager123

A modern web application for managing case workflows with user authentication, role-based access control, and persistent data storage.

## ⚡ **Quick Start for Judges**

### System Requirements
- **Node.js 16+** (Download from [nodejs.org](https://nodejs.org))
- **Any operating system** (Windows, Mac, Linux)

### 🔧 **Setup Instructions** (2 minutes)

1. **Extract the ZIP file** to any folder (folder name doesn't matter)
2. **Open terminal/command prompt** in the extracted folder
3. **Install dependencies:**
   ```bash
   npm install
   ```
4. **Start the application:**
   ```bash
   npm start
   ```
5. **Open browser:** `http://localhost:3000`
6. **Login with demo credentials:** admin / admin123

### ✅ **Verification Steps**
- Login page should display with demo credentials in bottom-right corner
- Click "ℹ️ About" button to see project details
- Login as admin to access full features
- Test user management, case creation, and workflow features

## 🎯 **What Makes This Special**

- **Zero Configuration** - Works immediately after extraction
- **Self-Contained** - No external databases or APIs required
- **Demo Data Included** - Ready to test all features instantly
- **Cross-Platform** - Runs on any system with Node.js
- **Production Ready** - Already deployed and battle-tested

## Features

- **User Management**: Complete user authentication and role-based access control
- **Case Management**: Create, view, edit, and delete cases with full CRUD operations
- **Workflow Management**: Advanced status progression with workflow rules
- **Priority Management**: Assign and manage case priorities (High, Medium, Low)
- **Assignment System**: Assign cases to team members with dynamic user dropdowns
- **Comments System**: Add comments and track complete case history
- **Advanced Filtering**: Filter cases by status, priority, and assignee
- **Data Persistence**: JSON-based database with automatic backups
- **Audit Trail**: Complete logging of all changes and user activities
- **Responsive Design**: Modern UI that works on desktop and mobile devices

## Getting Started

### Prerequisites

- Node.js (version 14 or higher)
- npm (comes with Node.js)

### Installation

1. Clone the repository or navigate to the project directory
2. Install dependencies:
   ```bash
   npm install
   ```

### Running the Application

#### Production Mode
```bash
npm start
```

#### Development Mode (with auto-reload)
```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## Project Structure

```
case-workflow-app/
├── package.json          # Project dependencies and scripts
├── server-simple.js      # Express.js server with API endpoints and authentication
├── data/                 # JSON-based database files
│   ├── cases.json       # Case data
│   ├── users.json       # User accounts and roles
│   ├── comments.json    # Case comments
│   ├── audit_log.json   # Activity audit trail
│   ├── sessions.json    # User sessions
│   ├── settings.json    # Application settings
│   ├── counters.json    # ID counters
│   └── backups/         # Automatic backup directory
├── public/               # Frontend files
│   ├── index.html        # Main application (authenticated users)
│   ├── login.html        # Login page
│   ├── signup.html       # User registration page
│   ├── logout.html       # Logout page
│   ├── styles.css        # CSS styling
│   └── app.js           # Legacy frontend JavaScript
├── .env.example         # Environment variables template
├── .gitignore          # Git ignore rules
└── README.md            # This file
```

## API Endpoints

The application provides a comprehensive RESTful API with authentication:

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/signup` - User registration (admin only)

### Cases
- `GET /api/cases` - Get all cases (supports filtering, requires authentication)
- `GET /api/cases/:id` - Get a specific case
- `POST /api/cases` - Create a new case (requires appropriate permissions)
- `PUT /api/cases/:id` - Update a case (requires appropriate permissions)
- `DELETE /api/cases/:id` - Delete a case (requires delete permissions)

### Comments
- `POST /api/cases/:id/comments` - Add a comment to a case

### Users (Admin only)
- `GET /api/users` - Get all users
- `POST /api/users` - Create a new user
- `PUT /api/users/:id` - Update user information
- `DELETE /api/users/:id` - Delete a user

### Query Parameters for Filtering
- `status` - Filter by case status
- `priority` - Filter by case priority
- `assignedTo` - Filter by assignee

## User Roles and Permissions

The system supports four user roles with different permission levels:

- **ADMIN**: Full system access including user management
- **MANAGER**: Can view, create, edit cases and update status
- **LEAD**: Can view cases and update case status  
- **OPS**: Can view, create, assign cases and update status

## Default Login Credentials

For initial setup, use these default accounts:

- **Admin**: username: `admin`, password: `admin123`
- **Test User**: username: `testuser3`, password: `password123`

## Usage

### First Time Setup
1. Start the application using `npm start`
2. Navigate to `http://localhost:3000`
3. You'll be redirected to the login page
4. Use default admin credentials: username: `admin`, password: `admin123`

### User Management (Admin Only)
1. Click "Manage Users" button in the main interface
2. Add new users with appropriate roles
3. Edit existing user information
4. Delete users (except admin users)

### Creating a New Case
1. Click the "New Case" button
2. Fill in the required information (title and description)
3. Optionally set priority and assign to a team member
4. Click "Save Case"

### Managing Cases
- **View Details**: Click "View Details" on any case card to see full information and comments
- **Edit**: Click "Edit" to modify case information (permissions dependent)
- **Delete**: Click "Delete" to remove a case (requires delete permissions)
- **Filter**: Use the filter controls at the top to find specific cases

### Adding Comments
1. Open case details
2. Scroll to the comments section
3. Type your comment in the text area
4. Click "Add Comment"

### Case Workflow
Cases follow a defined workflow with status progression:
- **Open** → **Assigned** → **In Progress** → **Resolved** → **Closed-Approved/Closed-Reject**
- Cases can be put on **Hold** from any active status
- Only forward progression is allowed (no moving backward)
- Final states can only transition to **Reopen**

## Technology Stack

- **Backend**: Node.js with Express.js
- **Authentication**: Session-based authentication with secure tokens
- **Frontend**: Modern HTML5, CSS3, and Vanilla JavaScript
- **Styling**: Responsive CSS with flexbox and grid layouts
- **Data Storage**: JSON-based file system with automatic backups
- **Security**: Role-based access control and input validation

## Data Management

### Persistence
- All data is automatically saved to JSON files in the `data/` directory
- Data persists through server restarts
- Changes are saved immediately when made

### Automatic Backups
- System creates periodic backups of all data
- Backups are stored in `data/backups/` with timestamps
- Multiple backup versions are maintained for data recovery

### Audit Trail
- All user actions are logged for compliance and debugging
- Audit logs include user information, timestamps, and action details
- Logs are stored in `data/audit_log.json`

## Development Notes

- The application uses JSON-based file storage for data persistence
- All user actions are logged for audit and compliance purposes
- Role-based permissions are enforced on both frontend and backend
- Session management provides secure authentication
- Automatic backups ensure data recovery capabilities
- For enhanced security in production, consider HTTPS and environment-based configuration

## Production Deployment

### Environment Variables
Create a `.env` file based on `.env.example`:
```
PORT=3000
NODE_ENV=production
SESSION_SECRET=your-secure-session-secret-here
```

### Security Considerations
- Change default admin password immediately
- Use HTTPS in production
- Set secure session secrets
- Consider implementing rate limiting
- Regular backup verification

### Scaling Considerations
- For high-volume usage, consider migrating to a proper database (PostgreSQL, MongoDB)
- Implement caching for better performance
- Add load balancing for multiple server instances
- Consider real-time updates with WebSockets

## Browser Support

The application supports all modern browsers including:
- Chrome 70+
- Firefox 65+
- Safari 12+
- Edge 79+
