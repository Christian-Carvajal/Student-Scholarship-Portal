document.addEventListener('DOMContentLoaded', () => {
    // Current state
    let isStudentLayout = true;
    let isLoginMode = true;

    // Mock Users inside auth context
    let mockUsers = JSON.parse(localStorage.getItem('mockUsers')) || [
        // default admin
        { studentId: 'admin', password: 'admin', role: 'admin', name: 'Admin User' }
    ];

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

    // Form Submission
    authForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();
        
        if (isLoginMode) {
            // LOGIN LOGIC
            const expectedRole = isStudentLayout ? 'student' : 'admin';
            
            const user = mockUsers.find(u => 
                u.studentId === username && 
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