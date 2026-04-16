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
    let modalCancelCallback = null;

    const MODAL_TRANSITION_MS = 220;

    function closeModal() {
        if (!modalOverlay) return;

        if (modalOverlay.classList.contains("is-open")) {
            modalOverlay.classList.remove("is-open");
            modalOverlay.classList.add("is-closing");
            window.setTimeout(() => {
                modalOverlay.classList.remove("is-closing");
            }, MODAL_TRANSITION_MS);
        } else {
            modalOverlay.classList.remove("is-closing");
            modalOverlay.classList.remove("is-open");
        }

        modalConfirmCallback = null;
        modalCancelCallback = null;
        if (modalBtnOk) modalBtnOk.textContent = "OK";
        if (modalBtnCancel) {
            modalBtnCancel.textContent = "Cancel";
            modalBtnCancel.classList.add("hidden");
        }
    }

    // Supports BOTH signatures:
    // 1) showModal(title, html)
    // 2) showModal(title, html, isConfirmBoolean, onConfirmFn)  (legacy)
    // 3) showModal(title, html, onConfirmFn, { okText, cancelText, showCancel, onCancel })
    window.showModal = function(title, messageHtml, third = null, fourth = null) {
        modalTitle.textContent = title;
        modalBody.innerHTML = messageHtml;

        let onConfirm = null;
        let options = {};

        if (typeof third === "boolean") {
            // Legacy
            const isConfirm = third;
            onConfirm = typeof fourth === "function" ? fourth : null;
            options = {
                okText: isConfirm ? "Confirm" : "OK",
                cancelText: "Cancel",
                showCancel: Boolean(isConfirm),
            };
        } else {
            onConfirm = typeof third === "function" ? third : null;
            options = fourth && typeof fourth === "object" ? fourth : {};
        }

        modalConfirmCallback = onConfirm;
        modalCancelCallback = typeof options.onCancel === "function" ? options.onCancel : null;

        if (modalBtnOk) modalBtnOk.textContent = options.okText || "OK";
        if (modalBtnCancel) {
            modalBtnCancel.textContent = options.cancelText || "Cancel";
            if (modalConfirmCallback || options.showCancel) modalBtnCancel.classList.remove("hidden");
            else modalBtnCancel.classList.add("hidden");
        }

        if (modalOverlay) {
            modalOverlay.classList.remove("is-closing");
            window.requestAnimationFrame(() => {
                modalOverlay.classList.add("is-open");
            });
        }
    };

    if(modalBtnOk) modalBtnOk.addEventListener("click", () => {
        const cb = modalConfirmCallback;
        closeModal();
        if (cb) cb();
    });
    if(modalBtnCancel) modalBtnCancel.addEventListener("click", () => {
        const cb = modalCancelCallback;
        closeModal();
        if (cb) cb();
    });

    // Logout
    const navLogout = document.getElementById("navLogout");
    if(navLogout) navLogout.addEventListener("click", () => {
        window.showModal(
            "Log Out",
            "Are you sure you want to log out?",
            () => {
                localStorage.removeItem("currentUser");
                window.location.href = "login.html";
            },
            { okText: "Log Out", cancelText: "Cancel", showCancel: true }
        );
    });

    // SPA Navigation Logic
    const navLinks = document.querySelectorAll(".nav-link");
    const sections = document.querySelectorAll(".app-main section");

    // Notification Dropdown Logic
    const notifToggle = document.getElementById("notifToggle");
    const notifDropdown = document.getElementById("notifDropdown");
    const notifBadgeCount = document.getElementById("notifBadgeCount");
    const notifBodyList = document.getElementById("notifBodyList");
    if (notifToggle && notifDropdown && notifBodyList) {
        notifToggle.addEventListener("click", (e) => {
            const isHidden = notifDropdown.classList.contains("hidden");
            if (isHidden) {
                notifDropdown.classList.remove("hidden");
            } else {
                notifDropdown.classList.add("hidden");
            }
        });
        
        document.addEventListener("click", (e) => {
            if (!notifDropdown.contains(e.target) && !notifToggle.contains(e.target)) {
                notifDropdown.classList.add("hidden");
            }
        });

        // Filter logic
        const filterBtns = notifDropdown.querySelectorAll(".filter-btn");
        const notifItems = Array.from(notifBodyList.querySelectorAll(".notif-item"));
        
        filterBtns.forEach(btn => {
            btn.addEventListener("click", () => {
                filterBtns.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                
                const filter = btn.getAttribute("data-filter");
                notifItems.forEach(item => {
                    if (filter === "all") {
                        item.style.display = "flex";
                    } else if (filter === "unread") {
                        if (item.classList.contains("unread")) {
                            item.style.display = "flex";
                        } else {
                            item.style.display = "none";
                        }
                    }
                });
            });
        });

        // Mark as read on click
        notifItems.forEach(item => {
            item.addEventListener("click", () => {
                if (item.classList.contains("unread")) {
                    item.classList.remove("unread");
                    const dot = item.querySelector(".notif-unread-dot");
                    if (dot) dot.style.display = "none";
                    
                    if (notifBadgeCount) {
                        let currentCount = parseInt(notifBadgeCount.textContent || "0");
                        if (currentCount > 0) {
                            currentCount--;
                            if (currentCount === 0) {
                                notifBadgeCount.style.display = "none";
                            } else {
                                notifBadgeCount.textContent = currentCount;
                            }
                        }
                    }
                }
            });
        });
    }

    const VIEW_TRANSITION_MS = 220;
    sections.forEach((sec) => sec.classList.add("view-transition"));
    let activeSection = Array.from(sections).find((sec) => !sec.classList.contains("hidden")) || null;
    let navTransitionToken = 0;

    function hideSectionWithTransition(sec) {
        if (!sec || sec.classList.contains("hidden")) return;
        sec.classList.add("view-transition--pre");
        window.setTimeout(() => {
            sec.classList.add("hidden");
        }, VIEW_TRANSITION_MS);
    }

    function showSectionWithTransition(sec) {
        if (!sec) return;
        sec.classList.remove("hidden");
        sec.classList.add("view-transition--pre");
        window.requestAnimationFrame(() => {
            sec.classList.remove("view-transition--pre");
        });
    }

    function navigateTo(targetId) {
        if (!targetId) return;
        navLinks.forEach(n => {
            if (n.getAttribute("data-target") === targetId) n.classList.add("active");
            else n.classList.remove("active");
        });

        const nextSection = Array.from(sections).find((sec) => sec.id === targetId) || null;
        if (!nextSection) return;
        if (activeSection && activeSection.id === targetId) return;

        const token = ++navTransitionToken;
        if (activeSection) {
            hideSectionWithTransition(activeSection);
            window.setTimeout(() => {
                if (token !== navTransitionToken) return;
                showSectionWithTransition(nextSection);
                activeSection = nextSection;
                if (targetId === "view-tracker") fetchStudentApplications();
                else if (targetId === "view-listings") fetchScholarships();
            }, VIEW_TRANSITION_MS);
        } else {
            showSectionWithTransition(nextSection);
            activeSection = nextSection;
            if (targetId === "view-tracker") fetchStudentApplications();
            else if (targetId === "view-listings") fetchScholarships();
        }
    }

    navLinks.forEach(link => {
        link.addEventListener("click", (e) => {
            const anchor = e.target.closest(".nav-link");
            if (!anchor) return;
            const targetId = anchor.getAttribute("data-target");
            if (targetId) navigateTo(targetId);
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
