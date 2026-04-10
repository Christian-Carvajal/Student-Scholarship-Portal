document.addEventListener('DOMContentLoaded', () => {

    // --- Global Modal Logic ---
    const modalOverlay = document.getElementById('customModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    const modalBtnOk = document.getElementById('modalBtnOk');
    const modalBtnCancel = document.getElementById('modalBtnCancel');
    let modalConfirmCallback = null;

    window.showModal = function(title, messageHtml, isConfirm = false, onConfirm = null) {
        modalTitle.textContent = title;
        modalBody.innerHTML = messageHtml; 
        
        modalConfirmCallback = onConfirm;
        
        if (isConfirm) {
            modalBtnCancel.classList.remove('hidden');
            modalBtnOk.textContent = 'Confirm';
        } else {
            modalBtnCancel.classList.add('hidden');
            modalBtnOk.textContent = 'OK';
        }
        
        modalOverlay.classList.remove('hidden');
    };

    function closeModal() {
        modalOverlay.classList.add('hidden');
        modalConfirmCallback = null;
    }

    modalBtnOk.addEventListener('click', () => {
        if (modalConfirmCallback) {
            modalConfirmCallback();
        }
        closeModal();
    });

    modalBtnCancel.addEventListener('click', () => {
        closeModal();
    });

    // --- 1. SPA Navigation Logic ---
    const navLinks = document.querySelectorAll('.nav-link');
    const sections = document.querySelectorAll('.app-main section');

    function navigateTo(targetId) {
        navLinks.forEach(n => {
            if (n.getAttribute('data-target') === targetId) {
                n.classList.add('active');
            } else {
                n.classList.remove('active');
            }
        });

        sections.forEach(sec => {
            if (sec.id === targetId) {
                sec.classList.remove('hidden');
            } else {
                sec.classList.add('hidden');
            }
        });

        // Trigger data fetches based on view
        if (targetId === 'view-tracker' && currentUser) {
            fetchStudentApplications();
        } else if (targetId === 'view-admin') {
            fetchAdminLeaderboard();
        } else if (targetId === 'view-listings') {
            fetchScholarships();
        }
    }

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const targetId = e.target.getAttribute('data-target');
            
            // Protect auth routes
            if (!currentUser && (targetId === 'view-apply' || targetId === 'view-tracker' || targetId === 'view-docs')) {
                window.showModal('Authentication Required', 'Please Login or Register to access this section.');
                navigateTo('view-auth');
                return;
            }

            navigateTo(targetId);
        });
    });


    // --- 2. AUTHENTICATION (Simulated Front-end Session) ---
    // User sessions are stored in memory and localStorage for ease
    
    let mockUsers = JSON.parse(localStorage.getItem('mockUsers')) || [];
    let currentUser = JSON.parse(localStorage.getItem('currentUser')) || null;
    
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const navAuth = document.getElementById('navAuth');
    const navLogout = document.getElementById('navLogout');

    function updateAuthUI() {
        if (currentUser) {
            navAuth.classList.add('hidden');
            navLogout.classList.remove('hidden');
        } else {
            navAuth.classList.remove('hidden');
            navLogout.classList.add('hidden');
        }
    }
    updateAuthUI(); // Init

    navLogout.addEventListener('click', () => {
        currentUser = null;
        localStorage.removeItem('currentUser');
        updateAuthUI();
        window.showModal('Logged Out', 'You have been successfully logged out.');
        navigateTo('view-auth');
    });

    if (registerForm) {
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const studentId = document.getElementById('regStudentId').value;
            const name = document.getElementById('regName').value;
            const program = document.getElementById('regProgram').value;
            const year = document.getElementById('regYear').value;
            
            if (mockUsers.find(u => u.studentId === studentId)) {
                window.showModal('Registration Error', 'Student ID already registered!');
                return;
            }

            const genPassword = Math.random().toString(36).slice(-8);
            const newUser = { studentId, name, program, year, password: genPassword };
            
            mockUsers.push(newUser);
            localStorage.setItem('mockUsers', JSON.stringify(mockUsers));
            
            window.showModal('Registration Successful', `
                <p style="margin-bottom:10px;">Your account has been successfully created!</p>
                <div style="margin-top: 15px; padding: 15px; background: #fff8e6; border: 1px solid #fdbb11; text-align: center;">
                    <p style="margin-bottom: 5px; font-size: 0.9em; color: #555;">Auto-generated Password:</p>
                    <code style="font-size: 1.5em; color: var(--primary-maroon); user-select: all;">${genPassword}</code>
                </div>
            `);
            registerForm.reset();
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const id = document.getElementById('loginStudentId').value;
            const pw = document.getElementById('loginPassword').value;
            
            const user = mockUsers.find(u => u.studentId === id && u.password === pw);
            if (user) {
                currentUser = user;
                localStorage.setItem('currentUser', JSON.stringify(currentUser));
                updateAuthUI();
                loginForm.reset();
                window.showModal('Welcome Back', `Welcome to the Portal, ${user.name}`);
                navigateTo('view-listings');
            } else {
                window.showModal('Login Failed', 'Invalid Student ID or Password.');
            }
        });
    }

    // --- 3. FETCHING REAL DATA FROM NODE.JS BACKEND ---

    async function fetchScholarships() {
        try {
            const res = await fetch('/api/applications/scholarships');
            const data = await res.json();
            
            // Render listings grid
            const grid = document.getElementById('scholarshipGrid');
            const select = document.getElementById('appScholarship');
            
            if (grid) grid.innerHTML = '';
            if (select) select.innerHTML = '';

            data.forEach(s => {
                // Populate Cards
                if (grid) {
                    grid.innerHTML += `
                        <div class="card">
                            <h3>${s.title}</h3>
                            <p>${s.description}</p>
                            <div class="card-tags">
                                <span>Min GPA: ${s.min_gpa}</span>
                                <span>Amt: PHP ${parseFloat(s.fund_amount).toLocaleString()}</span>
                            </div>
                            <div style="margin-top: 1rem; display: flex; justify-content: space-between; align-items: center;">
                                <button class="btn btn-gold btn-sm" onclick="applyForScholarship(${s.id})">Apply</button>
                            </div>
                        </div>
                    `;
                }
                
                // Populate Select Dropdown in Application Form
                if (select) {
                    select.innerHTML += `<option value="${s.id}">${s.title} (Min GPA: ${s.min_gpa})</option>`;
                }
            });
        } catch (e) {
            console.error('Failed to fetch scholarships:', e);
        }
    }

    // Direct apply button in cards
    window.applyForScholarship = function(id) {
        if (!currentUser) {
            window.showModal('Authentication Required', 'Please Login or Register first.');
            navigateTo('view-auth');
            return;
        }
        navigateTo('view-apply');
        document.getElementById('appScholarship').value = id;
    };


    async function fetchStudentApplications() {
        try {
            const res = await fetch(`/api/applications/student/${currentUser.studentId}`);
            const data = await res.json();
            
            const tbody = document.getElementById('trackerTableBody');
            if (!tbody) return;

            let html = '';
            data.forEach(app => {
                const statusClass = `status-${app.status.toLowerCase()}`;
                html += `
                    <tr>
                        <td>#${app.application_id}</td>
                        <td><strong>${app.scholarship_title}</strong></td>
                        <td>${new Date(app.applied_at).toLocaleDateString()}</td>
                        <td><span class="status-badge ${statusClass}">${app.status}</span></td>
                    </tr>
                `;
            });
            tbody.innerHTML = html;
        } catch (e) {
            console.error('Failed to fetch student apps:', e);
        }
    }


    async function fetchAdminLeaderboard() {
        try {
            const res = await fetch(`/api/applications`);
            const data = await res.json();
            
            const tbody = document.getElementById('adminTableBody');
            if (!tbody) return;

            let html = '';
            data.forEach(app => {
                const statusClass = `status-${app.status.toLowerCase()}`;
                
                // UI logic to only show Approve button for eligible candidates
                let actionButtons = '-';
                if (app.status === 'Eligible') {
                    actionButtons = `<button class="btn btn-gold" style="padding: 0.4rem 0.8rem; font-size: 0.85rem;" onclick="updateStatus(${app.application_id}, 'Approved')">Approve Top Rank</button>`;
                } else if (app.status === 'Approved') {
                    actionButtons = `<span style="color: green; font-weight: bold;">Verified</span>`;
                }

                html += `
                    <tr style="background: ${app.status === 'Approved' ? 'var(--bg-parchment)' : 'transparent'}">
                        <td>
                            <strong>${app.student_name}</strong><br>
                            <small style="color: #666;">${app.year_level}</small>
                        </td>
                        <td>${app.scholarship_title}<br><small>Min Req: ${app.min_gpa}</small></td>
                        <td style="font-weight: 600; font-size: 1.1rem; color: ${app.submitted_gpa < app.min_gpa ? 'red' : 'green'}">${app.submitted_gpa}</td>
                        <td><span class="status-badge ${statusClass}">${app.status}</span></td>
                        <td>${actionButtons}</td>
                    </tr>
                `;
            });
            tbody.innerHTML = html;
        } catch (e) {
            console.error('Failed to fetch admin leaderboard:', e);
        }
    }

    // Global Admin Action Function
    window.updateStatus = async function(appId, status) {
        window.showModal('Confirm Action', `Are you sure you want to mark Application #${appId} as ${status}?`, true, async () => {
            try {
                const res = await fetch(`/api/applications/${appId}/status`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status })
                });
                
                if (res.ok) {
                    fetchAdminLeaderboard(); // Refresh the table
                    window.showModal('Success', 'Status successfully updated.');
                }
            } catch (e) {
                console.error('Failed to update status');
            }
        });
    };


    // --- 4. FORM SUBMISSION (Integration) ---
    
    const applicationForm = document.getElementById('applicationForm');
    if (applicationForm) {
        applicationForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (!currentUser) return; // Failsafe

            const gpa = document.getElementById('appGpa').value;
            const scholarshipId = document.getElementById('appScholarship').value;

            // Submit JSON payload to backend Database using transaction controller
            try {
                const res = await fetch('/api/applications/apply', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        student_id: currentUser.studentId,
                        name: currentUser.name,
                        program: currentUser.program,
                        year_level: currentUser.year,
                        gpa: gpa,
                        scholarship_id: scholarshipId
                    })
                });

                const result = await res.json();
                
                if (res.ok) {
                    applicationForm.reset();
                    
                    let bg = result.status === 'Eligible' ? '#d4edda' : '#f8d7da';
                    let color = result.status === 'Eligible' ? '#155724' : '#721c24';
                    
                    window.showModal(
                        'Application Result', 
                        `<div style="padding: 1rem; background: ${bg}; color: ${color}; border-radius: 4px; border: 1px solid currentColor;">
                            <strong>Auto-Vetting Complete:</strong> Your application has been marked as <strong>${result.status}</strong> based on the GPA requirements.
                        </div>`
                    );
                    
                    navigateTo('view-tracker');
                } else {
                    window.showModal('Submission Failed', result.error || 'An error occurred.');
                }
            } catch (error) {
                window.showModal('Network Error', 'Failed to connect to the server.');
            }
        });
    }
    
    // Initial fetch
    fetchScholarships();
});
