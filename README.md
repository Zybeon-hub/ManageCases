# Case Workflow Management System

A modern web application for managing case workflows with a clean and intuitive interface.

## Features

- **Case Management**: Create, view, edit, and delete cases
- **Status Tracking**: Track cases through different statuses (Open, In Progress, Resolved, Closed)
- **Priority Management**: Assign priorities (High, Medium, Low) to cases
- **Assignment**: Assign cases to team members
- **Comments System**: Add comments and track case history
- **Filtering**: Filter cases by status, priority, and assignee
- **Responsive Design**: Works on desktop and mobile devices

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
├── server.js             # Express.js server with API endpoints
├── public/               # Frontend files
│   ├── index.html        # Main HTML file
│   ├── styles.css        # CSS styling
│   └── app.js           # Frontend JavaScript
└── README.md            # This file
```

## API Endpoints

The application provides a RESTful API for case management:

### Cases
- `GET /api/cases` - Get all cases (supports filtering)
- `GET /api/cases/:id` - Get a specific case
- `POST /api/cases` - Create a new case
- `PUT /api/cases/:id` - Update a case
- `DELETE /api/cases/:id` - Delete a case

### Comments
- `POST /api/cases/:id/comments` - Add a comment to a case

### Query Parameters for Filtering
- `status` - Filter by case status
- `priority` - Filter by case priority
- `assignedTo` - Filter by assignee

## Usage

### Creating a New Case
1. Click the "New Case" button
2. Fill in the required information (title and description)
3. Optionally set priority and assign to a team member
4. Click "Save Case"

### Managing Cases
- **View Details**: Click "View Details" on any case card to see full information and comments
- **Edit**: Click "Edit" to modify case information
- **Delete**: Click "Delete" to remove a case (with confirmation)
- **Filter**: Use the filter controls at the top to find specific cases

### Adding Comments
1. Open case details
2. Scroll to the comments section
3. Type your comment in the text area
4. Click "Add Comment"

## Technology Stack

- **Backend**: Node.js with Express.js
- **Frontend**: Vanilla HTML, CSS, and JavaScript
- **Styling**: Modern CSS with flexbox and grid layouts
- **Data Storage**: In-memory storage (for demo purposes)

## Customization

### Adding New Team Members
Edit the `assignee-filter` select options in `index.html` and the corresponding options in the case form.

### Modifying Case Statuses
Update the status options in both the HTML filters and the server-side validation.

### Styling
All styles are contained in `public/styles.css` and can be customized as needed.

## Development Notes

- The application uses in-memory storage, so data will be lost when the server restarts
- For production use, integrate with a proper database (PostgreSQL, MongoDB, etc.)
- Add authentication and authorization for multi-user environments
- Consider adding real-time updates with WebSockets for collaborative features

## Browser Support

The application supports all modern browsers including:
- Chrome 70+
- Firefox 65+
- Safari 12+
- Edge 79+
