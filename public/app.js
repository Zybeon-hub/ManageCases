class CaseWorkflowApp {
    constructor() {
        this.cases = [];
        this.currentUser = null;
        this.userPermissions = [];
        this.allowedStatuses = [];
        this.currentEditingCase = null;
        this.init();
    }

    init() {
        console.log('App initializing...');
        this.setupEventListeners();
        // Force show login screen immediately
        setTimeout(() => {
            this.showLoginScreen();
        }, 100);
    }

    async checkAuthStatus() {
        console.log('Checking auth status...');
        // For demo, show login screen
        this.showLoginScreen();
    }

    showLoginScreen() {
        console.log('Showing login screen...');
        const loginSection = document.getElementById('login-section');
        const appSection = document.getElementById('app-section');
        
        if (loginSection) {
            loginSection.classList.remove('hidden');
            loginSection.style.display = 'flex';
            console.log('Login section shown');
        } else {
            console.error('Login section not found!');
        }
        
        if (appSection) {
            appSection.classList.add('hidden');
            appSection.style.display = 'none';
        }
    }

    showAppScreen() {
        document.getElementById('login-section').classList.add('hidden');
        document.getElementById('app-section').classList.remove('hidden');
    }

    setupEventListeners() {
        console.log('Setting up event listeners...');
        
        // Setup after a small delay to ensure DOM is ready
        setTimeout(() => {
            // Login user selection
            const userOptions = document.querySelectorAll('.user-option');
            console.log('Found user options:', userOptions.length);
            
            userOptions.forEach((option, index) => {
                console.log(`Setting up option ${index}:`, option.dataset.user);
                option.addEventListener('click', (e) => {
                    console.log('User option clicked:', e.currentTarget.dataset.user);
                    const userId = e.currentTarget.dataset.user;
                    this.login(userId);
                });
                
                // Also add a simple onclick as backup
                option.onclick = (e) => {
                    console.log('Backup onclick triggered:', e.currentTarget.dataset.user);
                    const userId = e.currentTarget.dataset.user;
                    this.login(userId);
                };
            });
        }, 200);

        // ...existing code...

        // Logout button
        document.getElementById('logout-btn').addEventListener('click', () => {
            this.logout();
        });

        // New case button
        document.getElementById('new-case-btn').addEventListener('click', () => {
            if (this.hasPermission('create')) {
                this.openNewCaseModal();
            } else {
                this.showToast('You do not have permission to create cases', 'error');
            }
        });

        // Filter change events
        document.getElementById('status-filter').addEventListener('change', () => {
            this.loadCases();
        });
        document.getElementById('priority-filter').addEventListener('change', () => {
            this.loadCases();
        });
        document.getElementById('assignee-filter').addEventListener('change', () => {
            this.loadCases();
        });

        // Refresh button
        document.getElementById('refresh-btn').addEventListener('click', () => {
            this.loadCases();
        });

        // Modal close buttons
        document.querySelectorAll('.close').forEach(closeBtn => {
            closeBtn.addEventListener('click', (e) => {
                this.closeModal(e.target.closest('.modal'));
            });
        });

        // Modal backdrop click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeModal(modal);
                }
            });
        });

        // Case form submission
        document.getElementById('case-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitCaseForm();
        });

        // Cancel button
        document.getElementById('cancel-btn').addEventListener('click', () => {
            this.closeModal(document.getElementById('case-modal'));
        });
    }

    async login(userId) {
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ userId })
            });

            if (response.ok) {
                this.currentUser = await response.json();
                this.userPermissions = this.currentUser.permissions;
                this.allowedStatuses = this.currentUser.allowedStatuses;
                
                // Update UI
                document.getElementById('current-user-name').textContent = this.currentUser.name;
                document.getElementById('current-user-role').textContent = this.currentUser.role;
                
                // Show/hide buttons based on permissions
                this.updateUIForPermissions();
                
                this.showAppScreen();
                this.loadCases();
                this.showToast(`Welcome, ${this.currentUser.name}!`, 'success');
            } else {
                throw new Error('Login failed');
            }
        } catch (error) {
            this.showToast('Login failed', 'error');
            console.error('Login error:', error);
        }
    }

    logout() {
        this.currentUser = null;
        this.userPermissions = [];
        this.cases = [];
        this.showLoginScreen();
        this.showToast('Logged out successfully', 'info');
    }

    hasPermission(permission) {
        return this.userPermissions.includes(permission);
    }

    updateUIForPermissions() {
        // Show/hide new case button
        if (this.hasPermission('create')) {
            document.getElementById('new-case-btn').classList.remove('hidden');
        } else {
            document.getElementById('new-case-btn').classList.add('hidden');
        }
    }

    async makeAuthenticatedRequest(url, options = {}) {
        return fetch(url, {
            ...options,
            headers: {
                ...options.headers,
                'X-User-Id': this.currentUser?.id || 'admin1'
            }
        });
    }

    async loadCases() {
        if (!this.currentUser) return;
        
        this.showLoading(true);
        
        try {
            const status = document.getElementById('status-filter').value;
            const priority = document.getElementById('priority-filter').value;
            const assignedTo = document.getElementById('assignee-filter').value;

            const params = new URLSearchParams();
            if (status !== 'All') params.append('status', status);
            if (priority !== 'All') params.append('priority', priority);
            if (assignedTo !== 'All') params.append('assignedTo', assignedTo);

            const response = await this.makeAuthenticatedRequest(`/api/cases?${params}`);
            
            if (response.ok) {
                this.cases = await response.json();
                this.renderCases();
            } else {
                throw new Error('Failed to load cases');
            }
        } catch (error) {
            this.showToast('Error loading cases', 'error');
            console.error('Error loading cases:', error);
        } finally {
            this.showLoading(false);
        }
    }

    renderCases() {
        const container = document.getElementById('cases-container');
        
        if (this.cases.length === 0) {
            container.innerHTML = '<div class="no-cases">No cases found matching the current filters.</div>';
            return;
        }

        container.innerHTML = this.cases.map(caseItem => this.createCaseCard(caseItem)).join('');
    }

    createCaseCard(caseItem) {
        const formattedDate = new Date(caseItem.updatedAt).toLocaleDateString();
        const statusClass = caseItem.status.toLowerCase().replace(/\s+/g, '-');
        const priorityClass = caseItem.priority.toLowerCase();

        // Determine which actions are available
        const canEdit = this.hasPermission('update_status') || this.currentUser.role === 'ADMIN';
        const canDelete = this.hasPermission('delete');

        let actionsHtml = '';
        if (canEdit) {
            actionsHtml += `<button class="btn-secondary" onclick="app.editCase(${caseItem.id})">Edit</button>`;
        }
        if (canDelete) {
            actionsHtml += `<button class="btn-danger" onclick="app.deleteCase(${caseItem.id})">Delete</button>`;
        }

        return `
            <div class="case-card" data-case-id="${caseItem.id}">
                <div class="case-header">
                    <div>
                        <div class="case-title">${this.escapeHtml(caseItem.title)}</div>
                        <div class="case-id">Case #${caseItem.id}</div>
                    </div>
                    <div class="case-actions">
                        ${actionsHtml}
                    </div>
                </div>
                <div class="case-description">${this.escapeHtml(caseItem.description)}</div>
                <div class="case-meta">
                    <div>
                        <span class="status-badge status-${statusClass}">${caseItem.status}</span>
                        <span class="priority-badge priority-${priorityClass}">${caseItem.priority}</span>
                    </div>
                    <div>Updated: ${formattedDate}</div>
                </div>
                <div class="case-assignee">
                    <strong>Assigned to:</strong> ${this.escapeHtml(caseItem.assignedTo)}
                </div>
                <div style="margin-top: 10px;">
                    <button class="btn-primary" onclick="app.viewCaseDetails(${caseItem.id})">View Details</button>
                </div>
            </div>
        `;
    }

    openNewCaseModal() {
        this.currentEditingCase = null;
        document.getElementById('modal-title').textContent = 'New Case';
        document.getElementById('case-form').reset();
        this.showModal(document.getElementById('case-modal'));
    }

    async editCase(caseId) {
        try {
            const response = await this.makeAuthenticatedRequest(`/api/cases/${caseId}`);
            
            if (response.ok) {
                const caseItem = await response.json();
                
                this.currentEditingCase = caseItem;
                document.getElementById('modal-title').textContent = 'Edit Case';
                document.getElementById('case-title').value = caseItem.title;
                document.getElementById('case-description').value = caseItem.description;
                document.getElementById('case-priority').value = caseItem.priority;
                document.getElementById('case-assignee').value = caseItem.assignedTo;
                
                // Add status selection if user can update status
                this.updateEditFormForPermissions(caseItem);
                
                this.showModal(document.getElementById('case-modal'));
            } else {
                throw new Error('Failed to load case');
            }
        } catch (error) {
            this.showToast('Error loading case details', 'error');
            console.error('Error loading case:', error);
        }
    }

    updateEditFormForPermissions(caseItem) {
        // Add status field if user can update status
        if (this.hasPermission('update_status')) {
            const priorityGroup = document.getElementById('case-priority').closest('.form-group');
            
            // Check if status field already exists
            if (!document.getElementById('case-status')) {
                const statusGroup = document.createElement('div');
                statusGroup.className = 'form-group';
                statusGroup.innerHTML = `
                    <label for="case-status">Status</label>
                    <select id="case-status">
                        ${this.allowedStatuses.map(status => 
                            `<option value="${status}" ${status === caseItem.status ? 'selected' : ''}>${status}</option>`
                        ).join('')}
                    </select>
                `;
                priorityGroup.parentNode.insertBefore(statusGroup, priorityGroup);
            } else {
                document.getElementById('case-status').value = caseItem.status;
            }
        }
    }

    async deleteCase(caseId) {
        if (!this.hasPermission('delete')) {
            this.showToast('You do not have permission to delete cases', 'error');
            return;
        }

        if (!confirm('Are you sure you want to delete this case?')) {
            return;
        }

        try {
            const response = await this.makeAuthenticatedRequest(`/api/cases/${caseId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                this.showToast('Case deleted successfully', 'success');
                this.loadCases();
            } else {
                throw new Error('Failed to delete case');
            }
        } catch (error) {
            this.showToast('Error deleting case', 'error');
            console.error('Error deleting case:', error);
        }
    }

    async viewCaseDetails(caseId) {
        try {
            const response = await this.makeAuthenticatedRequest(`/api/cases/${caseId}`);
            
            if (response.ok) {
                const caseItem = await response.json();
                this.renderCaseDetails(caseItem);
                this.showModal(document.getElementById('details-modal'));
            } else {
                throw new Error('Failed to load case details');
            }
        } catch (error) {
            this.showToast('Error loading case details', 'error');
            console.error('Error loading case details:', error);
        }
    }

    renderCaseDetails(caseItem) {
        const formattedCreated = new Date(caseItem.createdAt).toLocaleString();
        const formattedUpdated = new Date(caseItem.updatedAt).toLocaleString();
        const statusClass = caseItem.status.toLowerCase().replace(/\s+/g, '-');
        const priorityClass = caseItem.priority.toLowerCase();

        const detailsContainer = document.getElementById('case-details');
        detailsContainer.innerHTML = `
            <div class="case-details-content">
                <div class="details-header">
                    <div class="details-title">${this.escapeHtml(caseItem.title)}</div>
                    <div class="case-id">Case #${caseItem.id}</div>
                </div>
                
                <div class="details-meta">
                    <div class="meta-item">
                        <div class="meta-label">Status</div>
                        <div class="meta-value">
                            <span class="status-badge status-${statusClass}">${caseItem.status}</span>
                        </div>
                    </div>
                    <div class="meta-item">
                        <div class="meta-label">Priority</div>
                        <div class="meta-value">
                            <span class="priority-badge priority-${priorityClass}">${caseItem.priority}</span>
                        </div>
                    </div>
                    <div class="meta-item">
                        <div class="meta-label">Assigned To</div>
                        <div class="meta-value">${this.escapeHtml(caseItem.assignedTo)}</div>
                    </div>
                    <div class="meta-item">
                        <div class="meta-label">Created</div>
                        <div class="meta-value">${formattedCreated}</div>
                    </div>
                    <div class="meta-item">
                        <div class="meta-label">Last Updated</div>
                        <div class="meta-value">${formattedUpdated}</div>
                    </div>
                </div>

                <div class="meta-item">
                    <div class="meta-label">Description</div>
                    <div class="meta-value">${this.escapeHtml(caseItem.description)}</div>
                </div>

                <div class="comments-section">
                    <h4>Comments (${caseItem.comments.length})</h4>
                    <div class="comments-list">
                        ${caseItem.comments.map(comment => this.createCommentHtml(comment)).join('')}
                    </div>
                    
                    <div class="add-comment">
                        <textarea id="new-comment-text" placeholder="Add a comment..."></textarea>
                        <button class="btn-primary" onclick="app.addComment(${caseItem.id})">Add Comment</button>
                    </div>
                </div>
            </div>
        `;
    }

    createCommentHtml(comment) {
        const formattedTime = new Date(comment.timestamp).toLocaleString();
        return `
            <div class="comment">
                <div class="comment-header">
                    <span class="comment-author">${this.escapeHtml(comment.author)}</span>
                    <span class="comment-time">${formattedTime}</span>
                </div>
                <div class="comment-text">${this.escapeHtml(comment.text)}</div>
            </div>
        `;
    }

    async addComment(caseId) {
        const commentText = document.getElementById('new-comment-text').value.trim();
        if (!commentText) {
            this.showToast('Please enter a comment', 'error');
            return;
        }

        try {
            const response = await this.makeAuthenticatedRequest(`/api/cases/${caseId}/comments`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: commentText
                })
            });

            if (response.ok) {
                this.showToast('Comment added successfully', 'success');
                document.getElementById('new-comment-text').value = '';
                // Refresh the case details
                this.viewCaseDetails(caseId);
            } else {
                throw new Error('Failed to add comment');
            }
        } catch (error) {
            this.showToast('Error adding comment', 'error');
            console.error('Error adding comment:', error);
        }
    }

    async submitCaseForm() {
        const title = document.getElementById('case-title').value.trim();
        const description = document.getElementById('case-description').value.trim();
        const priority = document.getElementById('case-priority').value;
        const assignedTo = document.getElementById('case-assignee').value;
        const status = document.getElementById('case-status')?.value;

        if (!title || !description) {
            this.showToast('Please fill in all required fields', 'error');
            return;
        }

        const caseData = {
            title,
            description,
            priority,
            assignedTo
        };

        if (status) {
            caseData.status = status;
        }

        try {
            let response;
            if (this.currentEditingCase) {
                // Update existing case
                response = await this.makeAuthenticatedRequest(`/api/cases/${this.currentEditingCase.id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(caseData)
                });
            } else {
                // Create new case
                response = await this.makeAuthenticatedRequest('/api/cases', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(caseData)
                });
            }

            if (response.ok) {
                const message = this.currentEditingCase ? 'Case updated successfully' : 'Case created successfully';
                this.showToast(message, 'success');
                this.closeModal(document.getElementById('case-modal'));
                this.loadCases();
                
                // Clean up status field if it was added
                const statusField = document.getElementById('case-status');
                if (statusField) {
                    statusField.closest('.form-group').remove();
                }
            } else {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to save case');
            }
        } catch (error) {
            this.showToast(`Error saving case: ${error.message}`, 'error');
            console.error('Error saving case:', error);
        }
    }

    showModal(modal) {
        modal.classList.remove('hidden');
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }

    closeModal(modal) {
        modal.classList.remove('show');
        modal.classList.add('hidden');
        document.body.style.overflow = '';
        
        // Clean up status field if it was added
        const statusField = document.getElementById('case-status');
        if (statusField) {
            statusField.closest('.form-group').remove();
        }
    }

    showLoading(show) {
        const loading = document.getElementById('loading');
        if (show) {
            loading.classList.remove('hidden');
        } else {
            loading.classList.add('hidden');
        }
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;

        const container = document.getElementById('toast-container');
        container.appendChild(toast);

        // Remove toast after 3 seconds
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Test function for debugging
window.testLogin = function(userId) {
    console.log('Test login called with:', userId);
    alert('Login clicked: ' + userId);
    if (window.app) {
        window.app.login(userId);
    }
};

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing app...');
    window.app = new CaseWorkflowApp();
    console.log('App initialized:', window.app);
});
