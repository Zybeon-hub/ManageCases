const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// In-memory storage for cases (in production, you'd use a database)
let cases = [
  {
    id: 1,
    title: "Customer Complaint - Product Defect",
    description: "Customer reports defective product received",
    status: "Open",
    priority: "High",
    assignedTo: "John Doe",
    createdAt: new Date('2025-07-28'),
    updatedAt: new Date('2025-07-28'),
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
    assignedTo: "Jane Smith",
    createdAt: new Date('2025-07-29'),
    updatedAt: new Date('2025-07-30'),
    comments: [
      { id: 1, text: "Reviewing customer account", timestamp: new Date('2025-07-29'), author: "Jane Smith" },
      { id: 2, text: "Found discrepancy in billing system", timestamp: new Date('2025-07-30'), author: "Jane Smith" }
    ]
  },
  {
    id: 3,
    title: "Technical Support Request",
    description: "Customer unable to access their account",
    status: "Resolved",
    priority: "Low",
    assignedTo: "Mike Johnson",
    createdAt: new Date('2025-07-26'),
    updatedAt: new Date('2025-07-27'),
    comments: [
      { id: 1, text: "Password reset sent to customer", timestamp: new Date('2025-07-26'), author: "Mike Johnson" },
      { id: 2, text: "Customer confirmed access restored", timestamp: new Date('2025-07-27'), author: "Mike Johnson" }
    ]
  }
];

let nextCaseId = 4;
let nextCommentId = 3;

// Routes

// Get all cases
app.get('/api/cases', (req, res) => {
  const { status, priority, assignedTo } = req.query;
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

  res.json(filteredCases);
});

// Get single case
app.get('/api/cases/:id', (req, res) => {
  const caseId = parseInt(req.params.id);
  const caseItem = cases.find(c => c.id === caseId);
  
  if (!caseItem) {
    return res.status(404).json({ error: 'Case not found' });
  }
  
  res.json(caseItem);
});

// Create new case
app.post('/api/cases', (req, res) => {
  const { title, description, priority, assignedTo } = req.body;
  
  if (!title || !description) {
    return res.status(400).json({ error: 'Title and description are required' });
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
    comments: [
      { 
        id: nextCommentId++, 
        text: "Case created", 
        timestamp: new Date(), 
        author: "System" 
      }
    ]
  };

  cases.push(newCase);
  res.status(201).json(newCase);
});

// Update case
app.put('/api/cases/:id', (req, res) => {
  const caseId = parseInt(req.params.id);
  const caseIndex = cases.findIndex(c => c.id === caseId);
  
  if (caseIndex === -1) {
    return res.status(404).json({ error: 'Case not found' });
  }

  const { title, description, status, priority, assignedTo } = req.body;
  const caseItem = cases[caseIndex];

  // Update fields if provided
  if (title) caseItem.title = title;
  if (description) caseItem.description = description;
  if (status) caseItem.status = status;
  if (priority) caseItem.priority = priority;
  if (assignedTo) caseItem.assignedTo = assignedTo;
  
  caseItem.updatedAt = new Date();

  res.json(caseItem);
});

// Add comment to case
app.post('/api/cases/:id/comments', (req, res) => {
  const caseId = parseInt(req.params.id);
  const caseItem = cases.find(c => c.id === caseId);
  
  if (!caseItem) {
    return res.status(404).json({ error: 'Case not found' });
  }

  const { text, author } = req.body;
  
  if (!text) {
    return res.status(400).json({ error: 'Comment text is required' });
  }

  const newComment = {
    id: nextCommentId++,
    text,
    timestamp: new Date(),
    author: author || 'Anonymous'
  };

  caseItem.comments.push(newComment);
  caseItem.updatedAt = new Date();

  res.status(201).json(newComment);
});

// Delete case
app.delete('/api/cases/:id', (req, res) => {
  const caseId = parseInt(req.params.id);
  const caseIndex = cases.findIndex(c => c.id === caseId);
  
  if (caseIndex === -1) {
    return res.status(404).json({ error: 'Case not found' });
  }

  cases.splice(caseIndex, 1);
  res.status(204).send();
});

// Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Case Workflow Server running on http://localhost:${PORT}`);
});
