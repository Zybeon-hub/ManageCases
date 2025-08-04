# Case Workflow Management System

A role-based case workflow management application with persistent storage.

## Features
- Role-based access control (Lead, Manager, Admin, Ops)
- Forward-only workflow with status transitions
- Persistent data storage
- Real-time case management
- Comment system

## Deployment

### Local Development
```bash
npm install
npm start
```

### Environment Variables
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)

### Hosting Platforms

#### Render.com (Recommended)
1. Fork this repository to GitHub
2. Connect GitHub repo to Render
3. Set build command: `npm install`
4. Set start command: `npm start`
5. Deploy!

#### Railway
1. Connect GitHub repository
2. Deploy automatically

#### Heroku
```bash
git init
git add .
git commit -m "Initial commit"
heroku create your-app-name
git push heroku main
```

## Production Considerations
- For production, consider using a proper database (PostgreSQL, MongoDB)
- Add authentication middleware
- Set up SSL/HTTPS
- Configure logging
- Add monitoring

## Default Users
- **Lead**: John Lead (read-only)
- **Manager**: Jane Manager (read + status updates)
- **Admin**: Mike Admin (full access)
- **Ops**: Sarah Ops, Tom Ops (read + create + status updates)

## API Endpoints
- `POST /api/auth/login` - User authentication
- `GET /api/cases` - List cases
- `POST /api/cases` - Create case
- `PUT /api/cases/:id` - Update case
- `DELETE /api/cases/:id` - Delete case
- `GET /api/workflow` - Get workflow rules
