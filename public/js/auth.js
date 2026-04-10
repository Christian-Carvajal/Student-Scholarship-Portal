document.addEventListener('DOMContentLoaded', () => {
    // Current state
    let isStudentLayout = true;
    let isLoginMode = true;

    // Mock Users inside auth context
    let mockUsers = JSON.parse(localStorage.getItem('mockUsers')) || [];
    
    // Ensure admin always exists WITH THE ADMIN ROLE in mockUsers
    let adminIndex = mockUsers.findIndex(u => u.studentId === 'admin' && u.role === 'admin');
    if (adminIndex === -1) {
        // Remove any fake student admins just in case
        mockUsers = mockUsers.filter(u => !(u.studentId === 'admin' && u.role === 'student'));
        
        mockUsers.push({ studentId: 'admin', password: 'admin', role: 'admin', name: 'Admin User', email: 'admission.molino.perpetualdalta@proton.me' });
        localStorage.setItem('mockUsers', JSON.stringify(mockUsers));
    }

    // Elements
    const btnStudentRole = document.getElementById('btnStudentRole');
    const btnAdminRole = document.getElementById('btnAdminRole');
    const loginTitle = document.getElementById('loginTitle');
    const groupStudentId = document.getElementById('groupStudentId');
    const lblUsername = document.getElementById('lblUsername');
    const studentTabs = document.getElementById('studentTabs');
    const tabLogin = document.getElementById('tabLogin');
    const tabRegister = document.getElementById('tabRegister');
    const registerFields = document.getElementById('registerFields');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const togglePassword = document.getElementById('togglePassword');
    const authForm = document.getElementById('authForm');
    const btnSubmitAuth = document.getElementById('btnSubmitAuth');
    
    // Modal Elements
    const modalOverlay = document.getElementById('customModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    const modalBtnOk = document.getElementById('modalBtnOk');

    function showModal(title, messageHtml, hideOkBtn = false) {
        modalTitle.textContent = title;
        modalBody.innerHTML = messageHtml; 
        if(modalBtnOk) {
            modalBtnOk.style.display = hideOkBtn ? 'none' : 'block';
        }
        modalOverlay.classList.remove('hidden');
    }

    if(modalBtnOk) {
        modalBtnOk.addEventListener('click', () => {
            modalOverlay.classList.add('hidden');
        });
    }

    // Role Toggle (Student / Admin)
    btnStudentRole.addEventListener('click', (e) => {
        e.preventDefault();
        isStudentLayout = true;
        btnStudentRole.classList.add('active');
        btnAdminRole.classList.remove('active');
        
        loginTitle.textContent = isLoginMode ? 'Student Login' : 'Student Registration';
        lblUsername.textContent = 'Student ID';
        usernameInput.placeholder = 'Ex. 12345678';
        studentTabs.classList.remove('hidden');
    });

    btnAdminRole.addEventListener('click', (e) => {
        e.preventDefault();
        isStudentLayout = false;
        btnAdminRole.classList.add('active');
        btnStudentRole.classList.remove('active');
        
        loginTitle.textContent = 'Admin Login';
        lblUsername.textContent = 'Admin Username';
        usernameInput.placeholder = 'Enter username';
        studentTabs.classList.add('hidden');
        
        // Force back to login mode if they were registering
        isLoginMode = true;
        updateModeUI();
    });

    // Login/Register Tabs
    tabLogin.addEventListener('click', (e) => {
        e.preventDefault();
        isLoginMode = true;
        updateModeUI();
    });

    tabRegister.addEventListener('click', (e) => {
        e.preventDefault();
        isLoginMode = false;
        updateModeUI();
    });

    function updateModeUI() {
        if(isLoginMode) {
            tabLogin.classList.add('active');
            tabRegister.classList.remove('active');
            registerFields.classList.add('hidden');
            loginTitle.textContent = isStudentLayout ? 'Student Login' : 'Admin Login';
            btnSubmitAuth.textContent = 'Login';
        } else {
            tabRegister.classList.add('active');
            tabLogin.classList.remove('active');
            registerFields.classList.remove('hidden');
            loginTitle.textContent = 'Student Registration';
            btnSubmitAuth.textContent = 'Register Now';
        }
    }

    // Toggle Password Visibility
    if (togglePassword) {
        togglePassword.addEventListener('click', function () {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            
            // Toggle the SVG icon (eye to eye-off)
            if (type === 'text') {
                this.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-eye-off"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
            } else {
                this.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-eye"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
            }
        });
    }

    // Form Submission
    authForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();
        
        if (isLoginMode) {
            // LOGIN LOGIC
            const expectedRole = isStudentLayout ? 'student' : 'admin';
            
            const user = mockUsers.find(u => 
                u.studentId.toLowerCase() === username.toLowerCase() && 
                u.password === password && 
                (u.role === expectedRole || (!u.role && expectedRole === 'student')) // Assume old mock users without role are students
            );
            
            if (user) {
                if (user.isTemporary) {
                    showModal('Notice', 'Force password change not implemented in auth.js mockup yet. Granting access.');
                } 
                localStorage.setItem('currentUser', JSON.stringify(user));
                
                // Redirect based on role
                if(expectedRole === 'admin') {
                    window.location.href = 'admin-portal.html';
                } else {
                    window.location.href = 'student-portal.html';
                }
            } else {
                showModal('Login Failed', 'Invalid credentials or wrong role selected.');
            }
        } else {
            // REGISTER LOGIC (Student only)
            const name = document.getElementById('regName').value.trim();
            const program = document.getElementById('regProgram').value.trim();
            const email = document.getElementById('regEmail').value.trim();
            
            if (mockUsers.find(u => u.studentId === username)) {
                showModal('Registration Error', 'Student ID already registered!');
                return;
            }

            if (mockUsers.find(u => u.email === email)) {
                showModal('Registration Error', 'This email is already in use.');
                return;
            }

            // Using the real password they entered for simplicity in this refactor, instead of generated one
            const newUser = { 
                studentId: username, 
                name: name || 'Student Visitor',
                email: email, 
                program: program, 
                password: password, 
                role: 'student'
            };
            
            mockUsers.push(newUser);
            localStorage.setItem('mockUsers', JSON.stringify(mockUsers));
            
            showModal('Registration Successful', `<p>Your account has been successfully created. You can now login.</p>`);
            
            // Switch back to login mode
            authForm.reset();
            isLoginMode = true;
            updateModeUI();
        }
    });

    // --- FORGOT PASSWORD LOGIC ---
    const forgotPassLink = document.querySelector('.forgot-pass');
    const forgotPasswordModal = document.getElementById('forgotPasswordModal');
    const btnCancelForgot = document.getElementById('btnCancelForgot');
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');
    const btnSubmitForgot = document.getElementById('btnSubmitForgot');

    if (forgotPassLink && forgotPasswordModal) {
        // Open Modal
        forgotPassLink.addEventListener('click', (e) => {
            e.preventDefault();
            forgotPasswordModal.classList.remove('hidden');
        });

        // Cancel
        btnCancelForgot.addEventListener('click', () => {
            forgotPasswordModal.classList.add('hidden');
            forgotPasswordForm.reset();
        });

        // Submit EmailJS Reset Request
        forgotPasswordForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const resetEmail = document.getElementById('forgotEmail').value.trim();
            const userAccount = mockUsers.find(u => u.email === resetEmail);

            if (!userAccount) {
                // For security, show same generic message whether email exists or not, but don't send Email
                showModal('Request Sent', 'If an account is associated with this email, a reset link has been sent.');
                forgotPasswordModal.classList.add('hidden');
                forgotPasswordForm.reset();
                return;
            }

            btnSubmitForgot.textContent = 'Sending...';
            btnSubmitForgot.disabled = true;

            // Generate Reset Token and update mockUsers
            const resetToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
            userAccount.resetToken = resetToken;
            localStorage.setItem('mockUsers', JSON.stringify(mockUsers));

            // Generate Magic Link
            const currentUrl = window.location.href.split('?')[0]; // Clean URL
            const magicLink = `${currentUrl}?reset=true&email=${encodeURIComponent(resetEmail)}&token=${resetToken}`;

            // Send via EmailJS
            const templateParams = {
                name: userAccount.name || 'Student',
                email: resetEmail,
                link: magicLink
            };

            emailjs.send('service_3crm71j', 'template_1jougji', templateParams)
                .then(function() {
                    showModal('Email Sent', 'Please check your inbox (and spam folder) for the password reset link.');
                    forgotPasswordModal.classList.add('hidden');
                    forgotPasswordForm.reset();
                })
                .catch(function(error) {
                    console.error('EmailJS Error:', error);
                    showModal('Error', 'There was an error sending the reset email. Please try again later.');
                })
                .finally(function() {
                    btnSubmitForgot.textContent = 'Send Link';
                    btnSubmitForgot.disabled = false;
                });
        });
    }

    // --- HANDLE MAGIC LINK CREATION OF NEW PASSWORD ---
    const urlParams = new URLSearchParams(window.location.search);
    const isReset = urlParams.get('reset');
    const resetEmailParam = urlParams.get('email');
    const resetTokenParam = urlParams.get('token');
    const createNewPasswordModal = document.getElementById('createNewPasswordModal');
    const createNewPasswordForm = document.getElementById('createNewPasswordForm');
    const btnUpdatePassword = createNewPasswordForm ? createNewPasswordForm.querySelector('button[type="submit"]') : null;

    if (isReset && resetEmailParam && createNewPasswordModal) {
        // Validate token exists and matches the one assigned to the user
        const requestedUser = mockUsers.find(u => u.email === resetEmailParam);
        if (!requestedUser || !requestedUser.resetToken || requestedUser.resetToken !== resetTokenParam) {
            showModal('Invalid Link', `
                <div style="text-align: center; margin-top: 10px;">
                    <p style="margin-bottom: 20px;">This password reset link is invalid or has already been used.</p>
                    <button class="btn btn-gold" onclick="window.location.href='${window.location.href.split('?')[0]}'" style="padding: 10px 15px;">Return to Login</button>
                </div>
            `, true);
            return;
        }

        createNewPasswordModal.classList.remove('hidden');

        createNewPasswordForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            // Add interaction: change button state while "processing"
            btnUpdatePassword.textContent = 'Updating...';
            btnUpdatePassword.disabled = true;
            
            const newPass = document.getElementById('resetNewPassword').value.trim();
            
            // Find user and update their mock password
            let updated = false;
            let targetRole = 'student';
            let targetUser = null;

            for (let i = 0; i < mockUsers.length; i++) {
                if (mockUsers[i].email === resetEmailParam) {
                    mockUsers[i].password = newPass;
                    delete mockUsers[i].resetToken; // Invalidate token after setting new password
                    targetUser = mockUsers[i];
                    targetRole = mockUsers[i].role || 'student';
                    updated = true;
                    break;
                }
            }

            if (updated) {
                localStorage.setItem('mockUsers', JSON.stringify(mockUsers));
                // Automatically log them in for a smooth experience
                localStorage.setItem('currentUser', JSON.stringify(targetUser));
                
                // Delay slightly to show the Success Modal with interactive buttons
                setTimeout(() => {
                    if (createNewPasswordModal) createNewPasswordModal.classList.add('hidden');
                    
                    const dashboardUrl = targetRole === 'admin' ? 'admin-portal.html' : 'student-portal.html';
                    const loginUrl = window.location.href.split('?')[0];
                    
                    showModal('Password Reset Complete', `
                        <div style="text-align: center; margin-top: 10px;">
                            <p style="margin-bottom: 20px; font-size: 1.1rem;">Your password has been successfully updated!</p>
                            <p style="margin-bottom: 20px; color: var(--text-color, #666);">Choose an action to proceed:</p>
                            <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                                <button class="btn btn-gold" onclick="window.location.href='${dashboardUrl}'" style="padding: 10px 15px;">Continue to Dashboard</button>
                                <button class="btn" onclick="localStorage.removeItem('currentUser'); window.location.href='${loginUrl}'" style="padding: 10px 15px; background: #eee; color: #333;">Go to Login</button>
                            </div>
                        </div>
                    `, true);
                }, 500); // Small initial delay so button state update implies "work" is happening

            } else {
                showModal('Error', 'We could not find an account matching that email address.');
                btnUpdatePassword.textContent = 'Update Password';
                btnUpdatePassword.disabled = false;
            }
        });
    }

    // Check if currently logged in, and redirect
    const current = JSON.parse(localStorage.getItem('currentUser'));
    if(current) {
        if(current.role === 'admin') {
            window.location.href = 'admin-portal.html';
        } else {
            window.location.href = 'student-portal.html';
        }
    }
});