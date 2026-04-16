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
    const modalBtnCancel = document.getElementById("modalBtnCancel");
    let modalConfirmCallback = null;
    let modalCancelCallback = null;

    const MODAL_TRANSITION_MS = 220;

    function closeModal() {
        if (!modalOverlay) return;

        // Smooth close (matches login modal behavior)
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

    window.showModal = function(title, messageHtml, onConfirm = null, options = {}) {
        modalTitle.textContent = title;
        modalBody.innerHTML = messageHtml;

        modalConfirmCallback = typeof onConfirm === "function" ? onConfirm : null;
        modalCancelCallback = typeof options.onCancel === "function" ? options.onCancel : null;

        if (modalBtnOk) modalBtnOk.textContent = options.okText || "OK";
        if (modalBtnCancel) {
            modalBtnCancel.textContent = options.cancelText || "Cancel";
            if (modalConfirmCallback || options.showCancel) modalBtnCancel.classList.remove("hidden");
            else modalBtnCancel.classList.add("hidden");
        }

        if (modalOverlay) {
            modalOverlay.classList.remove("is-closing");
            // Trigger open transition
            window.requestAnimationFrame(() => {
                modalOverlay.classList.add("is-open");
            });
        }
    };

    if (modalBtnOk) modalBtnOk.addEventListener("click", () => {
        const cb = modalConfirmCallback;
        closeModal();
        if (cb) cb();
    });

    if (modalBtnCancel) modalBtnCancel.addEventListener("click", () => {
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

    // Notification Dropdown Logic
    const notifToggle = document.getElementById("notifToggle");
    const notifDropdown = document.getElementById("notifDropdown");
    const notifBadgeCount = document.getElementById("notifBadgeCount");
    const notifBodyList = document.getElementById("notifBodyList");

    if (notifToggle && notifDropdown && notifBodyList) {
        // Handle Toggling the Widget
        notifToggle.addEventListener("click", (e) => {
            e.stopPropagation();
            const isHidden = notifDropdown.classList.contains("hidden");
            if (isHidden) {
                notifDropdown.classList.remove("hidden");
            } else {
                notifDropdown.classList.add("hidden");
            }
        });

        // Close on outside click
        document.addEventListener("click", (e) => {
            if (!notifDropdown.contains(e.target)) {
                notifDropdown.classList.add("hidden");
            }
        });

        // Handle Filter Buttons
        const filterBtns = notifDropdown.querySelectorAll(".filter-btn");
        const notifItems = Array.from(notifBodyList.querySelectorAll(".notif-item"));

        filterBtns.forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation(); // prevent dropdown from closing
                
                // Update active button state
                filterBtns.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");

                const mode = btn.getAttribute("data-filter");

                // Execute filtering
                notifItems.forEach(item => {
                    if (mode === "unread") {
                        if (item.classList.contains("unread")) {
                            item.classList.remove("hidden");
                        } else {
                            item.classList.add("hidden");
                        }
                    } else {
                        // mode === "all"
                        item.classList.remove("hidden");
                    }
                });
            });
        });

        // Handle Notification Clicks (Expand + Mark Read)
        notifItems.forEach(item => {
            item.addEventListener("click", (e) => {
                e.stopPropagation();

                // Toggle Accordion expansion
                item.classList.toggle("is-expanded");

                // Mark as read if it is currently unread
                if (item.classList.contains("unread")) {
                    item.classList.remove("unread");
                    
                    // Hide the unread dot
                    const dot = item.querySelector(".notif-unread-dot");
                    if (dot) dot.style.opacity = "0";

                    // Update Badge Count
                    if (notifBadgeCount) {
                        let currentCount = parseInt(notifBadgeCount.textContent || "0");
                        if (currentCount > 0) {
                            currentCount -= 1;
                            if (currentCount === 0) {
                                notifBadgeCount.style.display = "none";
                            } else {
                                notifBadgeCount.textContent = currentCount;
                            }
                        }
                    }

                    // If currently viewing the "Unread" tab, technically it shouldn't disappear instantly
                    // as it's confusing, so we leave it visible until the user switches tabs again.
                }
            });
        });
    }

    // Dashboard Metrics + Live Clock
    const metricTotalApplicants = document.getElementById("metricTotalApplicants");
    const metricTotalScholarships = document.getElementById("metricTotalScholarships");
    const metricPendingReview = document.getElementById("metricPendingReview");
    const metricApproved = document.getElementById("metricApproved");
    const metricRejected = document.getElementById("metricRejected");
    const metricNow = document.getElementById("metricNow");

    // New dashboard layout elements (optional)
    const dashboardDataNote = document.getElementById("dashboardDataNote");
    const statusDonutSvg = document.getElementById("statusDonutSvg");
    const statusDonutTotal = document.getElementById("statusDonutTotal");
    const legendPending = document.getElementById("legendPending");
    const legendApproved = document.getElementById("legendApproved");
    const legendRejected = document.getElementById("legendRejected");

    const formatInt = (n) => {
        try {
            return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
        } catch {
            return String(n);
        }
    };

    const setMetricText = (el, value) => {
        if (!el) return;
        el.textContent = value;
    };

    const formatNow = () => {
        try {
            return new Intl.DateTimeFormat(undefined, {
                weekday: "short",
                year: "numeric",
                month: "short",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
            }).format(new Date());
        } catch {
            return new Date().toLocaleString();
        }
    };

    let clockIntervalId = null;
    function startClock() {
        if (!metricNow) return;
        setMetricText(metricNow, formatNow());
        if (clockIntervalId) return;
        clockIntervalId = window.setInterval(() => {
            setMetricText(metricNow, formatNow());
        }, 1000);
    }

    function computeMetricsFromRows(rows, scholarshipRows) {
        const ids = new Set();
        const scholarships = new Set();
        let pending = 0;
        let approved = 0;
        let rejected = 0;

        for (const row of rows || []) {
            const studentId = row.student_id || row.studentId;
            if (studentId) ids.add(String(studentId));

            const scholarshipTitle = row.scholarship_title || row.scholarship;
            if (scholarshipTitle) scholarships.add(String(scholarshipTitle));

            const statusRaw = (row.status || row.application_status || row.autoVetStatus || "")
                .toString()
                .trim()
                .toLowerCase();

            // Treat anything not explicitly approved/rejected as pending review.
            if (statusRaw.includes("approve")) approved += 1;
            else if (statusRaw.includes("reject")) rejected += 1;
            else if (
                statusRaw.includes("pending") ||
                statusRaw.includes("review") ||
                statusRaw.includes("eligible") ||
                statusRaw.includes("verified")
            )
                pending += 1;
            else pending += 1;
        }

        const scholarshipCount = Array.isArray(scholarshipRows)
            ? scholarshipRows.length
            : scholarships.size;

        const totalApplicants = ids.size > 0 ? ids.size : (rows || []).length;

        return {
            totalApplicants,
            totalScholarships: scholarshipCount,
            pendingReview: pending,
            approved,
            rejected,
        };
    }

    function setDashboardNote(isLive) {
        if (!dashboardDataNote) return;
        dashboardDataNote.textContent = isLive
            ? "Showing live data from the API."
            : "Showing demo data — database/API not connected yet.";
    }

    function svgClear(el) {
        if (!el) return;
        while (el.firstChild) el.removeChild(el.firstChild);
    }

    function svgEl(tag, attrs = {}) {
        const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
        for (const [k, v] of Object.entries(attrs)) {
            el.setAttribute(k, String(v));
        }
        return el;
    }

    function renderStatusDonut(metrics) {
        if (!statusDonutSvg) return;

        const pending = Math.max(0, Number(metrics?.pendingReview || 0));
        const approved = Math.max(0, Number(metrics?.approved || 0));
        const rejected = Math.max(0, Number(metrics?.rejected || 0));
        const total = pending + approved + rejected;

        if (statusDonutTotal) statusDonutTotal.textContent = formatInt(total);
        if (legendPending) legendPending.textContent = formatInt(pending);
        if (legendApproved) legendApproved.textContent = formatInt(approved);
        if (legendRejected) legendRejected.textContent = formatInt(rejected);

        const size = 180;
        const cx = size / 2;
        const cy = size / 2;
        const r = 72;
        const stroke = 18;
        const circumference = 2 * Math.PI * r;

        svgClear(statusDonutSvg);
        statusDonutSvg.setAttribute("viewBox", `0 0 ${size} ${size}`);

        // Background ring
        statusDonutSvg.appendChild(
            svgEl("circle", {
                cx,
                cy,
                r,
                fill: "none",
                stroke: "rgba(122, 17, 20, 0.10)",
                "stroke-width": stroke,
            })
        );

        if (total === 0) return;

        const segments = [
            { value: pending, color: "rgba(122, 17, 20, 0.22)" },
            { value: approved, color: "rgba(39, 98, 32, 0.80)" },
            { value: rejected, color: "rgba(122, 17, 20, 0.92)" },
        ];

        let offset = 0;
        for (const seg of segments) {
            if (!seg.value) continue;
            const segLen = (seg.value / total) * circumference;
            statusDonutSvg.appendChild(
                svgEl("circle", {
                    cx,
                    cy,
                    r,
                    fill: "none",
                    stroke: seg.color,
                    "stroke-width": stroke,
                    "stroke-linecap": "butt",
                    "stroke-dasharray": `${segLen} ${circumference - segLen}`,
                    "stroke-dashoffset": -offset,
                    transform: `rotate(-90 ${cx} ${cy})`,
                })
            );
            offset += segLen;
        }
    }


    async function refreshDashboardMetrics() {
        startClock();

        // Default placeholders while loading
        setMetricText(metricTotalApplicants, "—");
        setMetricText(metricTotalScholarships, "—");
        setMetricText(metricPendingReview, "—");
        setMetricText(metricApproved, "—");
        setMetricText(metricRejected, "—");

        try {
            const [appsRes, scholarshipsRes] = await Promise.all([
                fetch("/api/applications"),
                fetch("/api/applications/scholarships"),
            ]);

            if (!appsRes.ok) throw new Error("Failed to load applications");
            if (!scholarshipsRes.ok) throw new Error("Failed to load scholarships");

            const apps = await appsRes.json();
            const scholarships = await scholarshipsRes.json();

            const metrics = computeMetricsFromRows(apps, scholarships);

            setMetricText(metricTotalApplicants, formatInt(metrics.totalApplicants));
            setMetricText(metricTotalScholarships, formatInt(metrics.totalScholarships));
            setMetricText(metricPendingReview, formatInt(metrics.pendingReview));
            setMetricText(metricApproved, formatInt(metrics.approved));
            setMetricText(metricRejected, formatInt(metrics.rejected));

            setDashboardNote(true);
            renderStatusDonut(metrics);
        } catch (err) {
            // Fallback to placeholder rows (demo mode) if API/DB isn't available.
            const metrics = computeMetricsFromRows(reviewRows);
            setMetricText(metricTotalApplicants, formatInt(metrics.totalApplicants));
            setMetricText(metricTotalScholarships, formatInt(metrics.totalScholarships));
            setMetricText(metricPendingReview, formatInt(metrics.pendingReview));
            setMetricText(metricApproved, formatInt(metrics.approved));
            setMetricText(metricRejected, formatInt(metrics.rejected));

            setDashboardNote(false);
            renderStatusDonut(metrics);
            console.warn("Dashboard metrics fallback (API unavailable):", err);
        }
    }

    // SPA Navigation Logic
    const navLinks = document.querySelectorAll(".nav-link");
    const sections = document.querySelectorAll(".app-main section");

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
        // Start hidden state, then animate in
        sec.classList.add("view-transition--pre");
        window.requestAnimationFrame(() => {
            sec.classList.remove("view-transition--pre");
        });
    }

    function navigateTo(targetId) {
        if(targetId === "navLogout") return;

        const highlightTarget = targetId === "view-review-detail" ? "view-review" : targetId;

        navLinks.forEach(n => {
            if (n.getAttribute("data-target") === highlightTarget) n.classList.add("active");
            else n.classList.remove("active");
        });

        const nextSection = Array.from(sections).find((sec) => sec.id === targetId) || null;
        if (!nextSection) return;
        if (activeSection && activeSection.id === targetId) return;

        const token = ++navTransitionToken;

        // Do not reveal next view until current view finishes transitioning out.
        if (activeSection) {
            hideSectionWithTransition(activeSection);
            window.setTimeout(() => {
                if (token !== navTransitionToken) return;

                showSectionWithTransition(nextSection);
                activeSection = nextSection;

                if (targetId === "view-review") renderReviewTable();
                if (targetId === "view-admin") refreshDashboardMetrics();
            }, VIEW_TRANSITION_MS);
        } else {
            showSectionWithTransition(nextSection);
            activeSection = nextSection;

            if (targetId === "view-review") renderReviewTable();
            if (targetId === "view-admin") refreshDashboardMetrics();
        }
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
            autoVetStatus: "Pending",
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

    // Initial dashboard paint
    refreshDashboardMetrics();

    function renderReviewTable() {
        const tbody = document.getElementById("adminReviewTableBody");
        if (!tbody) return;

        tbody.innerHTML = reviewRows
            .map((row) => {
                const statusClass =
                    row.autoVetStatus === "Approved"
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

        // Navigate via our nice animation wrapper, it will auto-highlight "view-review"
        navigateTo("view-review-detail");

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
        // Delay long enough for the page to be visible (220ms typical transition + 50 buffer)
        setTimeout(calculateProgress, 270);
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
});
