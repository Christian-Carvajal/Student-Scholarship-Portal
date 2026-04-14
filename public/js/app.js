document.addEventListener("DOMContentLoaded", () => {
    // Check Authentication
    const currentUser = JSON.parse(localStorage.getItem("currentUser"));
    if (!currentUser || currentUser.role === "admin") {
        window.location.href = "login.html";
        return;
    }

    // Modal Logic
    const modalOverlay = document.getElementById("customModal");
    const modalTitle = document.getElementById("modalTitle");
    const modalBody = document.getElementById("modalBody");
    const modalBtnOk = document.getElementById("modalBtnOk");
    const modalBtnCancel = document.getElementById("modalBtnCancel");
    let modalConfirmCallback = null;

    window.showModal = function(title, messageHtml, isConfirm = false, onConfirm = null) {
        modalTitle.textContent = title;
        modalBody.innerHTML = messageHtml; 
        modalConfirmCallback = onConfirm;
        
        if (isConfirm) {
            modalBtnCancel.classList.remove("hidden");
            modalBtnOk.textContent = "Confirm";
        } else {
            modalBtnCancel.classList.add("hidden");
            modalBtnOk.textContent = "OK";
        }
        modalOverlay.classList.remove("hidden");
    };

    function closeModal() {
        modalOverlay.classList.add("hidden");
        modalConfirmCallback = null;
    }

    if(modalBtnOk) modalBtnOk.addEventListener("click", () => {
        if (modalConfirmCallback) modalConfirmCallback();
        closeModal();
    });
    if(modalBtnCancel) modalBtnCancel.addEventListener("click", () => {
        closeModal();
    });

    // Logout
    const navLogout = document.getElementById("navLogout");
    if(navLogout) navLogout.addEventListener("click", () => {
        localStorage.removeItem("currentUser");
        window.location.href = "login.html";
    });

    // SPA Navigation Logic
    const navLinks = document.querySelectorAll(".nav-link");
    const sections = document.querySelectorAll(".app-main section");

    function navigateTo(targetId) {
        navLinks.forEach(n => {
            if (n.getAttribute("data-target") === targetId) n.classList.add("active");
            else n.classList.remove("active");
        });
        sections.forEach(sec => {
            if (sec.id === targetId) sec.classList.remove("hidden");
            else sec.classList.add("hidden");
        });
        if (targetId === "view-tracker") fetchStudentApplications();
        else if (targetId === "view-listings") fetchScholarships();
    }

    navLinks.forEach(link => {
        link.addEventListener("click", (e) => {
            const targetId = e.target.getAttribute("data-target");
            if(targetId) navigateTo(targetId);
        });
    });

    fetchScholarships(); // Init

    // FAQ Accordion (Student Portal)
    const faqAccordion = document.getElementById("faqAccordion");
    if (faqAccordion) {
        faqAccordion.addEventListener("click", (event) => {
            const questionEl = event.target.closest(".faq-question");
            if (!questionEl) return;

            const itemEl = questionEl.closest(".faq-item");
            if (!itemEl) return;

            const willOpen = !itemEl.classList.contains("active");

            // Close others for a cleaner experience
            faqAccordion.querySelectorAll(".faq-item.active").forEach((activeItem) => {
                activeItem.classList.remove("active");
                const plus = activeItem.querySelector(".faq-question span");
                if (plus) plus.textContent = "+";
            });

            if (willOpen) {
                itemEl.classList.add("active");
                const plus = itemEl.querySelector(".faq-question span");
                if (plus) plus.textContent = "−";
            }
        });
    }

    // Placeholder data fetching
    function fetchScholarships() {
        // Typically a fetch to API would go here
        const grid = document.getElementById("scholarshipGrid");
        if (grid && grid.innerHTML.trim() === "") {
            grid.innerHTML = `<div class=\"card\">
                <h3>Academic Excellence Grant</h3>
                <p>For students with exceptional GPA.</p>
                <div style=\"margin-top:1rem;\">
                    <button class=\"btn btn-gold btn-sm\" onclick=\"window.showModal(\'Applied\', \'Application submitted!\')\">Apply</button>
                </div>
            </div>`;
        }
    }

    function fetchStudentApplications() {
        // Tracker logic placeholder
        const tbody = document.getElementById("trackerTableBody");
        if (tbody) {
                        tbody.innerHTML = `
                            <tr>
                                <td>S-2026-001</td>
                                <td>Academic Excellence Grant</td>
                                <td>Apr 01, 2026</td>
                                <td><span class=\"status-badge status-pending\">Pending</span></td>
                            </tr>
                        `;
        }
    }
});
