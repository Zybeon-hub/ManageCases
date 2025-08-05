class CaseWorkflowApp {
    constructor() {
        this.cases = [];
        this.currentUser = null;
        this.userPermissions = [];
        this.allowedStatuses = [];
        this.currentEditingCase = null;
        this.allUsers = []; // Store all users for dropdowns
        this.init();
    }

    init() {
        console.log('App initializing...');
        this.checkAuthStatus();
    }

    async checkAuthStatus() {
        console.log('Checking auth status...');
        
        // Check if user is already logged in
        const sessionToken = localStorage.getItem('sessionToken');
        const currentUser = localStorage.getItem('currentUser');
        
        console.log('SessionToken:', sessionToken ? 'exists' : 'none');
        console.log('CurrentUser:', currentUser ? 'exists' : 'none');
        
        if (sessionToken && currentUser) {
            try {
                // Parse user data
                const userData = JSON.parse(currentUser);
                console.log('Parsed user data:', userData);
                
                // Verify session is still valid by checking user info
                const response = await fetch('/api/auth/user', {
                    method: 'GET',
                    headers: {
                        'X-User-Id': userData.username || userData.id
                    }
                });
                
                console.log('Auth verification response:', response.status);
                
                if (response.ok) {
                    // Session is valid, show app
                    const userInfo = await response.json();
                    console.log('User info received:', userInfo);
                    this.currentUser = userInfo;
                    this.userPermissions = userInfo.permissions || [];
                    this.allowedStatuses = userInfo.allowedStatuses || [];
                    this.showAppScreen();
                    this.setupEventListeners();
                    this.updateUIForPermissions(); // Ensure UI is updated for permissions
                    await this.loadUsers(); // Load users for dropdowns first
                    this.loadCases();
                    return;
                } else {
                    console.log('Auth verification failed, clearing storage');
                    localStorage.removeItem('sessionToken');
                    localStorage.removeItem('currentUser');
                    localStorage.removeItem('userPermissions');
                }
            } catch (error) {
                console.log('Session verification failed:', error);
                localStorage.removeItem('sessionToken');
                localStorage.removeItem('currentUser');
                localStorage.removeItem('userPermissions');
            }
        }
        
        // No valid session, redirect to login
        console.log('No valid session, redirecting to login');
        console.log('Current location:', window.location.href);
        
        // Only redirect if not already on login page
        if (!window.location.pathname.includes('login.html')) {
            console.log('Redirecting to login page...');
            window.location.href = '/login.html';
        }
    }

    showAppScreen() {
        console.log('Showing app screen...');
        const authCheck = document.getElementById('auth-check');
        const appSection = document.getElementById('app-section');
        
        if (authCheck) {
            authCheck.classList.add('hidden');
            authCheck.style.display = 'none';
        }
        
        if (appSection) {
            appSection.classList.remove('hidden');
            appSection.style.display = 'block';
        }
        
        console.log('App screen should now be visible');
    }

    setupEventListeners() {
        console.log('Setting up event listeners...');
        
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

        // Manage users button (admin only)
        document.getElementById('manage-users-btn').addEventListener('click', () => {
            this.showUserManagement();
        });

        // Add user button
        document.getElementById('add-user-btn').addEventListener('click', () => {
            this.openNewUserModal();
        });

        // Refresh users button
        document.getElementById('refresh-users-btn').addEventListener('click', () => {
            this.loadAndDisplayUsers();
        });

        // User form submit
        document.getElementById('user-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveUser();
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
        // Clear stored authentication data
        localStorage.removeItem('sessionToken');
        localStorage.removeItem('currentUser');
        localStorage.removeItem('userPermissions');
        
        // Reset app state
        this.currentUser = null;
        this.userPermissions = [];
        this.cases = [];
        
        // Redirect to login page
        window.location.href = '/login.html';
    }

    hasPermission(permission) {
        return this.userPermissions.includes(permission);
    }

    updateUIForPermissions() {
        console.log('updateUIForPermissions called');
        console.log('Current user:', this.currentUser);
        console.log('User role:', this.currentUser?.role);
        
        // Show/hide new case button
        if (this.hasPermission('create')) {
            document.getElementById('new-case-btn').classList.remove('hidden');
        } else {
            document.getElementById('new-case-btn').classList.add('hidden');
        }

        // Show/hide manage users button (admin only)
        const manageUsersBtn = document.getElementById('manage-users-btn');
        console.log('Manage users button element:', manageUsersBtn);
        
        if (this.currentUser && (this.currentUser.role === 'admin' || this.currentUser.role === 'ADMIN')) {
            console.log('User is admin, showing manage users button');
            if (manageUsersBtn) {
                manageUsersBtn.classList.remove('hidden');
            }
        } else {
            console.log('User is not admin, hiding manage users button');
            if (manageUsersBtn) {
                manageUsersBtn.classList.add('hidden');
            }
        }
    }

    async makeAuthenticatedRequest(url, options = {}) {
        if (!this.currentUser) {
            throw new Error('Not authenticated');
        }
        
        return fetch(url, {
            ...options,
            headers: {
                ...options.headers,
                'X-User-Id': this.currentUser.username || this.currentUser.id
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

    // User management methods
    async loadUsers() {
        try {
            const response = await this.makeAuthenticatedRequest('/api/users');
            if (response.ok) {
                this.allUsers = await response.json();
                this.updateUserDropdowns();
                return this.allUsers;
            }
        } catch (error) {
            console.error('Error loading users:', error);
            this.showToast('Failed to load users', 'error');
        }
        return [];
    }

    updateUserDropdowns() {
        // Update assignee filter dropdown
        const assigneeFilter = document.getElementById('assignee-filter');
        if (assigneeFilter) {
            const currentValue = assigneeFilter.value;
            assigneeFilter.innerHTML = '<option value="All">All</option>';
            
            this.allUsers.forEach(user => {
                const option = document.createElement('option');
                option.value = user.username || user.name;
                option.textContent = user.name || user.username;
                assigneeFilter.appendChild(option);
            });
            
            // Add unassigned option
            const unassignedOption = document.createElement('option');
            unassignedOption.value = 'Unassigned';
            unassignedOption.textContent = 'Unassigned';
            assigneeFilter.appendChild(unassignedOption);
            
            // Restore previous selection
            assigneeFilter.value = currentValue;
        }

        // Update case assignee dropdown
        const caseAssignee = document.getElementById('case-assignee');
        if (caseAssignee) {
            const currentValue = caseAssignee.value;
            caseAssignee.innerHTML = '<option value="Unassigned">Unassigned</option>';
            
            this.allUsers.forEach(user => {
                const option = document.createElement('option');
                option.value = user.username || user.name;
                option.textContent = user.name || user.username;
                caseAssignee.appendChild(option);
            });
            
            // Restore previous selection
            caseAssignee.value = currentValue;
        }
    }

    // User Management UI methods
    showUserManagement() {
        if (!this.currentUser || (this.currentUser.role !== 'admin' && this.currentUser.role !== 'ADMIN')) {
            this.showToast('You do not have permission to manage users', 'error');
            return;
        }
        
        this.loadAndDisplayUsers();
        this.showModal(document.getElementById('user-modal'));
    }

    async loadAndDisplayUsers() {
        const usersList = document.getElementById('users-list');
        usersList.innerHTML = '<div class="loading">Loading users...</div>';
        
        try {
            const users = await this.loadUsers();
            this.displayUsersList(users);
        } catch (error) {
            usersList.innerHTML = '<div class="error">Failed to load users</div>';
        }
    }

    displayUsersList(users) {
        const usersList = document.getElementById('users-list');
        
        if (!users || users.length === 0) {
            usersList.innerHTML = '<div class="no-data">No users found</div>';
            return;
        }

        const usersHtml = users.map(user => `
            <div class="user-item" data-user-id="${user.id}">
                <div class="user-info">
                    <div class="user-name">${this.escapeHtml(user.name || user.username)}</div>
                    <div class="user-details">
                        <span class="user-username">@${this.escapeHtml(user.username)}</span>
                        <span class="user-role badge role-${user.role}">${user.role}</span>
                        <span class="user-email">${this.escapeHtml(user.email || 'No email')}</span>
                    </div>
                </div>
                <div class="user-actions">
                    <button class="btn-small btn-secondary edit-user-btn" data-user-id="${user.id}">Edit</button>
                    ${user.role !== 'admin' ? `<button class="btn-small btn-danger delete-user-btn" data-user-id="${user.id}">Delete</button>` : ''}
                </div>
            </div>
        `).join('');

        usersList.innerHTML = usersHtml;

        // Add event listeners
        usersList.querySelectorAll('.edit-user-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const userId = e.target.dataset.userId;
                this.editUser(userId);
            });
        });

        usersList.querySelectorAll('.delete-user-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const userId = e.target.dataset.userId;
                this.deleteUser(userId);
            });
        });
    }

    openNewUserModal() {
        document.getElementById('user-form-title').textContent = 'Add New User';
        document.getElementById('user-form').reset();
        document.getElementById('user-form').dataset.mode = 'create';
        delete document.getElementById('user-form').dataset.userId;
        this.showModal(document.getElementById('user-form-modal'));
    }

    async editUser(userId) {
        const user = this.allUsers.find(u => u.id == userId);
        if (!user) {
            this.showToast('User not found', 'error');
            return;
        }

        document.getElementById('user-form-title').textContent = 'Edit User';
        document.getElementById('user-username').value = user.username;
        document.getElementById('user-name').value = user.name || '';
        document.getElementById('user-email').value = user.email || '';
        document.getElementById('user-role').value = user.role;
        document.getElementById('user-password').value = ''; // Don't show existing password
        document.getElementById('user-password').placeholder = 'Leave blank to keep current password';
        
        document.getElementById('user-form').dataset.mode = 'edit';
        document.getElementById('user-form').dataset.userId = userId;
        
        this.showModal(document.getElementById('user-form-modal'));
    }

    async saveUser() {
        const form = document.getElementById('user-form');
        const formData = new FormData(form);
        const mode = form.dataset.mode;
        const userId = form.dataset.userId;

        const userData = {
            username: document.getElementById('user-username').value.trim(),
            name: document.getElementById('user-name').value.trim(),
            email: document.getElementById('user-email').value.trim(),
            role: document.getElementById('user-role').value,
            password: document.getElementById('user-password').value
        };

        // Validate
        if (!userData.username || !userData.name || !userData.email || !userData.role) {
            this.showToast('Please fill in all required fields', 'error');
            return;
        }

        if (mode === 'create' && !userData.password) {
            this.showToast('Password is required for new users', 'error');
            return;
        }

        try {
            const url = mode === 'create' ? '/api/users' : `/api/users/${userId}`;
            const method = mode === 'create' ? 'POST' : 'PUT';
            
            // Don't send empty password for edits
            if (mode === 'edit' && !userData.password) {
                delete userData.password;
            }

            const response = await this.makeAuthenticatedRequest(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(userData)
            });

            if (response.ok) {
                this.showToast(`User ${mode === 'create' ? 'created' : 'updated'} successfully`, 'success');
                this.hideModal(document.getElementById('user-form-modal'));
                await this.loadAndDisplayUsers();
                await this.loadUsers(); // Refresh dropdowns
            } else {
                const error = await response.json();
                this.showToast(error.error || `Failed to ${mode} user`, 'error');
            }
        } catch (error) {
            console.error('Error saving user:', error);
            this.showToast('Failed to save user', 'error');
        }
    }

    async deleteUser(userId) {
        const user = this.allUsers.find(u => u.id == userId);
        if (!user) return;

        if (!confirm(`Are you sure you want to delete user "${user.name || user.username}"?`)) {
            return;
        }

        try {
            const response = await this.makeAuthenticatedRequest(`/api/users/${userId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                this.showToast('User deleted successfully', 'success');
                await this.loadAndDisplayUsers();
                await this.loadUsers(); // Refresh dropdowns
            } else {
                const error = await response.json();
                this.showToast(error.error || 'Failed to delete user', 'error');
            }
        } catch (error) {
            console.error('Error deleting user:', error);
            this.showToast('Failed to delete user', 'error');
        }
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
    
    // Add some delay to ensure all elements are ready
    setTimeout(() => {
        try {
            window.app = new CaseWorkflowApp();
            console.log('App initialized successfully:', window.app);
        } catch (error) {
            console.error('Failed to initialize app:', error);
            // Fallback - redirect to login if app fails to initialize
            window.location.href = '/login.html';
        }
    }, 100);
});
