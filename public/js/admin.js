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
        if (!cb) {
            closeModal();
            return;
        }

        let shouldClose = true;
        try {
            shouldClose = cb() !== false;
        } catch (error) {
            console.error("Modal confirm callback failed:", error);
        }

        if (shouldClose) {
            closeModal();
        }
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
    const notifFilterBtns = notifDropdown
        ? Array.from(notifDropdown.querySelectorAll(".filter-btn"))
        : [];
    const ADMIN_NOTIFICATION_REFRESH_MS = 10000;
    let adminNotificationRows = [];
    let adminNotificationFilterMode = "all";
    let adminNotificationRefreshTimer = null;

    function getCurrentAdminId() {
        const adminId = Number(currentUser?.admin_id ?? currentUser?.id);
        if (Number.isInteger(adminId) && adminId > 0) return adminId;

        const legacyLogin = String(currentUser?.studentId || currentUser?.username || "").trim().toLowerCase();
        if (legacyLogin === "admin") return 1;

        return null;
    }

    function notificationIconClass(notificationType) {
        const type = String(notificationType || "").toUpperCase();
        if (type === "APPLICATION_STATUS") return "update";
        if (type === "NEW_APPLICATION") return "update";
        return "system";
    }

    function formatRelativeTime(input) {
        const date = new Date(input);
        if (Number.isNaN(date.getTime())) return "Just now";

        const diffMs = Date.now() - date.getTime();
        const mins = Math.floor(diffMs / (60 * 1000));
        if (mins < 1) return "Just now";
        if (mins < 60) return `${mins} min ago`;

        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours} hr ago`;

        const days = Math.floor(hours / 24);
        if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;

        return formatDateOnly(input);
    }

    function notificationDetailsHtml(row) {
        const details = [];

        details.push(row.message || "No additional details provided.");

        if (row.reference_type === "application" && row.reference_id !== null && row.reference_id !== undefined) {
            details.push(`Application ID: ${row.reference_id}`);
        }

        if (row.reference_type === "scholarship" && row.reference_id !== null && row.reference_id !== undefined) {
            details.push(`Scholarship ID: ${row.reference_id}`);
        }

        const created = new Date(row.created_at);
        if (!Number.isNaN(created.getTime())) {
            details.push(`Received: ${created.toLocaleString()}`);
        }

        return details.map((line) => escapeHtml(String(line))).join("<br/>");
    }

    function updateNotificationBadge() {
        if (!notifBadgeCount) return;

        const unreadCount = adminNotificationRows.filter((item) => !item.is_read).length;
        if (unreadCount <= 0) {
            notifBadgeCount.style.display = "none";
            return;
        }

        notifBadgeCount.style.display = "inline-flex";
        notifBadgeCount.textContent = String(unreadCount);
    }

    function applyNotificationFilter(mode = adminNotificationFilterMode) {
        if (!notifBodyList) return;

        adminNotificationFilterMode = mode;
        const items = Array.from(notifBodyList.querySelectorAll(".notif-item"));

        for (const item of items) {
            if (mode === "unread" && !item.classList.contains("unread")) {
                item.style.display = "none";
            } else {
                item.style.display = "flex";
            }
        }
    }

    function renderNotificationList() {
        if (!notifBodyList) return;

        if (!adminNotificationRows.length) {
            notifBodyList.innerHTML = `
                <div class="notif-section-title">Notifications</div>
                <div class="notif-item" style="cursor: default;">
                    <div class="notif-icon system">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                        </svg>
                    </div>
                    <div class="notif-content">
                        <p>No admin notifications yet.</p>
                        <span class="notif-time">We'll show scholarship and review updates here.</span>
                        <div class="notif-details">New submissions, published scholarships, and decision updates will appear in this bell.</div>
                    </div>
                </div>
            `;
            updateNotificationBadge();
            return;
        }

        notifBodyList.innerHTML = `
            <div class="notif-section-title">Recent</div>
            ${adminNotificationRows.map((row) => {
                const unreadClass = row.is_read ? "" : "unread";
                const iconClass = notificationIconClass(row.notification_type);
                const dotStyle = row.is_read ? "style=\"display:none\"" : "";
                return `
                    <div class="notif-item ${unreadClass}" data-notification-id="${escapeHtml(String(row.notification_id || ""))}">
                        <div class="notif-icon ${iconClass}">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12zM7 9h10v2H7zM7 12h7v2H7z" />
                            </svg>
                        </div>
                        <div class="notif-content">
                            <p><strong>${escapeHtml(row.title || "Notification")}</strong></p>
                            <span class="notif-time">${escapeHtml(formatRelativeTime(row.created_at))}</span>
                            <div class="notif-details">${notificationDetailsHtml(row)}</div>
                        </div>
                        <div class="notif-unread-dot" ${dotStyle}></div>
                    </div>
                `;
            }).join("")}
        `;

        updateNotificationBadge();
        applyNotificationFilter(adminNotificationFilterMode);
    }

    async function markAdminNotificationRead(notificationId) {
        const adminId = getCurrentAdminId();
        if (!adminId || !Number.isFinite(Number(notificationId))) return;

        try {
            await fetch(`/api/applications/notifications/admin/${encodeURIComponent(notificationId)}/read`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ admin_id: adminId }),
            });
        } catch (error) {
            console.error("Failed to mark admin notification as read:", error);
        }
    }

    async function fetchAdminNotifications(options = {}) {
        const { silent = false } = options;
        const adminId = getCurrentAdminId();

        if (!adminId) {
            adminNotificationRows = [];
            renderNotificationList();
            return;
        }

        try {
            const res = await fetch(`/api/applications/notifications/admin/${encodeURIComponent(adminId)}?_ts=${Date.now()}`, {
                cache: "no-store",
            });
            if (!res.ok) throw new Error("Failed to load notifications.");

            const body = await res.json();
            const list = Array.isArray(body?.notifications)
                ? body.notifications
                : (Array.isArray(body) ? body : []);

            adminNotificationRows = list.map((item) => ({
                notification_id: Number(item.notification_id),
                title: item.title || "Notification",
                message: item.message || "",
                notification_type: item.notification_type || "SYSTEM",
                reference_type: item.reference_type || "system",
                reference_id: item.reference_id,
                is_read: Boolean(item.is_read),
                created_at: item.created_at,
            })).filter((item) => Number.isFinite(item.notification_id));

            renderNotificationList();
        } catch (error) {
            if (!silent) {
                console.error("Failed to fetch admin notifications:", error);
                adminNotificationRows = [];
                renderNotificationList();
            }
        }
    }

    if (notifToggle && notifDropdown && notifBodyList) {
        notifToggle.addEventListener("click", (e) => {
            e.stopPropagation();
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

        notifFilterBtns.forEach((btn) => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                notifFilterBtns.forEach((b) => b.classList.remove("active"));
                btn.classList.add("active");

                const mode = btn.getAttribute("data-filter") || "all";
                applyNotificationFilter(mode);
            });
        });

        notifBodyList.addEventListener("click", (e) => {
            e.stopPropagation();
            const item = e.target.closest(".notif-item[data-notification-id]");
            if (!item) return;

            item.classList.toggle("is-expanded");

            const notificationId = Number(item.getAttribute("data-notification-id"));
            if (!Number.isFinite(notificationId)) return;

            const matched = adminNotificationRows.find((row) => row.notification_id === notificationId);
            if (matched && !matched.is_read) {
                matched.is_read = true;
                item.classList.remove("unread");

                const dot = item.querySelector(".notif-unread-dot");
                if (dot) dot.style.display = "none";

                updateNotificationBadge();

                if (adminNotificationFilterMode === "unread") {
                    item.style.display = "none";
                }

                markAdminNotificationRead(notificationId);
            }
        });

        renderNotificationList();
        fetchAdminNotifications();

        adminNotificationRefreshTimer = window.setInterval(() => {
            if (!document.hidden) {
                fetchAdminNotifications({ silent: true });
            }
        }, ADMIN_NOTIFICATION_REFRESH_MS);

        window.addEventListener("focus", () => {
            fetchAdminNotifications({ silent: true });
        });

        window.addEventListener("beforeunload", () => {
            if (adminNotificationRefreshTimer) {
                window.clearInterval(adminNotificationRefreshTimer);
                adminNotificationRefreshTimer = null;
            }
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
    const dashboardStatButtons = Array.from(document.querySelectorAll(".dash-metric-btn[data-dashboard-stat]"));
    const dashboardStatsModal = document.getElementById("dashboardStatsModal");
    const dashboardStatsModalTitle = document.getElementById("dashboardStatsModalTitle");
    const dashboardStatsModalMeta = document.getElementById("dashboardStatsModalMeta");
    const dashboardStatsModalBody = document.getElementById("dashboardStatsModalBody");
    const dashboardStatsModalClose = document.getElementById("dashboardStatsModalClose");

    const DASHBOARD_STAT_CATEGORY_META = {
        "total-applicants": {
            title: "Total Applicants",
            subtitle: "Showing one row per applicant using their latest application.",
            dateColumnLabel: "Date Applied",
        },
        scholarships: {
            title: "Scholarships",
            subtitle: "Showing all available scholarship programs.",
            dateColumnLabel: "Deadline",
        },
        "pending-review": {
            title: "Pending Review",
            subtitle: "Applications currently waiting for a final decision.",
            dateColumnLabel: "Date Applied",
        },
        approved: {
            title: "Approved Applications",
            subtitle: "Applications that have been approved by the admin.",
            dateColumnLabel: "Date Applied",
        },
        rejected: {
            title: "Rejected Applications",
            subtitle: "Applications that have been rejected by the admin.",
            dateColumnLabel: "Date Applied",
        },
    };

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


    async function refreshDashboardMetrics(options = {}) {
        const { showLoadingPlaceholders = true } = options;

        startClock();

        // Default placeholders while loading
        if (showLoadingPlaceholders) {
            setMetricText(metricTotalApplicants, "—");
            setMetricText(metricTotalScholarships, "—");
            setMetricText(metricPendingReview, "—");
            setMetricText(metricApproved, "—");
            setMetricText(metricRejected, "—");
        }

        try {
            const [appsRes, scholarshipsRes] = await Promise.all([
                fetch("/api/applications"),
                fetch("/api/applications/scholarships"),
            ]);

            if (!appsRes.ok) throw new Error("Failed to load applications");
            if (!scholarshipsRes.ok) throw new Error("Failed to load scholarships");

            const apps = await appsRes.json();
            const scholarships = await scholarshipsRes.json();

            dashboardApplicationRows = Array.isArray(apps) ? apps : [];
            dashboardScholarshipRows = Array.isArray(scholarships) ? scholarships : [];
            dashboardDataIsLive = true;

            const metrics = computeMetricsFromRows(dashboardApplicationRows, dashboardScholarshipRows);

            setMetricText(metricTotalApplicants, formatInt(metrics.totalApplicants));
            setMetricText(metricTotalScholarships, formatInt(metrics.totalScholarships));
            setMetricText(metricPendingReview, formatInt(metrics.pendingReview));
            setMetricText(metricApproved, formatInt(metrics.approved));
            setMetricText(metricRejected, formatInt(metrics.rejected));

            setDashboardNote(true);
            renderStatusDonut(metrics);
        } catch (err) {
            // Fallback to placeholder rows (demo mode) if API/DB isn't available.
            dashboardApplicationRows = Array.isArray(reviewRows) ? reviewRows.map((row) => ({ ...row })) : [];
            dashboardScholarshipRows = Array.isArray(adminScholarshipRows) ? adminScholarshipRows.map((row) => ({ ...row })) : [];
            dashboardDataIsLive = false;

            const metrics = computeMetricsFromRows(dashboardApplicationRows, dashboardScholarshipRows);
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

        if (targetId !== "view-review" && targetId !== "view-review-detail") {
            closeAdminDocumentsModal();
        }

        if (targetId !== "view-admin") {
            closeDashboardStatsModal();
        }

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

                if (targetId === "view-review") loadReviewRows();
                if (targetId === "view-admin") refreshDashboardMetrics();
                if (targetId === "view-add-scholarship" || targetId === "view-remove-scholarship") loadAdminScholarships();
            }, VIEW_TRANSITION_MS);
        } else {
            showSectionWithTransition(nextSection);
            activeSection = nextSection;

            if (targetId === "view-review") loadReviewRows();
            if (targetId === "view-admin") refreshDashboardMetrics();
            if (targetId === "view-add-scholarship" || targetId === "view-remove-scholarship") loadAdminScholarships();
        }
    }

    navLinks.forEach(link => {
        link.addEventListener("click", (e) => {
            const targetId = e.target.getAttribute("data-target");
            if(targetId) navigateTo(targetId);
        });
    });

    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
    }

    function normalizeStatusLabel(rawStatus) {
        const normalized = String(rawStatus || "Pending").trim().toLowerCase();
        if (normalized.includes("approve")) return "Approved";
        if (normalized.includes("denied")) return "Rejected";
        if (normalized.includes("reject")) return "Rejected";
        if (normalized.includes("review")) return "Under Review";
        if (normalized.includes("incomplete")) return "Incomplete";
        if (normalized.includes("eligible")) return "Eligible";
        if (normalized.includes("submit")) return "Submitted";
        return "Pending";
    }

    function statusToBadgeClass(status) {
        if (status === "Approved") return "status-approved";
        if (status === "Rejected") return "status-rejected";
        if (status === "Incomplete") return "status-incomplete";
        return "status-pending";
    }

    function formatDateOnly(input) {
        if (!input) return "N/A";
        const d = new Date(input);
        if (Number.isNaN(d.getTime())) return String(input);
        return d.toISOString().slice(0, 10);
    }

    function normalizeDashboardApplicationRow(raw) {
        const status = normalizeStatusLabel(raw?.status || raw?.application_status || raw?.autoVetStatus);
        const rawApplicationId = raw?.application_id ?? raw?.id ?? "";
        const applicationId = rawApplicationId !== "" ? String(rawApplicationId) : "N/A";
        const applicantName =
            raw?.student_name || raw?.applicant || raw?.name || raw?.full_name || "Unknown Applicant";
        const scholarshipTitle = raw?.scholarship_title || raw?.scholarship || raw?.title || "N/A";
        const appliedAtRaw = raw?.applied_at || raw?.submittedAt || raw?.submitted_at || null;

        return {
            sourceType: "application",
            applicantName: String(applicantName),
            scholarshipTitle: String(scholarshipTitle),
            applicationId,
            status,
            dateApplied: formatDateOnly(appliedAtRaw),
            studentId: String(raw?.student_id || raw?.studentId || ""),
            appliedAtRaw,
            sortApplicationId: Number(rawApplicationId),
        };
    }

    function normalizeDashboardScholarshipRow(raw) {
        const rawScholarshipId = raw?.id ?? raw?.scholarship_id ?? "";
        const scholarshipId = Number.isFinite(Number(rawScholarshipId))
            ? `SCH-${Number(rawScholarshipId)}`
            : "N/A";
        const scholarshipTitle = raw?.title || raw?.scholarship_title || "Untitled Scholarship";
        const deadlineOrDate = raw?.deadline || raw?.created_at || raw?.updated_at || null;
        const status = normalizeScholarshipStatus(raw?.status || "published");

        return {
            sourceType: "scholarship",
            applicantName: "N/A",
            scholarshipTitle: String(scholarshipTitle),
            applicationId: scholarshipId,
            status,
            dateApplied: formatDateOnly(deadlineOrDate),
            sortScholarshipId: Number(rawScholarshipId),
        };
    }

    function toSortableTimestamp(value) {
        const ts = new Date(value || "").getTime();
        return Number.isNaN(ts) ? 0 : ts;
    }

    function sortDashboardApplicationRows(rows) {
        return rows
            .slice()
            .sort((a, b) => {
                const byTime = toSortableTimestamp(b.appliedAtRaw) - toSortableTimestamp(a.appliedAtRaw);
                if (byTime !== 0) return byTime;

                const aId = Number.isFinite(Number(a.sortApplicationId)) ? Number(a.sortApplicationId) : 0;
                const bId = Number.isFinite(Number(b.sortApplicationId)) ? Number(b.sortApplicationId) : 0;
                return bId - aId;
            });
    }

    function buildUniqueApplicantRows(rows) {
        const latestByApplicant = new Map();

        for (const row of rows) {
            const keyBase = row.studentId || row.applicantName;
            const dedupeKey = String(keyBase || "unknown").trim().toLowerCase();
            if (!latestByApplicant.has(dedupeKey)) {
                latestByApplicant.set(dedupeKey, row);
            }
        }

        return Array.from(latestByApplicant.values());
    }

    function buildDashboardStatRows(categoryKey) {
        const applicationRows = sortDashboardApplicationRows(
            (Array.isArray(dashboardApplicationRows) ? dashboardApplicationRows : [])
                .map((row) => normalizeDashboardApplicationRow(row))
        );

        if (categoryKey === "total-applicants") {
            return buildUniqueApplicantRows(applicationRows);
        }

        if (categoryKey === "pending-review") {
            return applicationRows.filter((row) => row.status !== "Approved" && row.status !== "Rejected");
        }

        if (categoryKey === "approved") {
            return applicationRows.filter((row) => row.status === "Approved");
        }

        if (categoryKey === "rejected") {
            return applicationRows.filter((row) => row.status === "Rejected");
        }

        if (categoryKey === "scholarships") {
            return (Array.isArray(dashboardScholarshipRows) ? dashboardScholarshipRows : [])
                .map((row) => normalizeDashboardScholarshipRow(row))
                .sort((a, b) => {
                    const aId = Number.isFinite(Number(a.sortScholarshipId)) ? Number(a.sortScholarshipId) : 0;
                    const bId = Number.isFinite(Number(b.sortScholarshipId)) ? Number(b.sortScholarshipId) : 0;
                    return bId - aId;
                });
        }

        return [];
    }

    function renderDashboardStatsModalRows(categoryKey) {
        if (!dashboardStatsModalBody) return;

        const categoryMeta = DASHBOARD_STAT_CATEGORY_META[categoryKey];
        const rows = buildDashboardStatRows(categoryKey);
        const dateColumnLabel = categoryMeta?.dateColumnLabel || "Date Applied";

        if (!rows.length) {
            dashboardStatsModalBody.innerHTML =
                '<div class="dashboard-stats-empty">No records found for this category.</div>';
            return;
        }

        dashboardStatsModalBody.innerHTML = `
            <div class="dashboard-stats-table-wrap">
                <table class="data-table data-table--justified dashboard-stats-table">
                    <thead>
                        <tr>
                            <th>Applicant Name</th>
                            <th>Scholarship Title</th>
                            <th>Application ID</th>
                            <th>Status</th>
                            <th>${escapeHtml(dateColumnLabel)}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map((row) => {
                            const statusBadge = row.sourceType === "application"
                                ? `<span class="status-badge ${statusToBadgeClass(row.status)}">${escapeHtml(row.status)}</span>`
                                : escapeHtml(row.status);

                            return `
                                <tr>
                                    <td>${escapeHtml(row.applicantName)}</td>
                                    <td>${escapeHtml(row.scholarshipTitle)}</td>
                                    <td>${escapeHtml(row.applicationId)}</td>
                                    <td>${statusBadge}</td>
                                    <td>${escapeHtml(row.dateApplied)}</td>
                                </tr>
                            `;
                        }).join("")}
                    </tbody>
                </table>
            </div>
        `;
    }

    function closeDashboardStatsModal() {
        if (!dashboardStatsModal || dashboardStatsModal.classList.contains("hidden")) {
            return;
        }

        dashboardStatsModal.classList.remove("is-open");
        dashboardStatsModal.classList.add("is-closing");

        window.setTimeout(() => {
            dashboardStatsModal.classList.remove("is-closing");
            dashboardStatsModal.classList.add("hidden");
        }, MODAL_TRANSITION_MS);
    }

    async function openDashboardStatsModal(categoryKey) {
        if (!dashboardStatsModal || !dashboardStatsModalBody) return;

        const categoryMeta = DASHBOARD_STAT_CATEGORY_META[categoryKey];
        if (!categoryMeta) return;

        if (dashboardStatsModalTitle) {
            dashboardStatsModalTitle.textContent = categoryMeta.title;
        }

        if (dashboardStatsModalMeta) {
            const sourceText = dashboardDataIsLive
                ? "Data source: live API."
                : "Data source: demo fallback.";
            dashboardStatsModalMeta.textContent = `${categoryMeta.subtitle} ${sourceText}`;
        }

        dashboardStatsModalBody.innerHTML = '<div class="dashboard-stats-empty">Loading records...</div>';
        dashboardStatsModal.classList.remove("hidden");
        dashboardStatsModal.classList.remove("is-closing");

        window.requestAnimationFrame(() => {
            dashboardStatsModal.classList.add("is-open");
        });

        await refreshDashboardMetrics({ showLoadingPlaceholders: false });

        if (dashboardStatsModal.classList.contains("hidden")) return;

        if (dashboardStatsModalMeta) {
            const sourceText = dashboardDataIsLive
                ? "Data source: live API."
                : "Data source: demo fallback.";
            dashboardStatsModalMeta.textContent = `${categoryMeta.subtitle} ${sourceText}`;
        }

        renderDashboardStatsModalRows(categoryKey);
    }

    const ADMIN_DOCUMENT_REQUIREMENTS = [
        { code: "identity", label: "Proof of Identity" },
        { code: "academic", label: "Academic Proof" },
        { code: "enrollment", label: "Enrollment Proof" },
        { code: "income", label: "Proof of Income" },
        { code: "character", label: "Character Reference" },
        { code: "photo", label: "Recent Photo" },
    ];

    // Add scholarship form handler
    const addScholarshipForm = document.getElementById("addScholarshipForm");
    const scholarshipTitleInput = document.getElementById("scholarshipTitle");
    const scholarshipDescriptionInput = document.getElementById("scholarshipDescription");
    const scholarshipMinimumGwaInput = document.getElementById("scholarshipMinimumGwa");
    const scholarshipDeadlineInput = document.getElementById("scholarshipDeadline");
    const adminScholarshipTableBody = document.getElementById("adminScholarshipTableBody");
    const btnShowSubmittedDocs = document.getElementById("btnShowSubmittedDocs");
    const adminDocumentsModal = document.getElementById("adminDocumentsModal");
    const adminDocumentsModalTitle = document.getElementById("adminDocumentsModalTitle");
    const adminDocumentsModalMeta = document.getElementById("adminDocumentsModalMeta");
    const adminDocumentsModalBody = document.getElementById("adminDocumentsModalBody");
    const adminDocumentsModalClose = document.getElementById("adminDocumentsModalClose");

    if (scholarshipDeadlineInput) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yyyy = String(today.getFullYear());
        const mm = String(today.getMonth() + 1).padStart(2, "0");
        const dd = String(today.getDate()).padStart(2, "0");
        scholarshipDeadlineInput.min = `${yyyy}-${mm}-${dd}`;
    }

    if (addScholarshipForm) {
        addScholarshipForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            if (!addScholarshipForm.reportValidity()) return;

            const deadlineValue = scholarshipDeadlineInput ? scholarshipDeadlineInput.value : "";
            if (deadlineValue) {
                const now = new Date();
                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const deadlineDate = new Date(`${deadlineValue}T00:00:00`);

                if (Number.isNaN(deadlineDate.getTime()) || deadlineDate < today) {
                    window.showModal(
                        "Invalid Deadline",
                        "Please select a deadline that is today or later."
                    );
                    if (scholarshipDeadlineInput) scholarshipDeadlineInput.focus();
                    return;
                }
            }

            const minimumGwa = scholarshipMinimumGwaInput
                ? Number(scholarshipMinimumGwaInput.value)
                : Number.NaN;

            if (!Number.isFinite(minimumGwa) || minimumGwa < 1 || minimumGwa > 5) {
                window.showModal(
                    "Invalid Minimum GWA",
                    "Please enter a valid minimum GWA between 1.00 and 5.00."
                );
                if (scholarshipMinimumGwaInput) scholarshipMinimumGwaInput.focus();
                return;
            }

            const payload = {
                title: scholarshipTitleInput ? scholarshipTitleInput.value.trim() : "",
                description: scholarshipDescriptionInput ? scholarshipDescriptionInput.value.trim() : "",
                deadline: deadlineValue,
                min_gpa: minimumGwa,
                status: "published",
                admin_id: currentUser?.admin_id || currentUser?.id || null,
            };

            try {
                const publishRes = await fetch("/api/applications/scholarships", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });

                let responseBody = null;
                try {
                    responseBody = await publishRes.json();
                } catch {
                    responseBody = null;
                }

                if (!publishRes.ok) {
                    throw new Error(responseBody?.error || "Unable to publish scholarship.");
                }

                addScholarshipForm.reset();
                window.showModal(
                    "Published",
                    `Scholarship <b>${escapeHtml(payload.title)}</b> has been published successfully.`
                );

                await Promise.all([
                    refreshDashboardMetrics(),
                    loadAdminScholarships(),
                ]);
            } catch (error) {
                window.showModal("Publish Failed", escapeHtml(error.message || "Unable to publish scholarship."));
            }
        });
    }

    let reviewRows = [];
    let selectedApplicationId = null;
    let adminScholarshipRows = [];
    let dashboardApplicationRows = [];
    let dashboardScholarshipRows = [];
    let dashboardDataIsLive = false;
    const ADMIN_REVIEW_REFRESH_MS = 2000;
    let adminReviewRefreshTimer = null;
    let adminReviewRefreshBusy = false;
    let lastReviewRowsSnapshot = "";
    const lastReviewDocumentsSnapshotByApplication = new Map();
    let activeAdminDocumentsApplicationId = null;
    let activeAdminDocumentsApplicationLabel = "";
    let activeAdminDocumentsStudentName = "";
    let activeAdminDocumentsStudentId = "";
    let lastAdminDocumentsModalSnapshot = "";

    function buildReviewRowsSnapshot(rows) {
        if (!Array.isArray(rows)) return "[]";
        return JSON.stringify(
            rows.map((row) => ({
                id: String(row.id || ""),
                status: String(row.autoVetStatus || ""),
                rejectionReason: String(row.rejectionReason || ""),
                progress: Number(row.reviewProgress || 0),
                isDecided: Boolean(row.isDecided),
                scholarship: String(row.scholarship || ""),
                gpa: String(row.gpa || ""),
                submittedAt: String(row.submittedAt || ""),
                docCount: Array.isArray(row.documents) ? row.documents.length : 0,
            }))
        );
    }

    function buildReviewDocumentsSnapshot(docs) {
        const rows = Array.isArray(docs) ? docs : [];
        return JSON.stringify(
            rows.map((doc) => ({
                id: String(doc.document_id ?? ""),
                file: String(doc.original_filename || ""),
                type: String(doc.document_type_name || doc.document_type_code || ""),
                url: String(doc.file_url || ""),
                uploadedAt: String(doc.uploaded_at || doc.created_at || ""),
                active: String(doc.is_active ?? ""),
            }))
        );
    }

    function normalizeScholarshipStatus(rawStatus) {
        const value = String(rawStatus || "published").trim().toLowerCase();
        if (value === "published") return "Published";
        if (value === "draft") return "Draft";
        if (value === "closed") return "Closed";
        if (value === "archived") return "Archived";
        return value || "Unknown";
    }

    function renderAdminScholarshipTable() {
        if (!adminScholarshipTableBody) return;

        if (!adminScholarshipRows.length) {
            adminScholarshipTableBody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; color: #6c757d;">No scholarships found.</td>
                </tr>
            `;
            return;
        }

        adminScholarshipTableBody.innerHTML = adminScholarshipRows
            .map((row) => {
                const status = normalizeScholarshipStatus(row.status);
                const deadline = row.deadline ? formatDateOnly(row.deadline) : "N/A";
                const minGpa = Number.isFinite(Number(row.min_gpa)) ? Number(row.min_gpa).toFixed(2) : "N/A";

                return `
                    <tr>
                        <td>${escapeHtml(row.title || "Untitled Scholarship")}</td>
                        <td>${escapeHtml(minGpa)}</td>
                        <td>${escapeHtml(status)}</td>
                        <td>${escapeHtml(deadline)}</td>
                        <td>
                            <button
                                class="btn btn-sm"
                                type="button"
                                data-action="remove-scholarship"
                                data-scholarship-id="${escapeHtml(String(row.id || ""))}"
                                data-scholarship-title="${escapeHtml(row.title || "Untitled Scholarship")}">
                                Remove
                            </button>
                        </td>
                    </tr>
                `;
            })
            .join("");
    }

    async function loadAdminScholarships() {
        if (!adminScholarshipTableBody) return;

        adminScholarshipTableBody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; color: #6c757d;">Loading scholarships...</td>
            </tr>
        `;

        try {
            const res = await fetch(`/api/applications/scholarships?_ts=${Date.now()}`, { cache: "no-store" });
            if (!res.ok) throw new Error("Failed to load scholarships.");

            const rows = await res.json();
            adminScholarshipRows = Array.isArray(rows)
                ? rows
                    .filter((row) => Number.isInteger(Number(row?.id)) && Number(row.id) > 0)
                    .sort((a, b) => Number(b.id) - Number(a.id))
                : [];
            dashboardScholarshipRows = adminScholarshipRows.map((row) => ({ ...row }));

            renderAdminScholarshipTable();
        } catch (error) {
            console.error("Unable to load scholarship management list:", error);
            adminScholarshipRows = [];
            adminScholarshipTableBody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; color: #6c757d;">Unable to load scholarships right now.</td>
                </tr>
            `;
        }
    }

    function mapReviewRow(raw) {
        const status = normalizeStatusLabel(raw.status || raw.application_status || raw.autoVetStatus);
        const decided = status === "Approved" || status === "Rejected";
        const gpaRaw = raw.submitted_gpa ?? raw.gpa ?? raw.submittedGpa;
        const gpa = Number.isFinite(Number(gpaRaw)) ? Number(gpaRaw).toFixed(2) : "N/A";
        const rejectionReason = String(raw.rejection_reason || raw.decision_notes || raw.change_note || "").trim();

        return {
            id: String(raw.application_id || raw.id || ""),
            applicant: raw.student_name || raw.applicant || raw.name || "Unknown Applicant",
            studentId: raw.student_id || raw.studentId || "N/A",
            scholarship: raw.scholarship_title || raw.scholarship || "Untitled Scholarship",
            gpa,
            submittedAt: formatDateOnly(raw.applied_at || raw.submittedAt),
            autoVetStatus: status,
            reviewProgress: decided ? 100 : 0,
            isDecided: decided,
            essay: raw.essay || raw.letter_of_intent || raw.application_letter_of_intent || "No essay submitted.",
            rejectionReason,
            documents: Array.isArray(raw.documents) ? raw.documents : [],
        };
    }

    async function loadReviewRows(options = {}) {
        const { silent = false } = options;
        try {
            const res = await fetch(`/api/applications?_ts=${Date.now()}`, { cache: "no-store" });
            if (!res.ok) throw new Error("Failed to load applications.");
            const rows = await res.json();
            const mappedRows = Array.isArray(rows) ? rows.map(mapReviewRow).filter((row) => row.id) : [];
            const nextSnapshot = buildReviewRowsSnapshot(mappedRows);

            if (silent && nextSnapshot === lastReviewRowsSnapshot) {
                return;
            }

            reviewRows = mappedRows;
            lastReviewRowsSnapshot = nextSnapshot;
            renderReviewTable();
        } catch (error) {
            console.error("Unable to load review rows:", error);
            reviewRows = [];
            lastReviewRowsSnapshot = "";
            if (!silent) {
                renderReviewTable();
            }
        }
    }

    function isReviewViewActive() {
        const viewId = activeSection?.id || "";
        return viewId === "view-review" || viewId === "view-review-detail";
    }

    async function refreshReviewStateSilently() {
        if (adminReviewRefreshBusy) return;
        if (document.hidden) return;
        if (!isReviewViewActive()) return;

        adminReviewRefreshBusy = true;
        try {
            await loadReviewRows({ silent: true });

            if (activeSection?.id === "view-review-detail" && selectedApplicationId) {
                const selectedRow = reviewRows.find((row) => row.id === selectedApplicationId);
                if (selectedRow && !selectedRow.isDecided) {
                    await loadReviewDocuments(selectedApplicationId, selectedRow.documents, { silent: true });
                }
            }

            if (activeAdminDocumentsApplicationId && adminDocumentsModal && !adminDocumentsModal.classList.contains("hidden")) {
                await refreshAdminDocumentsModal({ silent: true });
            }
        } catch (error) {
            console.error("Failed to refresh admin review state:", error);
        } finally {
            adminReviewRefreshBusy = false;
        }
    }

    function startAdminReviewAutoRefresh() {
        if (adminReviewRefreshTimer) {
            window.clearInterval(adminReviewRefreshTimer);
            adminReviewRefreshTimer = null;
        }

        adminReviewRefreshTimer = window.setInterval(() => {
            refreshReviewStateSilently();
        }, ADMIN_REVIEW_REFRESH_MS);
    }

    function renderReviewTable() {
        const tbody = document.getElementById("adminReviewTableBody");
        if (!tbody) return;

        if (!reviewRows.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; color: #6c757d;">No applications found yet.</td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = reviewRows
            .map((row) => {
                const statusClass = statusToBadgeClass(row.autoVetStatus);

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
                        <td>${escapeHtml(row.applicant)}</td>
                        <td>${escapeHtml(row.scholarship)}</td>
                        <td>${escapeHtml(row.gpa)}</td>
                        <td><span class="status-badge ${statusClass}">${escapeHtml(row.autoVetStatus)}</span></td>
                        <td>${progressDisplay}</td>
                        <td>
                            <button class="btn btn-sm" type="button" data-action="review" data-id="${escapeHtml(row.id)}" ${row.isDecided ? 'disabled style="background-color: #e9ecef; cursor: not-allowed; color: #6c757d; border: 1px solid #ced4da;"' : ''}>${buttonText}</button>
                        </td>
                    </tr>
                `;
            })
            .join("");
    }

    let reviewScrollListener = null;

    function renderReviewDocuments(docsEl, docs) {
        if (!docsEl) return;

        if (!Array.isArray(docs) || docs.length === 0) {
            docsEl.innerHTML = "<li>No uploaded documents found for this application.</li>";
            return;
        }

        docsEl.innerHTML = docs
            .map((doc) => {
                const fileName = escapeHtml(doc.original_filename || "document");
                const typeName = escapeHtml(doc.document_type_name || doc.document_type_code || "Document");

                return `<li>${fileName} <span style="color:#6c757d;">(${typeName})</span></li>`;
            })
            .join("");
    }

    async function loadReviewDocuments(applicationId, fallbackDocuments = [], options = {}) {
        const { silent = false } = options;
        const docsEl = document.getElementById("reviewDocs");
        if (!docsEl) return;

        if (!silent) {
            docsEl.innerHTML = "<li>Loading uploaded documents...</li>";
        }

        try {
            const res = await fetch(`/api/applications/${encodeURIComponent(applicationId)}/documents?_ts=${Date.now()}`, {
                cache: "no-store",
            });
            if (!res.ok) throw new Error("Failed to load documents.");

            const docs = await res.json();
            const docRows = Array.isArray(docs) ? docs : [];
            const nextSnapshot = buildReviewDocumentsSnapshot(docRows);
            const key = String(applicationId || "");
            const prevSnapshot = lastReviewDocumentsSnapshotByApplication.get(key) || "";

            if (silent && nextSnapshot === prevSnapshot) {
                return;
            }

            lastReviewDocumentsSnapshotByApplication.set(key, nextSnapshot);
            renderReviewDocuments(docsEl, docRows);
        } catch (error) {
            console.error("Failed to load review documents:", error);

            if (silent) return;

            if (Array.isArray(fallbackDocuments) && fallbackDocuments.length > 0) {
                renderReviewDocuments(docsEl, fallbackDocuments);
            } else {
                docsEl.innerHTML = "<li>Unable to load uploaded documents right now.</li>";
            }
        }
    }

    async function fetchApplicationDocuments(applicationId) {
        const res = await fetch(`/api/applications/${encodeURIComponent(applicationId)}/documents?_ts=${Date.now()}`, {
            cache: "no-store",
        });

        if (!res.ok) {
            let body = null;
            try {
                body = await res.json();
            } catch {
                body = null;
            }
            throw new Error(body?.error || "Unable to load submitted documents.");
        }

        const docs = await res.json();
        return Array.isArray(docs) ? docs : [];
    }

    function buildLatestDocumentByCode(rows) {
        const latest = new Map();

        for (const row of rows || []) {
            const code = String(row?.document_type_code || "").trim().toLowerCase();
            if (!code || latest.has(code)) continue;
            latest.set(code, row);
        }

        return latest;
    }

    function buildAdminSubmittedDocumentsHtml(docs) {
        const latestByCode = buildLatestDocumentByCode(docs);

        return ADMIN_DOCUMENT_REQUIREMENTS.map((reqDoc) => {
            const currentDoc = latestByCode.get(reqDoc.code) || null;

            if (currentDoc) {
                const documentId = Number(currentDoc.document_id);
                const safeDocumentId = Number.isInteger(documentId) && documentId > 0 ? documentId : 0;
                const fileName = escapeHtml(currentDoc.original_filename || "Uploaded document");
                const uploadedAt = escapeHtml(formatDateOnly(currentDoc.uploaded_at));
                const viewAction = currentDoc.file_url
                    ? `<a class="btn btn-gold btn-sm" href="${escapeHtml(currentDoc.file_url)}" target="_blank" rel="noopener">View</a>`
                    : "";

                return `
                    <div class="scholarship-doc-row">
                        <div class="scholarship-doc-row-top">
                            <div class="scholarship-doc-type">${escapeHtml(reqDoc.label)}</div>
                            <div class="scholarship-doc-hint">${uploadedAt}</div>
                        </div>
                        <div class="scholarship-doc-file">${fileName}</div>
                        <div class="scholarship-doc-row-actions">
                            ${viewAction}
                            <button class="btn btn-sm" type="button" data-action="admin-remove-doc" data-document-id="${escapeHtml(String(safeDocumentId))}">Remove</button>
                        </div>
                    </div>
                `;
            }

            return `
                <div class="scholarship-doc-row">
                    <div class="scholarship-doc-row-top">
                        <div class="scholarship-doc-type">${escapeHtml(reqDoc.label)}</div>
                    </div>
                    <div class="scholarship-doc-missing">Missing File</div>
                </div>
            `;
        }).join("");
    }

    async function refreshAdminDocumentsModal(options = {}) {
        const { silent = false } = options;
        if (!activeAdminDocumentsApplicationId || !adminDocumentsModalBody) return;

        if (!silent) {
            adminDocumentsModalBody.innerHTML = '<div class="scholarship-doc-empty">Loading submitted documents...</div>';
        }

        const docs = await fetchApplicationDocuments(activeAdminDocumentsApplicationId);
        const nextSnapshot = buildReviewDocumentsSnapshot(docs);
        if (silent && nextSnapshot === lastAdminDocumentsModalSnapshot) {
            return;
        }

        lastAdminDocumentsModalSnapshot = nextSnapshot;

        if (adminDocumentsModalTitle) {
            adminDocumentsModalTitle.textContent = `${activeAdminDocumentsApplicationLabel || "Submitted Documents"}`;
        }

        if (adminDocumentsModalMeta) {
            adminDocumentsModalMeta.textContent = `Applicant: ${activeAdminDocumentsStudentName || "N/A"} | Application ID: ${activeAdminDocumentsApplicationId}`;
        }

        const nextHtml = buildAdminSubmittedDocumentsHtml(docs);
        if (adminDocumentsModalBody.innerHTML !== nextHtml) {
            adminDocumentsModalBody.innerHTML = nextHtml;
        }
    }

    function openAdminDocumentsModal(row) {
        const applicationId = Number(row?.id);
        if (!Number.isInteger(applicationId) || applicationId <= 0) return;
        if (!adminDocumentsModal) return;

        activeAdminDocumentsApplicationId = applicationId;
        activeAdminDocumentsApplicationLabel = row?.scholarship || "Submitted Documents";
        activeAdminDocumentsStudentName = row?.applicant || "Unknown Applicant";
        activeAdminDocumentsStudentId = String(row?.studentId || "").trim();
        lastAdminDocumentsModalSnapshot = "";

        refreshAdminDocumentsModal().catch((error) => {
            if (adminDocumentsModalBody) {
                adminDocumentsModalBody.innerHTML = `<div class="scholarship-doc-empty">${escapeHtml(error.message || "Unable to load submitted documents.")}</div>`;
            }
        });

        adminDocumentsModal.classList.remove("hidden");
        adminDocumentsModal.classList.remove("is-closing");
        window.requestAnimationFrame(() => {
            adminDocumentsModal.classList.add("is-open");
        });
    }

    function closeAdminDocumentsModal() {
        if (!adminDocumentsModal || adminDocumentsModal.classList.contains("hidden")) {
            activeAdminDocumentsApplicationId = null;
            return;
        }

        adminDocumentsModal.classList.remove("is-open");
        adminDocumentsModal.classList.add("is-closing");

        window.setTimeout(() => {
            adminDocumentsModal.classList.remove("is-closing");
            adminDocumentsModal.classList.add("hidden");
        }, MODAL_TRANSITION_MS);

        activeAdminDocumentsApplicationId = null;
        activeAdminDocumentsApplicationLabel = "";
        activeAdminDocumentsStudentName = "";
        activeAdminDocumentsStudentId = "";
        lastAdminDocumentsModalSnapshot = "";
    }

    async function removeApplicationDocumentFromAdmin(applicationId, documentId) {
        const res = await fetch(
            `/api/applications/${encodeURIComponent(applicationId)}/documents/${encodeURIComponent(documentId)}`,
            { method: "DELETE" }
        );

        let body = null;
        let rawText = "";
        try {
            rawText = await res.text();
            body = rawText ? JSON.parse(rawText) : null;
        } catch {
            body = null;
        }

        if (res.ok) {
            return body;
        }

        const primaryErrorText = body?.error || rawText.trim() || "";
        const canFallbackToStudentDelete =
            (res.status === 404 || /cannot delete/i.test(primaryErrorText)) &&
            activeAdminDocumentsStudentId &&
            activeAdminDocumentsStudentId !== "N/A";

        if (canFallbackToStudentDelete) {
            const fallbackRes = await fetch(
                `/api/applications/student/${encodeURIComponent(activeAdminDocumentsStudentId)}/documents/${encodeURIComponent(documentId)}`,
                { method: "DELETE" }
            );

            let fallbackBody = null;
            let fallbackText = "";
            try {
                fallbackText = await fallbackRes.text();
                fallbackBody = fallbackText ? JSON.parse(fallbackText) : null;
            } catch {
                fallbackBody = null;
            }

            if (fallbackRes.ok) {
                return fallbackBody;
            }

            throw new Error(
                fallbackBody?.error ||
                fallbackText.trim() ||
                `Unable to remove document (HTTP ${fallbackRes.status}).`
            );
        }

        throw new Error(primaryErrorText || `Unable to remove document (HTTP ${res.status}).`);
    }

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

        if (btnShowSubmittedDocs) {
            btnShowSubmittedDocs.disabled = false;
            btnShowSubmittedDocs.setAttribute("data-id", String(row.id));
        }

        loadReviewDocuments(applicationId, row.documents);

        // Navigate via our animation wrapper; this keeps the review nav highlighted.
        navigateTo("view-review-detail");

        if (reviewScrollListener) {
            window.removeEventListener("scroll", reviewScrollListener);
            window.removeEventListener("resize", reviewScrollListener);
            reviewScrollListener = null;
        }

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

        if (row.reviewProgress === 0) row.reviewProgress = 1;

        reviewScrollListener = calculateProgress;
        window.addEventListener("scroll", reviewScrollListener);
        window.addEventListener("resize", reviewScrollListener);
        setTimeout(calculateProgress, 270);
    }

    async function decideApplication(nextStatus, rejectionReason = "") {
        if (!selectedApplicationId) return;

        const appId = selectedApplicationId;
        const payload = { status: nextStatus };

        if (nextStatus === "Rejected") {
            payload.rejection_reason = String(rejectionReason || "").trim();
        }

        try {
            const res = await fetch(`/api/applications/${encodeURIComponent(appId)}/status`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            let body = null;
            try {
                body = await res.json();
            } catch {
                body = null;
            }

            if (!res.ok) {
                throw new Error(body?.error || "Unable to update application status.");
            }

            await loadReviewRows();
            await refreshDashboardMetrics();

            window.showModal(
                "Updated",
                `Application <b>${escapeHtml(appId)}</b> is now <b>${escapeHtml(nextStatus)}</b>.`
            );

            navigateTo("view-review");
        } catch (error) {
            window.showModal("Update Failed", escapeHtml(error.message || "Unable to update application status."));
        }
    }

    async function removeScholarship(scholarshipId) {
        const id = Number(scholarshipId);
        if (!Number.isInteger(id) || id <= 0) {
            window.showModal("Remove Failed", "Invalid scholarship ID.");
            return;
        }

        try {
            const res = await fetch(`/api/applications/scholarships/${encodeURIComponent(id)}`, {
                method: "DELETE",
            });

            let body = null;
            try {
                body = await res.json();
            } catch {
                body = null;
            }

            if (!res.ok) {
                throw new Error(body?.error || "Unable to remove scholarship.");
            }

            await Promise.all([
                loadAdminScholarships(),
                loadReviewRows(),
                refreshDashboardMetrics(),
            ]);

            const removedApplications = Number(body?.removed_applications || 0);
            const appText = removedApplications === 1 ? "1 linked application" : `${removedApplications} linked applications`;

            window.showModal(
                "Scholarship Removed",
                `Scholarship <b>${escapeHtml(String(body?.scholarship_title || `#${id}`))}</b> was removed.<br/><br/>Cleanup summary: ${escapeHtml(appText)} removed.`
            );
        } catch (error) {
            window.showModal("Remove Failed", escapeHtml(error.message || "Unable to remove scholarship."));
        }
    }

    // Initial paint
    refreshDashboardMetrics();
    loadReviewRows();
    loadAdminScholarships();
    startAdminReviewAutoRefresh();

    dashboardStatButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            const categoryKey = btn.getAttribute("data-dashboard-stat") || "";
            if (!categoryKey) return;
            openDashboardStatsModal(categoryKey);
        });
    });

    if (dashboardStatsModalClose) {
        dashboardStatsModalClose.addEventListener("click", () => {
            closeDashboardStatsModal();
        });
    }

    if (dashboardStatsModal) {
        dashboardStatsModal.addEventListener("click", (event) => {
            if (event.target === dashboardStatsModal) {
                closeDashboardStatsModal();
            }
        });
    }

    window.addEventListener("focus", () => {
        refreshReviewStateSilently();
    });

    window.addEventListener("beforeunload", () => {
        if (adminReviewRefreshTimer) {
            window.clearInterval(adminReviewRefreshTimer);
            adminReviewRefreshTimer = null;
        }
    });

    document.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-action]");
        if (!btn) return;

        const action = btn.getAttribute("data-action");
        if (action === "review") {
            const id = btn.getAttribute("data-id");
            if (!id) return;
            navigateToDetail(id);
            return;
        }

        if (action === "show-submitted-docs") {
            const id = btn.getAttribute("data-id") || (selectedApplicationId ? String(selectedApplicationId) : "");
            if (!id) return;

            const row = reviewRows.find((entry) => entry.id === String(id));
            if (!row) return;

            openAdminDocumentsModal(row);
            return;
        }

        if (action === "remove-scholarship") {
            const scholarshipId = btn.getAttribute("data-scholarship-id");
            const scholarshipTitle = btn.getAttribute("data-scholarship-title") || "this scholarship";
            if (!scholarshipId) return;

            window.showModal(
                "Remove Scholarship",
                `Remove <b>${escapeHtml(scholarshipTitle)}</b>?<br/><br/>This will also remove linked applications and update admin/student trackers.`,
                () => {
                    removeScholarship(scholarshipId);
                },
                { okText: "Remove", cancelText: "Cancel", showCancel: true }
            );
        }
    });

    if (adminDocumentsModalBody) {
        adminDocumentsModalBody.addEventListener("click", (event) => {
            const removeBtn = event.target.closest("button[data-action='admin-remove-doc']");
            if (!removeBtn) return;

            const documentId = Number(removeBtn.getAttribute("data-document-id"));
            const applicationId = Number(activeAdminDocumentsApplicationId);

            if (!Number.isInteger(documentId) || documentId <= 0) return;
            if (!Number.isInteger(applicationId) || applicationId <= 0) return;

            window.showModal(
                "Remove Document",
                "Are you sure you want to delete this document?",
                async () => {
                    try {
                        await removeApplicationDocumentFromAdmin(applicationId, documentId);
                        await Promise.all([
                            refreshAdminDocumentsModal(),
                            loadReviewRows({ silent: true }),
                            refreshDashboardMetrics(),
                        ]);
                        window.showModal("Document Removed", "The selected document has been deleted.");
                    } catch (error) {
                        window.showModal("Remove Failed", escapeHtml(error.message || "Unable to remove document."));
                    }
                },
                { okText: "Remove", cancelText: "Cancel", showCancel: true }
            );
        });
    }

    if (adminDocumentsModalClose) {
        adminDocumentsModalClose.addEventListener("click", () => {
            closeAdminDocumentsModal();
        });
    }

    if (adminDocumentsModal) {
        adminDocumentsModal.addEventListener("click", (event) => {
            if (event.target === adminDocumentsModal) {
                closeAdminDocumentsModal();
            }
        });
    }

    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;

        if (adminDocumentsModal && !adminDocumentsModal.classList.contains("hidden")) {
            closeAdminDocumentsModal();
        }

        if (dashboardStatsModal && !dashboardStatsModal.classList.contains("hidden")) {
            closeDashboardStatsModal();
        }
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
                    decideApplication("Approved");
                },
                { okText: "Approve", cancelText: "Cancel", showCancel: true }
            );
        });
    }

    const rejectBtn = document.getElementById("btnRejectApplication");
    if (rejectBtn) {
        rejectBtn.addEventListener("click", () => {
            if (!selectedApplicationId) return;

            const selectedRow = reviewRows.find((row) => row.id === String(selectedApplicationId));
            const draftReason = String(selectedRow?.rejectionReason || "").trim();

            window.showModal(
                "Reject Application",
                `
                    <p style="margin-bottom:0.65rem;">Provide a reason for rejecting application <b>${escapeHtml(String(selectedApplicationId))}</b>.</p>
                    <textarea
                        id="rejectReasonInput"
                        class="form-control"
                        rows="5"
                        maxlength="500"
                        placeholder="Enter rejection reason"
                        style="width:100%; resize:vertical; min-height:120px;"
                    >${escapeHtml(draftReason)}</textarea>
                    <div id="rejectReasonError" style="display:none; color:#8b0000; margin-top:0.5rem; font-size:0.92rem;">
                        Rejection reason is required.
                    </div>
                `,
                () => {
                    const reasonInput = document.getElementById("rejectReasonInput");
                    const reasonError = document.getElementById("rejectReasonError");
                    const rejectionReason = String(reasonInput?.value || "").trim();

                    if (!rejectionReason) {
                        if (reasonError) {
                            reasonError.textContent = "Rejection reason is required.";
                            reasonError.style.display = "block";
                        }
                        reasonInput?.focus();
                        return false;
                    }

                    if (rejectionReason.length > 500) {
                        if (reasonError) {
                            reasonError.textContent = "Rejection reason must be 500 characters or fewer.";
                            reasonError.style.display = "block";
                        }
                        reasonInput?.focus();
                        return false;
                    }

                    decideApplication("Rejected", rejectionReason);
                    return true;
                },
                { okText: "Confirm Reject", cancelText: "Cancel", showCancel: true }
            );

            window.setTimeout(() => {
                const reasonInput = document.getElementById("rejectReasonInput");
                reasonInput?.focus();
            }, 0);
        });
    }
});
