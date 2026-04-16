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
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const togglePassword = document.getElementById('togglePassword');
    const authForm = document.getElementById('authForm');
    const btnSubmitAuth = document.getElementById('btnSubmitAuth');
    const authPanelBody = document.getElementById('authPanelBody');

    // Register Modal Elements
    const registerModal = document.getElementById('registerModal');
    const registerForm = document.getElementById('registerForm');
    const btnCancelRegister = document.getElementById('btnCancelRegister');
    const btnSubmitRegister = document.getElementById('btnSubmitRegister');
    const regStudentIdInput = document.getElementById('regStudentId');
    const regPasswordInput = document.getElementById('regPassword');
    const regNameInput = document.getElementById('regName');
    const regEmailInput = document.getElementById('regEmail');
    const regProgramInput = document.getElementById('regProgram');
    
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

    function clearAuthInputs() {
        if (authForm) authForm.reset();

        // Ensure password is masked again if it was toggled
        if (passwordInput && passwordInput.getAttribute('type') !== 'password') {
            passwordInput.setAttribute('type', 'password');
            if (togglePassword) {
                togglePassword.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-eye"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
            }
        }
    }

    function setAuthInteractionDisabled(disabled) {
        if (btnStudentRole) btnStudentRole.disabled = disabled;
        if (btnAdminRole) btnAdminRole.disabled = disabled;

        const pe = disabled ? 'none' : '';
        if (tabLogin) tabLogin.style.pointerEvents = pe;
        if (tabRegister) tabRegister.style.pointerEvents = pe;
    }

    let registerModalCloseTimer = null;
    let registerModalFinalizeCloseTimer = null;

    function closeRegisterModal() {
        if (!registerModal) return;

        if (registerModalCloseTimer) {
            window.clearTimeout(registerModalCloseTimer);
            registerModalCloseTimer = null;
        }
        if (registerModalFinalizeCloseTimer) {
            window.clearTimeout(registerModalFinalizeCloseTimer);
            registerModalFinalizeCloseTimer = null;
        }

        // Trigger close animation
        registerModal.classList.add('is-closing');

        // Finalize hide after transition (slightly > CSS duration)
        registerModalFinalizeCloseTimer = window.setTimeout(() => {
            registerModal.classList.remove('is-open');
            registerModal.classList.remove('is-closing');
            registerModal.setAttribute('aria-hidden', 'true');
        }, 420);

        // Reset after fade-out so the user doesn't see fields clearing during the close animation.
        if (registerForm) {
            registerModalCloseTimer = window.setTimeout(() => {
                // If reopened quickly, don't wipe the new session
                if (registerModal.classList.contains('is-open') && !registerModal.classList.contains('is-closing')) return;
                registerForm.reset();
            }, 380);
        }
    }

    function openRegisterModal() {
        if (!registerModal) return;

        if (registerModalCloseTimer) {
            window.clearTimeout(registerModalCloseTimer);
            registerModalCloseTimer = null;
        }
        if (registerModalFinalizeCloseTimer) {
            window.clearTimeout(registerModalFinalizeCloseTimer);
            registerModalFinalizeCloseTimer = null;
        }

        registerModal.classList.remove('is-closing');
        registerModal.setAttribute('aria-hidden', 'false');

        // Ensure transition plays even if opened twice quickly
        window.requestAnimationFrame(() => {
            registerModal.classList.add('is-open');
        });

        if (registerForm) registerForm.reset();
        if (regStudentIdInput) regStudentIdInput.focus();
        
        if (btnSubmitRegister) {
            btnSubmitRegister.disabled = false;
            btnSubmitRegister.textContent = 'Create Account';
        }
    }

    function applyAuthUI(options = {}) {
        const { clearInputs = false } = options;

        // Main auth form is always login-only (registration happens in modal)
        isLoginMode = true;

        if (btnStudentRole) btnStudentRole.classList.toggle('active', isStudentLayout);
        if (btnAdminRole) btnAdminRole.classList.toggle('active', !isStudentLayout);

        if (studentTabs) studentTabs.classList.toggle('hidden', !isStudentLayout);

        if (lblUsername) lblUsername.textContent = isStudentLayout ? 'Student ID' : 'Admin Username';
        if (usernameInput) usernameInput.placeholder = isStudentLayout ? 'Ex. 12345678' : 'Enter username';

        if (tabLogin) tabLogin.classList.add('active');
        if (tabRegister) tabRegister.classList.remove('active');

        if (loginTitle) {
            loginTitle.textContent = isStudentLayout
                ? 'Student Login'
                : 'Admin Login';
        }

        if (btnSubmitAuth) btnSubmitAuth.textContent = 'Login';

        // If user switches away from Student, close the register modal
        if (!isStudentLayout) closeRegisterModal();

        if (clearInputs) clearAuthInputs();
    }

    let authUiToken = 0;
    let authPanelTransitionTimer = null;
    function withAuthPanelTransition(updateStateFn, options = {}) {
        const { clearInputs = false } = options;
        const token = ++authUiToken;

        setAuthInteractionDisabled(true);

        if (!authPanelBody) {
            updateStateFn();
            applyAuthUI({ clearInputs });
            setAuthInteractionDisabled(false);
            return;
        }

        authPanelBody.classList.add('is-fading');
        if (authPanelTransitionTimer) window.clearTimeout(authPanelTransitionTimer);

        authPanelTransitionTimer = window.setTimeout(() => {
            // Ignore stale transitions if user clicked again
            if (token !== authUiToken) return;

            updateStateFn();
            applyAuthUI({ clearInputs });

            window.requestAnimationFrame(() => {
                if (token !== authUiToken) return;
                authPanelBody.classList.remove('is-fading');
                window.setTimeout(() => {
                    if (token !== authUiToken) return;
                    setAuthInteractionDisabled(false);
                }, 180);
            });
        }, 170);
    }

    // Role Toggle (Student / Admin)
    btnStudentRole.addEventListener('click', (e) => {
        e.preventDefault();
        withAuthPanelTransition(() => {
            isStudentLayout = true;
            // Keep current mode (login/register) for student, but re-render will enforce rules.
        }, { clearInputs: true });
    });

    btnAdminRole.addEventListener('click', (e) => {
        e.preventDefault();
        withAuthPanelTransition(() => {
            isStudentLayout = false;
            isLoginMode = true;
        }, { clearInputs: true });
    });

    // Login/Register Tabs
    tabLogin.addEventListener('click', (e) => {
        e.preventDefault();
        withAuthPanelTransition(() => {
            isLoginMode = true;
            closeRegisterModal();
        }, { clearInputs: true });
    });

    tabRegister.addEventListener('click', (e) => {
        e.preventDefault();
        // Register is a modal popup instead of inline tab content
        if (!isStudentLayout) return;
        withAuthPanelTransition(() => {
            isLoginMode = true;
            openRegisterModal();
        }, { clearInputs: true });
    });

    function updateModeUI() {
        applyAuthUI();
    }

    // Initial render (ensures classes/aria are correct)
    applyAuthUI();

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
        
        // LOGIN LOGIC
        const expectedRole = isStudentLayout ? 'student' : 'admin';
        
        const user = mockUsers.find(u => 
            (((u.studentId || '').toLowerCase() === username.toLowerCase()) || 
             (u.email && u.email.toLowerCase() === username.toLowerCase())) && 
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
    });

    // Register Modal handlers
    if (btnCancelRegister) {
        btnCancelRegister.addEventListener('click', () => {
            closeRegisterModal();
        });
    }

    if (registerForm) {
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!isStudentLayout) return;

            const studentId = (regStudentIdInput?.value || '').trim();
            const password = (regPasswordInput?.value || '').trim();
            const name = (regNameInput?.value || '').trim();
            const email = (regEmailInput?.value || '').trim();
            const program = (regProgramInput?.value || '').trim();

            if (!studentId || !password || !email) {
                showModal('Registration Error', 'Please complete Student ID, Email, and Password.');
                return;
            }

            if (mockUsers.find(u => (u.studentId || '').toLowerCase() === studentId.toLowerCase())) {
                showModal('Registration Error', 'Student ID already registered!');
                return;
            }

            if (mockUsers.find(u => (u.email || '').toLowerCase() === email.toLowerCase())) {
                showModal('Registration Error', 'This email is already in use.');
                return;
            }

            if (btnSubmitRegister) {
                btnSubmitRegister.disabled = true;
                btnSubmitRegister.textContent = 'Creating...';
            }

            const newUser = {
                studentId,
                name: name || 'Student Visitor',
                email,
                program,
                password,
                role: 'student',
            };

            mockUsers.push(newUser);
            localStorage.setItem('mockUsers', JSON.stringify(mockUsers));

            closeRegisterModal();
            showModal('Registration Successful', '<p>Your account has been successfully created. You can now login.</p>');
            clearAuthInputs();
            applyAuthUI();
        });
    }

    // --- FORGOT PASSWORD LOGIC ---
    const forgotPassLink = document.querySelector('.forgot-pass');
    const forgotPasswordModal = document.getElementById('forgotPasswordModal');
    const btnCancelForgot = document.getElementById('btnCancelForgot');
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');
    const btnSubmitForgot = document.getElementById('btnSubmitForgot');

    let forgotModalResetTimer = null;
    let forgotModalFinalizeCloseTimer = null;

    function openForgotModal() {
        if (!forgotPasswordModal) return;
        if (forgotModalResetTimer) {
            window.clearTimeout(forgotModalResetTimer);
            forgotModalResetTimer = null;
        }
        if (forgotModalFinalizeCloseTimer) {
            window.clearTimeout(forgotModalFinalizeCloseTimer);
            forgotModalFinalizeCloseTimer = null;
        }

        forgotPasswordModal.classList.remove('is-closing');
        forgotPasswordModal.setAttribute('aria-hidden', 'false');
        window.requestAnimationFrame(() => {
            forgotPasswordModal.classList.add('is-open');
        });
        if (forgotPasswordForm) forgotPasswordForm.reset();
        const emailEl = document.getElementById('forgotEmail');
        if (emailEl) emailEl.focus();
    }

    function closeForgotModal() {
        if (!forgotPasswordModal) return;
        if (forgotModalResetTimer) {
            window.clearTimeout(forgotModalResetTimer);
            forgotModalResetTimer = null;
        }
        if (forgotModalFinalizeCloseTimer) {
            window.clearTimeout(forgotModalFinalizeCloseTimer);
            forgotModalFinalizeCloseTimer = null;
        }

        forgotPasswordModal.classList.add('is-closing');
        forgotModalFinalizeCloseTimer = window.setTimeout(() => {
            forgotPasswordModal.classList.remove('is-open');
            forgotPasswordModal.classList.remove('is-closing');
            forgotPasswordModal.setAttribute('aria-hidden', 'true');
        }, 420);

        if (forgotPasswordForm) {
            forgotModalResetTimer = window.setTimeout(() => {
                if (forgotPasswordModal.classList.contains('is-open') && !forgotPasswordModal.classList.contains('is-closing')) return;
                forgotPasswordForm.reset();
            }, 380);
        }
    }

    if (forgotPassLink && forgotPasswordModal) {
        // Open Modal
        forgotPassLink.addEventListener('click', (e) => {
            e.preventDefault();
            openForgotModal();
        });

        // Cancel
        btnCancelForgot.addEventListener('click', () => {
            closeForgotModal();
        });

        // Submit EmailJS Reset Request
        forgotPasswordForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const resetEmail = document.getElementById('forgotEmail').value.trim();
            const userAccount = mockUsers.find(u => u.email === resetEmail);

            if (!userAccount) {
                // For security, show same generic message whether email exists or not, but don't send Email
                showModal('Request Sent', 'If an account is associated with this email, a reset link has been sent.');
                closeForgotModal();
                return;
            }

            btnSubmitForgot.textContent = 'Sending...';
            btnSubmitForgot.disabled = true;

            // Generate Reset Token and update mockUsers
            const resetToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
            userAccount.resetToken = resetToken;
            localStorage.setItem('mockUsers', JSON.stringify(mockUsers));

            // Generate Magic Link
            const currentUrl = window.location.origin + window.location.pathname; // Clean URL
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
                    closeForgotModal();
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
                    <button class="btn btn-gold" onclick="window.location.href='${window.location.origin + window.location.pathname}'" style="padding: 10px 15px;">Return to Login</button>
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
                    const loginUrl = window.location.origin + window.location.pathname;
                    
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
