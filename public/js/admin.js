document.addEventListener("DOMContentLoaded", () => {
    // Admin Auth Guard
    const currentUser = JSON.parse(localStorage.getItem("currentUser"));
    if (!currentUser || currentUser.role !== "admin") {
        window.location.href = "login.html";
        return;
    }

    // Modal Logic
    const modalOverlay = document.getElementById("customModal");
    const modalTitle = document.getElementById("modalTitle");
    const modalBody = document.getElementById("modalBody");
    const modalBtnOk = document.getElementById("modalBtnOk");
    let modalConfirmCallback = null;

    window.showModal = function(title, messageHtml, onConfirm = null) {
        modalTitle.textContent = title;
        modalBody.innerHTML = messageHtml; 
        modalConfirmCallback = onConfirm;
        modalOverlay.classList.remove("hidden");
    };

    if(modalBtnOk) modalBtnOk.addEventListener("click", () => {
        modalOverlay.classList.add("hidden");
        const cb = modalConfirmCallback;
        modalConfirmCallback = null;
        if (cb) cb();
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
        if(targetId === "navLogout") return;
        navLinks.forEach(n => {
            if (n.getAttribute("data-target") === targetId) n.classList.add("active");
            else n.classList.remove("active");
        });
        sections.forEach(sec => {
            if (sec.id === targetId) sec.classList.remove("hidden");
            else sec.classList.add("hidden");
        });
        if (targetId === "view-review") renderReviewTable();
    }

    navLinks.forEach(link => {
        link.addEventListener("click", (e) => {
            const targetId = e.target.getAttribute("data-target");
            if(targetId) navigateTo(targetId);
        });
    });

    // Add scholarship form handler
    const addScholarshipForm = document.getElementById("addScholarshipForm");
    if (addScholarshipForm) {
        addScholarshipForm.addEventListener("submit", (e) => {
            e.preventDefault();
            window.showModal("Published", "Scholarship published (placeholder).<br/><br/>Connect to DB later.");
            e.target.reset();
        });
    }

    // Review workflow (placeholder data)
    const reviewRows = [
        {
            id: "APP-1007",
            applicant: "Jane Doe",
            studentId: "S-220145",
            scholarship: "STEM Excellence Fund",
            gpa: "3.86",
            submittedAt: "2026-04-10",
            autoVetStatus: "Verified",
            reviewProgress: 0,
            essay:
                "I am applying for the STEM Excellence Fund to support my final year capstone project and reduce financial burden while maintaining academic performance.",
            documents: ["Transcript.pdf", "Recommendation_Letter.pdf", "ID_Verification.png"],
        },
        {
            id: "APP-1011",
            applicant: "Michael Smith",
            studentId: "S-219882",
            scholarship: "Community Leadership Award",
            gpa: "3.61",
            submittedAt: "2026-04-11",
            autoVetStatus: "Pending",
            reviewProgress: 0,
            essay:
                "Leadership has shaped my academic path. This scholarship would help me continue community tutoring and mentoring programs while balancing coursework.",
            documents: ["Transcript.pdf", "Volunteer_Hours.pdf"],
        },
    ];

    let selectedApplicationId = null;

    function renderReviewTable() {
        const tbody = document.getElementById("adminReviewTableBody");
        if (!tbody) return;

        tbody.innerHTML = reviewRows
            .map((row) => {
                const statusClass =
                    row.autoVetStatus === "Verified"
                        ? "status-approved"
                        : row.autoVetStatus === "Pending"
                            ? "status-pending"
                            : "status-rejected";

                let buttonText = "Review Application";
                if (row.isDecided) buttonText = "Review Completed";
                else if (row.reviewProgress > 0) buttonText = "Continue Reviewing";
                
                const progressDisplay = `
                    <div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                        <progress value="${row.reviewProgress}" max="100" style="width: 60px;"></progress>
                        <span style="font-size: 0.85rem; color: #666;">${row.reviewProgress}%</span>
                    </div>
                `;

                return `
                    <tr>
                        <td>${row.applicant}</td>
                        <td>${row.scholarship}</td>
                        <td>${row.gpa}</td>
                        <td><span class="status-badge ${statusClass}">${row.autoVetStatus}</span></td>
                        <td>${progressDisplay}</td>
                        <td>
                            <button class="btn btn-sm" type="button" data-action="review" data-id="${row.id}" ${row.isDecided ? 'disabled style="background-color: #e9ecef; cursor: not-allowed; color: #6c757d; border: 1px solid #ced4da;"' : ''}>${buttonText}</button>
                        </td>
                    </tr>
                `;
            })
            .join("");
    }

    let reviewScrollListener = null;

    function navigateToDetail(applicationId) {
        selectedApplicationId = applicationId;
        const row = reviewRows.find((r) => r.id === applicationId);
        if (!row) return;

        const setText = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };

        setText("reviewApplicantName", row.applicant);
        setText("reviewStudentId", row.studentId);
        setText("reviewScholarship", row.scholarship);
        setText("reviewGpa", row.gpa);
        setText("reviewSubmittedAt", row.submittedAt);
        setText("reviewEssay", row.essay);

        const docsEl = document.getElementById("reviewDocs");
        if (docsEl) {
            docsEl.innerHTML = row.documents.map((d) => `<li>${d}</li>`).join("");
        }

        // Show detail section but keep Review nav highlighted
        sections.forEach(sec => {
            if (sec.id === "view-review-detail") sec.classList.remove("hidden");
            else sec.classList.add("hidden");
        });
        navLinks.forEach(n => {
            if (n.getAttribute("data-target") === "view-review") n.classList.add("active");
            else n.classList.remove("active");
        });

        // Detach any previous scroll listener
        if (reviewScrollListener) {
            window.removeEventListener("scroll", reviewScrollListener);
            window.removeEventListener("resize", reviewScrollListener);
            reviewScrollListener = null;
        }

        // Calculate progress based on scroll
        const calculateProgress = () => {
            if (row.reviewProgress === 100) {
                if (reviewScrollListener) {
                    window.removeEventListener("scroll", reviewScrollListener);
                    window.removeEventListener("resize", reviewScrollListener);
                    reviewScrollListener = null;
                }
                return;
            }

            const docHeight = document.documentElement.scrollHeight;
            const winHeight = window.innerHeight;
            const scrollTop = window.scrollY;

            // If the document isn't taller than the window, everything is visible
            if (docHeight <= winHeight) {
                row.reviewProgress = 100;
                return;
            }

            const scrollPercent = (scrollTop / (docHeight - winHeight)) * 100;
            const newProgress = Math.min(100, Math.round(scrollPercent));
            
            if (newProgress > row.reviewProgress) {
                row.reviewProgress = newProgress;
            }
        };

        // If it was 0, initialize at least to 1% to show they opened it
        if (row.reviewProgress === 0) row.reviewProgress = 1;

        // Start listening
        reviewScrollListener = calculateProgress;
        window.addEventListener("scroll", reviewScrollListener);
        window.addEventListener("resize", reviewScrollListener);

        // Run once to catch tiny placeholder data pages
        // Wait a tick for CSS to render to get accurate docHeight
        setTimeout(calculateProgress, 50);
    }

    document.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-action]");
        if (!btn) return;
        if (btn.getAttribute("data-action") !== "review") return;

        const id = btn.getAttribute("data-id");
        if (!id) return;
        navigateToDetail(id);
    });

    const backBtn = document.getElementById("btnBackToReview");
    if (backBtn) {
        backBtn.addEventListener("click", () => {
            navigateTo("view-review");
        });
    }

    const approveBtn = document.getElementById("btnApproveApplication");
    if (approveBtn) {
        approveBtn.addEventListener("click", () => {
            if (!selectedApplicationId) return;
            window.showModal(
                "Approve",
                `Approve application <b>${selectedApplicationId}</b>?`,
                () => {
                    const row = reviewRows.find(r => r.id === selectedApplicationId);
                    if (row) {
                        row.reviewProgress = 100;
                        row.isDecided = true;
                        row.autoVetStatus = "Approved"; // Update the visible status label
                    }
                    alert(`Approved application ${selectedApplicationId} (placeholder).`);
                    navigateTo("view-review");
                }
            );
        });
    }

    const rejectBtn = document.getElementById("btnRejectApplication");
    if (rejectBtn) {
        rejectBtn.addEventListener("click", () => {
            if (!selectedApplicationId) return;
            window.showModal(
                "Reject",
                `Reject application <b>${selectedApplicationId}</b>?`,
                () => {
                    const row = reviewRows.find(r => r.id === selectedApplicationId);
                    if (row) {
                        row.reviewProgress = 100;
                        row.isDecided = true;
                        row.autoVetStatus = "Rejected"; // Update the visible status label
                    }
                    alert(`Rejected application ${selectedApplicationId} (placeholder).`);
                    navigateTo("view-review");
                }
            );
        });
    }

    // Init
    // Keep Admin Dashboard as the default view; render review table on demand.
});
