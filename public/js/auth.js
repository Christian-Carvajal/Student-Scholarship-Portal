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
        
        mockUsers.push({ studentId: 'admin', password: 'admin', role: 'admin', name: 'Admin User' });
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

    function showModal(title, messageHtml) {
        modalTitle.textContent = title;
        modalBody.innerHTML = messageHtml; 
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
            
            if (mockUsers.find(u => u.studentId === username)) {
                showModal('Registration Error', 'Student ID already registered!');
                return;
            }

            // Using the real password they entered for simplicity in this refactor, instead of generated one
            const newUser = { 
                studentId: username, 
                name: name || 'Student Visitor', 
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