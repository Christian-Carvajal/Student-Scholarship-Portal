// Mock JSON Data arrays
const mockScholarships = [
    { id: 1, title: 'UPHSD Gold Tier Merit', desc: 'Highest honor for maintaining a 3.8+ GPA.', minGpa: 3.8, amount: 'PHP 25,000', deadline: 'May 30, 2026', type: 'Merit' },
    { id: 2, title: 'Engineering Excellence Fund', desc: 'Specifically for 3rd and 4th-year Engineering students.', minGpa: 3.0, amount: 'PHP 15,000', deadline: 'June 15, 2026', type: 'Program-Specific' },
    { id: 3, title: 'Board of Trustees Need-Based Action', desc: 'Financial assistance for verified low-income households.', minGpa: 2.5, amount: 'PHP 10,000', deadline: 'August 1, 2026', type: 'Need-Based' },
    { id: 4, title: 'IT & Computing Innovators', desc: 'Awarded to students with outstanding capstone prototypes.', minGpa: 3.2, amount: 'PHP 20,000', deadline: 'July 10, 2026', type: 'Merit' }
];

const mockApplications = [
    { id: '10042', title: 'IT & Computing Innovators', date: 'April 02, 2026', term: 'AY25-26 Term 2', status: 'Pending' },
    { id: '09918', title: 'UPHSD Gold Tier Merit', date: 'Dec 15, 2025', term: 'AY25-26 Term 1', status: 'Approved' },
    { id: '08544', title: 'Engineering Excellence Fund', date: 'Aug 04, 2025', term: 'AY25-26 Term 1', status: 'Rejected' },
];

const mockAdminApplications = [
    { applicantId: '2023-1104', title: 'Engineering Excellence Fund', gpa: 3.1, docs: 3 },
    { applicantId: '2022-0056', title: 'UPHSD Gold Tier', gpa: 3.91, docs: 3 },
    { applicantId: '2024-8899', title: 'Board of Trustees Need-Based', gpa: 2.7, docs: 2 },
];

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
        modalBody.innerHTML = messageHtml; // Use innerHTML to allow formats like <code>
        
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

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            // Update Active State
            navLinks.forEach(n => n.classList.remove('active'));
            e.target.classList.add('active');

            // Hide all sections, show target
            const targetId = e.target.getAttribute('data-target');
            sections.forEach(sec => {
                if (sec.id === targetId) {
                    sec.classList.remove('hidden');
                } else {
                    sec.classList.add('hidden');
                }
            });
        });
    });

    // --- 2. Dynamic Rendering ---
    
    function renderScholarships() {
        const grid = document.getElementById('scholarshipGrid');
        if (!grid) return;
        
        let html = '';
        mockScholarships.forEach(s => {
            html += `
                <div class="card">
                    <h3>${s.title}</h3>
                    <p>${s.desc}</p>
                    <div class="card-tags">
                        <span>Min GPA: ${s.minGpa}</span>
                        <span>Type: ${s.type}</span>
                        <span>Amt: ${s.amount}</span>
                    </div>
                    <div style="margin-top: 1rem; display: flex; justify-content: space-between; align-items: center;">
                        <small style="color: #888;">Deadline: ${s.deadline}</small>
                        <button class="btn btn-gold" onclick="window.showModal('Scholarship Info', 'Proceeding to apply for: <strong>${s.title}</strong>')">Apply</button>
                    </div>
                </div>
            `;
        });
        grid.innerHTML = html;
    }

    function renderTracker() {
        const tbody = document.getElementById('trackerTableBody');
        if (!tbody) return;

        let html = '';
        mockApplications.forEach(app => {
            const statusClass = `status-${app.status.toLowerCase()}`;
            html += `
                <tr>
                    <td>#${app.id}</td>
                    <td><strong>${app.title}</strong></td>
                    <td>${app.date}</td>
                    <td>${app.term}</td>
                    <td><span class="status-badge ${statusClass}">${app.status}</span></td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    }

    function renderAdminTable() {
        const tbody = document.getElementById('adminTableBody');
        if (!tbody) return;

        let html = '';
        mockAdminApplications.forEach(app => {
            html += `
                <tr>
                    <td>${app.applicantId}</td>
                    <td>${app.title}</td>
                    <td>${app.gpa}</td>
                    <td>${app.docs} Files <a href="#" style="font-size:0.8rem; margin-left:5px;">View</a></td>
                    <td>
                        <button class="btn btn-gold" style="padding: 0.4rem 0.8rem; font-size: 0.85rem;" onclick="window.showModal('Action Approved', 'Approved applicant: ${app.applicantId}')">Approve</button>
                        <button class="btn" style="padding: 0.4rem 0.8rem; font-size: 0.85rem; background: #dc3545;" onclick="window.showModal('Action Rejected', 'Rejected applicant: ${app.applicantId}')">Reject</button>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    }

    // Initialize UI Rendering
    renderScholarships();
    renderTracker();
    renderAdminTable();


    // --- 3. Form Submissions (Simulated) ---

    // Mock User Database for Authentication
    const mockUsers = [
        { studentId: '12345', password: 'password123' } // Default test user
    ];
    let currentUser = null;

    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const navAuth = document.getElementById('navAuth');
    const navLogout = document.getElementById('navLogout');

    // Registration Logic
    if (registerForm) {
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const studentId = e.target.querySelector('input[type="text"]').value;
            
            // Check if user exists
            if (mockUsers.find(u => u.studentId === studentId)) {
                window.showModal('Registration Error', 'Student ID already registered!');
                return;
            }

            // Generate a random 8-character password
            const genPassword = Math.random().toString(36).slice(-8);
            
            mockUsers.push({ studentId, password: genPassword });
            
            window.showModal('Registration Successful', `
                <p style="margin-bottom:10px;">Your account has been successfully created!</p>
                <p><strong>Student ID:</strong> ${studentId}</p>
                <div style="margin-top: 15px; padding: 15px; background: #f8f9fa; border: 1px solid #ddd; border-radius: 4px; text-align: center;">
                    <p style="margin-bottom: 5px; font-size: 0.9em; color: #555;">Auto-generated Password:</p>
                    <code style="font-size: 1.5em; color: var(--primary-maroon); user-select: all;">${genPassword}</code>
                </div>
                <p style="margin-top:15px; font-size:0.9em; color:#666; text-align: center;">Double-click the password above to copy it, then log in.</p>
            `);
            registerForm.reset();
        });
    }

    // Login Logic
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const studentId = e.target.querySelectorAll('input')[0].value;
            const password = e.target.querySelectorAll('input')[1].value;

            const user = mockUsers.find(u => u.studentId === studentId && u.password === password);
            
            if (user) {
                currentUser = user;
                window.showModal('Login Success', 'Logged in successfully! Welcome to the portal.');
                loginForm.reset();
                
                // Update UI state
                navAuth.classList.add('hidden');
                navLogout.classList.remove('hidden');
                
                // Redirect to listings
                document.querySelector('[data-target="view-listings"]').click();
            } else {
                window.showModal('Login Failed', '<p style="color: #dc3545;">Invalid Student ID or Password.<br>Please try again.</p>');
            }
        });
    }

    // Logout Logic
    if (navLogout) {
        navLogout.addEventListener('click', () => {
            currentUser = null;
            navLogout.classList.add('hidden');
            navAuth.classList.remove('hidden');
            window.showModal('Logout', 'You have been successfully logged out.');
            document.querySelector('[data-target="view-auth"]').click();
        });
    }

    // Generic Mock Form Submissions for other features
    const forms = [
        { id: 'applicationForm', msg: 'Application and Documents submitted successfully! Check your tracker.' },
        { id: 'addScholarshipForm', msg: 'New Scholarship published!' },
        { id: 'contactForm', msg: 'Support ticket sent. Please allow 24-48 hours for a reply.' }
    ];

    forms.forEach(form => {
        const el = document.getElementById(form.id);
        if (el) {
            el.addEventListener('submit', (e) => {
                e.preventDefault();
                if (!currentUser && form.id === 'applicationForm') {
                    window.showModal('Action Denied', '<strong>Unauthorized</strong><br>You must be logically registered and logged in to submit an application!', false, () => {
                        document.querySelector('[data-target="view-auth"]').click();
                    });
                    return;
                }
                window.showModal('Success', `<span style="color: green;">${form.msg}</span>`);
                el.reset(); // Reset fields after simulation
            });
        }
    });

    // --- 4. FAQ Accordion Interaction ---
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        question.addEventListener('click', () => {
            item.classList.toggle('active');
            const span = question.querySelector('span');
            span.textContent = item.classList.contains('active') ? '-' : '+';
        });
    });

});
