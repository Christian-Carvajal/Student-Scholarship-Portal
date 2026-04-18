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
    const notifFilterBtns = notifDropdown
        ? Array.from(notifDropdown.querySelectorAll(".filter-btn"))
        : [];
    let notificationRows = [];
    let notificationFilterMode = "all";

    function notificationIconClass(notificationType) {
        const type = String(notificationType || "").toUpperCase();
        if (type === "APPLICATION_STATUS") return "update";
        return "system";
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

        return formatDate(input);
    }

    function updateNotificationBadge() {
        if (!notifBadgeCount) return;

        const unreadCount = notificationRows.filter((item) => !item.is_read).length;
        if (unreadCount <= 0) {
            notifBadgeCount.style.display = "none";
            return;
        }

        notifBadgeCount.style.display = "inline-flex";
        notifBadgeCount.textContent = String(unreadCount);
    }

    function applyNotificationFilter(mode = notificationFilterMode) {
        if (!notifBodyList) return;

        notificationFilterMode = mode;
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

        if (!notificationRows.length) {
            notifBodyList.innerHTML = `
                <div class="notif-section-title">Notifications</div>
                <div class="notif-item" style="cursor: default;">
                    <div class="notif-icon system">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                        </svg>
                    </div>
                    <div class="notif-content">
                        <p>No notifications yet.</p>
                        <span class="notif-time">We'll show scholarship and application updates here.</span>
                        <div class="notif-details">When the admin publishes scholarships or decides your application, you'll see it in this bell.</div>
                    </div>
                </div>
            `;
            updateNotificationBadge();
            return;
        }

        notifBodyList.innerHTML = `
            <div class="notif-section-title">Recent</div>
            ${notificationRows.map((row) => {
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
        applyNotificationFilter(notificationFilterMode);
    }

    async function markNotificationRead(notificationId) {
        const studentId = getAuthenticatedStudentId();
        if (!studentId || !Number.isFinite(Number(notificationId))) return;

        try {
            await fetch(`/api/applications/notifications/${encodeURIComponent(notificationId)}/read`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ student_id: studentId }),
            });
        } catch (error) {
            console.error("Failed to mark notification as read:", error);
        }
    }

    async function fetchStudentNotifications(options = {}) {
        const { silent = false } = options;
        const studentId = getAuthenticatedStudentId();

        if (!studentId) {
            notificationRows = [];
            renderNotificationList();
            return;
        }

        try {
            const res = await fetch(`/api/applications/notifications/student/${encodeURIComponent(studentId)}?_ts=${Date.now()}`, {
                cache: "no-store",
            });
            if (!res.ok) throw new Error("Failed to load notifications.");

            const body = await res.json();
            const list = Array.isArray(body?.notifications)
                ? body.notifications
                : (Array.isArray(body) ? body : []);

            notificationRows = list.map((item) => ({
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
                console.error("Failed to fetch notifications:", error);
                notificationRows = [];
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

            const matched = notificationRows.find((row) => row.notification_id === notificationId);
            if (matched && !matched.is_read) {
                matched.is_read = true;
                item.classList.remove("unread");

                const dot = item.querySelector(".notif-unread-dot");
                if (dot) dot.style.display = "none";

                updateNotificationBadge();

                if (notificationFilterMode === "unread") {
                    item.style.display = "none";
                }

                markNotificationRead(notificationId);
            }
        });

        renderNotificationList();
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

        if (targetId !== "view-docs") {
            closeStudentDocumentsModal();
        }

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
                else if (targetId === "view-docs") fetchStudentDocuments();
                syncTrackerAutoRefresh(targetId);
                syncScholarshipAutoRefresh(targetId);
                syncDocumentsAutoRefresh(targetId);
            }, VIEW_TRANSITION_MS);
        } else {
            showSectionWithTransition(nextSection);
            activeSection = nextSection;
            if (targetId === "view-tracker") fetchStudentApplications();
            else if (targetId === "view-listings") fetchScholarships();
            else if (targetId === "view-docs") fetchStudentDocuments();
            syncTrackerAutoRefresh(targetId);
            syncScholarshipAutoRefresh(targetId);
            syncDocumentsAutoRefresh(targetId);
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

    const scholarshipGrid = document.getElementById("scholarshipGrid");
    const scholarshipSearchInput = document.getElementById("scholarshipSearchInput");
    const scholarshipGwaFilter = document.getElementById("scholarshipGwaFilter");
    const scholarshipSelect = document.getElementById("appScholarship");
    const applicationForm = document.getElementById("applicationForm");
    const trackerTableBody = document.getElementById("trackerTableBody");
    const trackerSummaryValues = document.querySelectorAll("#view-tracker .summary-value");
    const documentApplicationCardsRoot = document.getElementById("studentDocumentApplicationCards");
    const studentDocumentsModal = document.getElementById("studentDocumentsModal");
    const studentDocumentsModalTitle = document.getElementById("studentDocumentsModalTitle");
    const studentDocumentsModalMeta = document.getElementById("studentDocumentsModalMeta");
    const studentDocumentsModalBody = document.getElementById("studentDocumentsModalBody");
    const studentDocumentsModalClose = document.getElementById("studentDocumentsModalClose");
    const TRACKER_REFRESH_MS = 10000;
    const SCHOLARSHIP_REFRESH_MS = 15000;
    const NOTIFICATION_REFRESH_MS = 10000;
    const DOCUMENTS_REFRESH_MS = 2000;
    let scholarshipCatalog = [];
    let appliedScholarshipIds = new Set();
    let studentApplicationRows = [];
    let studentDocumentRows = [];
    let scholarshipListingSearchTerm = "";
    let scholarshipListingGwaThreshold = Number.NaN;
    let activeDocumentsModalApplicationId = null;
    let lastTrackerSnapshot = "";
    let lastDocumentsSnapshot = "";

    let trackerRefreshTimer = null;
    let scholarshipRefreshTimer = null;
    let notificationRefreshTimer = null;
    let documentsRefreshTimer = null;

    const DOCUMENT_INPUTS = [
        { inputId: "fileIdentity", field: "document_identity", code: "identity" },
        { inputId: "fileAcademic", field: "document_academic", code: "academic" },
        { inputId: "fileEnrollment", field: "document_enrollment", code: "enrollment" },
        { inputId: "fileIncome", field: "document_income", code: "income" },
        { inputId: "fileMoral", field: "document_character", code: "character" },
        { inputId: "filePhoto", field: "document_photo", code: "photo" },
    ];

    const DOCUMENT_REQUIREMENTS = [
        { code: "identity", label: "Proof of Identity", hint: "PSA Birth Certificate or valid ID.", accept: ".pdf,.jpg,.jpeg,.png" },
        { code: "academic", label: "Academic Proof", hint: "Form 138 / TOR (PDF).", accept: ".pdf" },
        { code: "enrollment", label: "Enrollment Proof", hint: "Certificate of Enrollment or Registration Form (PDF).", accept: ".pdf" },
        { code: "income", label: "Proof of Income", hint: "ITR / Tax Exemption / Indigency.", accept: ".pdf,.jpg,.jpeg,.png" },
        { code: "character", label: "Character Reference", hint: "Certificate of Good Moral (PDF).", accept: ".pdf" },
        { code: "photo", label: "Recent Photo", hint: "2x2 ID Picture (JPG/PNG).", accept: ".jpg,.jpeg,.png" },
    ];

    function getRememberedStudentIdKey() {
        const accountKey = (
            currentUser?.studentId ||
            currentUser?.student_id ||
            currentUser?.email ||
            currentUser?.id ||
            ""
        ).toString().trim().toLowerCase();

        return accountKey ? `lastStudentId:${accountKey}` : "lastStudentId";
    }

    function getRememberedStudentId() {
        const scoped = (localStorage.getItem(getRememberedStudentIdKey()) || "").trim();
        if (scoped) return scoped;

        // Legacy fallback for older sessions before per-account keys were introduced.
        return (localStorage.getItem("lastStudentId") || "").trim();
    }

    function getCurrentStudentId() {
        // Always prefer the authenticated account identity over remembered values.
        const fromUser = (currentUser?.studentId || currentUser?.student_id || "").trim();
        if (fromUser) return fromUser;

        const fromLegacyUser = (currentUser?.id || "").toString().trim();
        if (fromLegacyUser) return fromLegacyUser;

        return getRememberedStudentId();
    }

    function getAuthenticatedStudentId() {
        const fromUser = (currentUser?.studentId || currentUser?.student_id || "").toString().trim();
        if (fromUser) return fromUser;

        return getRememberedStudentId();
    }

    function areSetsEqual(a, b) {
        if (a === b) return true;
        if (!a || !b) return false;
        if (a.size !== b.size) return false;
        for (const value of a) {
            if (!b.has(value)) return false;
        }
        return true;
    }

    function buildTrackerSnapshot(rows) {
        if (!Array.isArray(rows)) return "[]";
        return JSON.stringify(
            rows.map((row) => ({
                id: String(row.application_id ?? row.id ?? ""),
                scholarship: String(row.scholarship_title || row.scholarship || ""),
                appliedAt: String(row.applied_at || row.appliedAt || row.created_at || ""),
                status: normalizeStatus(row.status || row.application_status || row.autoVetStatus || "Pending"),
                scholarshipId: String(row.scholarship_id ?? row.scholarshipId ?? ""),
            }))
        );
    }

    function buildDocumentsSnapshot(appRows, docRows) {
        const apps = Array.isArray(appRows) ? appRows : [];
        const docs = Array.isArray(docRows) ? docRows : [];

        const appSlice = apps.map((row) => ({
            id: String(row.application_id ?? row.id ?? ""),
            status: normalizeStatus(row.status || row.application_status || row.autoVetStatus || "Pending"),
            scholarship: String(row.scholarship_title || row.scholarship || ""),
            appliedAt: String(row.applied_at || row.appliedAt || row.created_at || ""),
        }));

        const docSlice = docs.map((row) => ({
            id: String(row.document_id ?? ""),
            applicationId: String(row.application_id ?? ""),
            type: String(row.document_type_code || row.document_type_name || ""),
            file: String(row.original_filename || ""),
            uploadedAt: String(row.uploaded_at || row.created_at || ""),
            active: String(row.is_active ?? ""),
        }));

        return JSON.stringify({ appSlice, docSlice });
    }

    function isTrackerActive() {
        return activeSection?.id === "view-tracker";
    }

    function isListingsActive() {
        return activeSection?.id === "view-listings";
    }

    function isDocumentsActive() {
        return activeSection?.id === "view-docs";
    }

    async function refreshTrackerIfActive() {
        if (!isTrackerActive() || document.hidden) return;
        await fetchStudentApplications({ silent: true });
    }

    async function refreshScholarshipsIfActive() {
        if (!isListingsActive() || document.hidden) return;
        await fetchScholarships();
    }

    async function refreshNotificationsIfVisible() {
        if (document.hidden) return;
        await fetchStudentNotifications({ silent: true });
    }

    async function refreshDocumentsIfActive() {
        if (!isDocumentsActive() || document.hidden) return;
        await fetchStudentDocuments({ silent: true });
    }

    function stopTrackerAutoRefresh() {
        if (!trackerRefreshTimer) return;
        window.clearInterval(trackerRefreshTimer);
        trackerRefreshTimer = null;
    }

    function stopScholarshipAutoRefresh() {
        if (!scholarshipRefreshTimer) return;
        window.clearInterval(scholarshipRefreshTimer);
        scholarshipRefreshTimer = null;
    }

    function stopNotificationAutoRefresh() {
        if (!notificationRefreshTimer) return;
        window.clearInterval(notificationRefreshTimer);
        notificationRefreshTimer = null;
    }

    function stopDocumentsAutoRefresh() {
        if (!documentsRefreshTimer) return;
        window.clearInterval(documentsRefreshTimer);
        documentsRefreshTimer = null;
    }

    function startTrackerAutoRefresh() {
        stopTrackerAutoRefresh();
        trackerRefreshTimer = window.setInterval(() => {
            refreshTrackerIfActive();
        }, TRACKER_REFRESH_MS);
    }

    function startScholarshipAutoRefresh() {
        stopScholarshipAutoRefresh();
        scholarshipRefreshTimer = window.setInterval(() => {
            refreshScholarshipsIfActive();
        }, SCHOLARSHIP_REFRESH_MS);
    }

    function startNotificationAutoRefresh() {
        stopNotificationAutoRefresh();
        notificationRefreshTimer = window.setInterval(() => {
            refreshNotificationsIfVisible();
        }, NOTIFICATION_REFRESH_MS);
    }

    function startDocumentsAutoRefresh() {
        stopDocumentsAutoRefresh();
        documentsRefreshTimer = window.setInterval(() => {
            refreshDocumentsIfActive();
        }, DOCUMENTS_REFRESH_MS);
    }

    function syncTrackerAutoRefresh(targetId) {
        if (targetId === "view-tracker") {
            startTrackerAutoRefresh();
            refreshTrackerIfActive();
            return;
        }

        stopTrackerAutoRefresh();
    }

    function syncScholarshipAutoRefresh(targetId) {
        if (targetId === "view-listings") {
            startScholarshipAutoRefresh();
            refreshScholarshipsIfActive();
            return;
        }

        stopScholarshipAutoRefresh();
    }

    function syncDocumentsAutoRefresh(targetId) {
        if (targetId === "view-docs") {
            startDocumentsAutoRefresh();
            refreshDocumentsIfActive();
            return;
        }

        stopDocumentsAutoRefresh();
    }

    function rememberStudentId(studentId) {
        if (!studentId) return;
        localStorage.setItem(getRememberedStudentIdKey(), studentId);
        localStorage.removeItem("lastStudentId");

        // Keep the active session identity aligned with tracker queries.
        currentUser.studentId = studentId;
        currentUser.student_id = studentId;
        localStorage.setItem("currentUser", JSON.stringify(currentUser));

        fetchStudentNotifications({ silent: true });
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
    }

    function formatDate(input) {
        if (!input) return "N/A";
        const d = new Date(input);
        if (Number.isNaN(d.getTime())) return String(input);
        return d.toLocaleDateString(undefined, {
            month: "short",
            day: "2-digit",
            year: "numeric",
        });
    }

    function normalizeStatus(status) {
        const normalized = String(status || "Pending").trim().toLowerCase();
        if (normalized.includes("approve")) return "Approved";
        if (normalized.includes("denied")) return "Rejected";
        if (normalized.includes("reject")) return "Rejected";
        if (normalized.includes("review")) return "Under Review";
        if (normalized.includes("incomplete")) return "Incomplete";
        if (normalized.includes("eligible")) return "Eligible";
        if (normalized.includes("submit")) return "Submitted";
        return "Pending";
    }

    function statusClass(statusLabel) {
        if (statusLabel === "Approved") return "status-approved";
        if (statusLabel === "Rejected") return "status-rejected";
        if (statusLabel === "Incomplete") return "status-incomplete";
        return "status-pending";
    }

    function getScholarshipRowId(row) {
        if (!row) return null;

        const idValue = row.id ?? row.scholarship_id ?? row.scholarshipId;
        if (idValue === undefined || idValue === null || idValue === "") return null;

        return String(idValue);
    }

    function getScholarshipRowMinimumGwa(row) {
        if (!row) return null;

        const candidates = [
            row.min_gpa,
            row.min_gwa,
            row.minimum_gwa,
            row.required_gwa,
            row.required_gpa,
        ];

        for (const candidate of candidates) {
            const parsed = Number(candidate);
            if (Number.isFinite(parsed)) return parsed;
        }

        return null;
    }

    function canEditApplicationDocuments(status) {
        const normalized = String(status || "").trim().toLowerCase();
        if (normalized.includes("approve")) return false;
        if (normalized.includes("reject")) return false;
        if (normalized.includes("denied")) return false;
        return true;
    }

    function groupDocumentsByApplication(rows) {
        const grouped = new Map();

        for (const row of rows || []) {
            const appId = Number(row?.application_id);
            if (!Number.isInteger(appId) || appId <= 0) continue;

            if (!grouped.has(appId)) grouped.set(appId, []);
            grouped.get(appId).push(row);
        }

        return grouped;
    }

    function renderStudentDocumentsByScholarship(applications, documents) {
        if (!documentApplicationCardsRoot) return;

        if (!Array.isArray(applications) || applications.length === 0) {
            const emptyHtml = `
                <div class="scholarship-doc-empty">
                    No scholarship applications found yet. Submit an application first to manage documents here.
                </div>
            `;
            if (documentApplicationCardsRoot.innerHTML !== emptyHtml) {
                documentApplicationCardsRoot.innerHTML = emptyHtml;
            }
            return;
        }

        const groupedDocs = groupDocumentsByApplication(documents);

        const nextHtml = applications.map((application) => {
            const applicationId = Number(application.application_id ?? application.id);
            const safeApplicationId = Number.isInteger(applicationId) ? applicationId : 0;
            const title = application.scholarship_title || application.scholarship || "Scholarship Record";
            const status = normalizeStatus(application.status || "Pending");
            const isEditable = canEditApplicationDocuments(status);

            const lockBanner = isEditable
                ? ""
                : `<div class="scholarship-doc-status-lock">Documents are locked because this application is ${escapeHtml(status)}.</div>`;

            return `
                <article class="scholarship-doc-card" data-application-id="${escapeHtml(String(safeApplicationId))}">
                    <h3 class="scholarship-doc-title">${escapeHtml(title)}</h3>
                    <div class="scholarship-doc-meta">Application ID: <strong>${escapeHtml(String(safeApplicationId || "N/A"))}</strong></div>
                    <div class="scholarship-doc-meta">Date Applied: <strong>${escapeHtml(formatDate(application.applied_at || application.appliedAt || application.created_at))}</strong></div>
                    ${lockBanner}
                    <div class="scholarship-doc-action">
                        <button class="btn btn-sm" type="button" data-action="toggle-scholarship-docs" data-application-id="${escapeHtml(String(safeApplicationId))}">
                            View Documents
                        </button>
                    </div>
                </article>
            `;
        }).join("");

        if (documentApplicationCardsRoot.innerHTML !== nextHtml) {
            documentApplicationCardsRoot.innerHTML = nextHtml;
        }
    }

    function getStudentApplicationById(applicationId) {
        const targetId = Number(applicationId);
        if (!Number.isInteger(targetId) || targetId <= 0) return null;

        return studentApplicationRows.find((row) => Number(row.application_id ?? row.id) === targetId) || null;
    }

    function buildStudentDocumentRowsHtml(applicationId) {
        const application = getStudentApplicationById(applicationId);
        if (!application) {
            return '<div class="scholarship-doc-empty">Application details are no longer available.</div>';
        }

        const status = normalizeStatus(application.status || "Pending");
        const isEditable = canEditApplicationDocuments(status);
        const groupedDocs = groupDocumentsByApplication(studentDocumentRows);
        const applicationDocs = groupedDocs.get(Number(applicationId)) || [];

        const latestByCode = new Map();
        for (const doc of applicationDocs) {
            const code = String(doc.document_type_code || "").trim().toLowerCase();
            if (!code || latestByCode.has(code)) continue;
            latestByCode.set(code, doc);
        }

        return DOCUMENT_REQUIREMENTS.map((reqDoc) => {
            const currentDoc = latestByCode.get(reqDoc.code) || null;
            const uploadInputId = `upload-${Number(applicationId)}-${reqDoc.code}`;

            if (currentDoc) {
                const removeButton = isEditable
                    ? `<button class="btn btn-sm" type="button" data-action="remove-student-doc" data-document-id="${escapeHtml(String(currentDoc.document_id))}" data-application-id="${escapeHtml(String(applicationId))}">Remove</button>`
                    : `<span class="scholarship-doc-hint">Locked after decision.</span>`;

                return `
                    <div class="scholarship-doc-row">
                        <div class="scholarship-doc-row-top">
                            <div class="scholarship-doc-type">${escapeHtml(reqDoc.label)}</div>
                            <div class="scholarship-doc-hint">${escapeHtml(formatDate(currentDoc.uploaded_at))}</div>
                        </div>
                        <div class="scholarship-doc-file">${escapeHtml(currentDoc.original_filename || "Uploaded document")}</div>
                        <div class="scholarship-doc-row-actions">
                            ${removeButton}
                        </div>
                    </div>
                `;
            }

            const uploadAction = isEditable
                ? `
                    <button class="btn btn-sm" type="button" data-action="upload-student-doc" data-upload-input-id="${escapeHtml(uploadInputId)}">Upload</button>
                    <input id="${escapeHtml(uploadInputId)}" class="student-doc-upload-input" type="file" accept="${escapeHtml(reqDoc.accept)}" data-action="upload-student-doc-input" data-application-id="${escapeHtml(String(applicationId))}" data-document-code="${escapeHtml(reqDoc.code)}" />
                `
                : `<span class="scholarship-doc-hint">Missing document (locked after decision).</span>`;

            return `
                <div class="scholarship-doc-row">
                    <div class="scholarship-doc-row-top">
                        <div class="scholarship-doc-type">${escapeHtml(reqDoc.label)}</div>
                    </div>
                    <div class="scholarship-doc-hint">${escapeHtml(reqDoc.hint)}</div>
                    <div class="scholarship-doc-missing">Missing File</div>
                    <div class="scholarship-doc-row-actions">${uploadAction}</div>
                </div>
            `;
        }).join("");
    }

    function refreshStudentDocumentsModalIfOpen() {
        if (!studentDocumentsModal) return;
        if (!activeDocumentsModalApplicationId) return;

        const application = getStudentApplicationById(activeDocumentsModalApplicationId);
        if (!application) {
            closeStudentDocumentsModal();
            return;
        }

        const applicationId = Number(application.application_id ?? application.id);
        const title = application.scholarship_title || application.scholarship || "Scholarship Record";
        const status = normalizeStatus(application.status || "Pending");

        if (studentDocumentsModalTitle) {
            studentDocumentsModalTitle.textContent = title;
        }

        if (studentDocumentsModalMeta) {
            studentDocumentsModalMeta.textContent = `Application ID: ${applicationId} | Date Applied: ${formatDate(application.applied_at || application.appliedAt || application.created_at)} | Status: ${status}`;
        }

        if (studentDocumentsModalBody) {
            const nextHtml = buildStudentDocumentRowsHtml(applicationId);
            if (studentDocumentsModalBody.innerHTML !== nextHtml) {
                studentDocumentsModalBody.innerHTML = nextHtml;
            }
        }
    }

    function openStudentDocumentsModal(applicationId) {
        const targetId = Number(applicationId);
        if (!Number.isInteger(targetId) || targetId <= 0) return;
        if (!studentDocumentsModal) return;

        activeDocumentsModalApplicationId = targetId;
        refreshStudentDocumentsModalIfOpen();

        studentDocumentsModal.classList.remove("hidden");
        studentDocumentsModal.classList.remove("is-closing");
        window.requestAnimationFrame(() => {
            studentDocumentsModal.classList.add("is-open");
        });
    }

    function closeStudentDocumentsModal() {
        if (!studentDocumentsModal || studentDocumentsModal.classList.contains("hidden")) {
            activeDocumentsModalApplicationId = null;
            return;
        }

        studentDocumentsModal.classList.remove("is-open");
        studentDocumentsModal.classList.add("is-closing");
        activeDocumentsModalApplicationId = null;

        window.setTimeout(() => {
            studentDocumentsModal.classList.remove("is-closing");
            studentDocumentsModal.classList.add("hidden");
        }, MODAL_TRANSITION_MS);
    }

    function renderScholarshipCards(rows, options = {}) {
        const { hasActiveFilters = false } = options;
        if (!scholarshipGrid) return;

        if (!rows.length) {
            scholarshipGrid.innerHTML = `
                <div class="card">
                    <h3>${hasActiveFilters ? "No Matching Scholarships" : "No Published Scholarships Yet"}</h3>
                    <p>${hasActiveFilters ? "Try adjusting your search or GPA filter." : "Please check again later for newly published opportunities."}</p>
                </div>
            `;
            return;
        }

        scholarshipGrid.innerHTML = rows
            .map((row) => {
                const scholarshipId = getScholarshipRowId(row);
                if (!scholarshipId) return "";

                const title = escapeHtml(row.title || "Untitled Scholarship");
                const description = escapeHtml(row.description || "No description provided.");
                const minimumGwa = getScholarshipRowMinimumGwa(row);
                const minGpa = Number.isFinite(minimumGwa)
                    ? minimumGwa.toFixed(2)
                    : null;
                const deadline = row.deadline ? formatDate(row.deadline) : "No deadline";
                const alreadyApplied = appliedScholarshipIds.has(scholarshipId);
                const buttonClass = alreadyApplied ? "btn btn-sm btn-applied" : "btn btn-gold btn-sm";
                const buttonText = alreadyApplied ? "Applied" : "Apply";
                const buttonDisabledAttr = alreadyApplied ? "disabled aria-disabled=\"true\"" : "";

                return `
                    <div class="card">
                        <h3>${title}</h3>
                        <p>${description}</p>
                        <p style="margin-top: 0.75rem; color: #5f5f5f; font-size: 0.9rem;">
                            ${minGpa ? `Minimum GWA: ${escapeHtml(minGpa)}<br/>` : ""}
                            Deadline: ${escapeHtml(deadline)}
                        </p>
                        <div style="margin-top: 1rem;">
                            <button class="${buttonClass}" type="button" data-action="apply-scholarship" data-scholarship-id="${escapeHtml(scholarshipId)}" ${buttonDisabledAttr}>${buttonText}</button>
                        </div>
                    </div>
                `;
            })
            .join("");
    }

    function getFilteredScholarshipRows(rows) {
        const list = Array.isArray(rows) ? rows : [];
        const searchTerm = scholarshipListingSearchTerm.trim().toLowerCase();
        const hasGwaFilter = Number.isFinite(scholarshipListingGwaThreshold);

        return list.filter((row) => {
            const title = String(row?.title || "").toLowerCase();
            const description = String(row?.description || "").toLowerCase();

            if (searchTerm && !title.includes(searchTerm) && !description.includes(searchTerm)) {
                return false;
            }

            if (hasGwaFilter) {
                const minimumGwa = getScholarshipRowMinimumGwa(row);

                // Lower GWA is better (1.00 highest), so filter by maximum allowed required GWA.
                if (Number.isFinite(minimumGwa) && minimumGwa > scholarshipListingGwaThreshold) {
                    return false;
                }
            }

            return true;
        });
    }

    function renderFilteredScholarshipCards() {
        const filteredRows = getFilteredScholarshipRows(scholarshipCatalog);
        const hasActiveFilters = scholarshipListingSearchTerm.trim() !== "" || Number.isFinite(scholarshipListingGwaThreshold);
        renderScholarshipCards(filteredRows, { hasActiveFilters });
    }

    function populateScholarshipDropdown(rows) {
        if (!scholarshipSelect) return;

        const previous = scholarshipSelect.value;
        scholarshipSelect.innerHTML = '<option value="">-- Choose one --</option>';

        for (const row of rows) {
            const scholarshipId = getScholarshipRowId(row);
            if (!scholarshipId) continue;

            const option = document.createElement("option");
            option.value = scholarshipId;

            const minimumGwa = getScholarshipRowMinimumGwa(row);
            const minGpa = Number.isFinite(minimumGwa) ? minimumGwa.toFixed(2) : null;
            const alreadyApplied = appliedScholarshipIds.has(scholarshipId);

            option.textContent = minGpa
                ? `${row.title} (Minimum GWA ${minGpa})`
                : `${row.title}`;

            if (alreadyApplied) {
                option.textContent += " - Applied";
                option.disabled = true;
            }

            scholarshipSelect.appendChild(option);
        }

        if (previous && Array.from(scholarshipSelect.options).some((opt) => opt.value === previous)) {
            scholarshipSelect.value = previous;
        }
    }

    async function fetchScholarships() {
        try {
            const res = await fetch(`/api/applications/scholarships/published?_ts=${Date.now()}`, {
                cache: "no-store",
            });
            if (!res.ok) throw new Error("Failed to load scholarships.");

            const rows = await res.json();
            const list = Array.isArray(rows) ? rows : [];
            scholarshipCatalog = list;

            renderFilteredScholarshipCards();
            populateScholarshipDropdown(list);
        } catch (error) {
            console.error("Failed to fetch scholarships:", error);
            scholarshipCatalog = [];
            if (scholarshipGrid) {
                scholarshipGrid.innerHTML = `
                    <div class="card">
                        <h3>Unable to Load Scholarships</h3>
                        <p>Please refresh the page or try again later.</p>
                    </div>
                `;
            }
        }
    }

    function getScholarshipMinimumGwa(scholarshipId) {
        if (!scholarshipId) return null;
        const found = scholarshipCatalog.find((row) => getScholarshipRowId(row) === String(scholarshipId));
        if (!found) return null;

        return getScholarshipRowMinimumGwa(found);
    }

    async function fetchStudentDocuments(options = {}) {
        const { silent = false } = options;
        const studentId = getCurrentStudentId();

        if (!studentId) {
            studentApplicationRows = [];
            studentDocumentRows = [];
            lastDocumentsSnapshot = "";
            renderStudentDocumentsByScholarship([], []);
            closeStudentDocumentsModal();
            return;
        }

        try {
            const [appsRes, docsRes] = await Promise.all([
                fetch(`/api/applications/student/${encodeURIComponent(studentId)}?_ts=${Date.now()}`, { cache: "no-store" }),
                fetch(`/api/applications/student/${encodeURIComponent(studentId)}/documents?_ts=${Date.now()}`, { cache: "no-store" }),
            ]);

            if (!appsRes.ok) throw new Error("Failed to load scholarship applications.");
            if (!docsRes.ok) throw new Error("Failed to load student documents.");

            const appsBody = await appsRes.json();
            const docsBody = await docsRes.json();

            const nextApplications = Array.isArray(appsBody) ? appsBody : [];
            const nextDocuments = Array.isArray(docsBody) ? docsBody : [];
            const nextSnapshot = buildDocumentsSnapshot(nextApplications, nextDocuments);

            if (silent && nextSnapshot === lastDocumentsSnapshot) {
                return;
            }

            studentApplicationRows = nextApplications;
            studentDocumentRows = nextDocuments;
            lastDocumentsSnapshot = nextSnapshot;

            const nextAppliedScholarshipIds = new Set(
                studentApplicationRows
                    .map((row) => row.scholarship_id ?? row.scholarshipId)
                    .filter((value) => value !== undefined && value !== null && value !== "")
                    .map((value) => String(value))
            );

            if (!areSetsEqual(appliedScholarshipIds, nextAppliedScholarshipIds)) {
                appliedScholarshipIds = nextAppliedScholarshipIds;
                renderFilteredScholarshipCards();
                populateScholarshipDropdown(scholarshipCatalog);
            }

            renderStudentDocumentsByScholarship(studentApplicationRows, studentDocumentRows);
            refreshStudentDocumentsModalIfOpen();
        } catch (error) {
            console.error("Failed to fetch student documents:", error);
            if (!silent) {
                renderStudentDocumentsByScholarship([], []);
                closeStudentDocumentsModal();
            }
        }
    }

    async function removeStudentDocument(documentId) {
        const studentId = getCurrentStudentId();
        if (!studentId) {
            throw new Error("Student ID is required before removing documents.");
        }

        const res = await fetch(
            `/api/applications/student/${encodeURIComponent(studentId)}/documents/${encodeURIComponent(documentId)}`,
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

        if (!res.ok) {
            throw new Error(body?.error || rawText.trim() || `Unable to remove document (HTTP ${res.status}).`);
        }

        return body;
    }

    async function uploadStudentDocument(applicationId, documentTypeCode, file) {
        const studentId = getCurrentStudentId();
        if (!studentId) {
            throw new Error("Student ID is required before uploading documents.");
        }

        const payload = new FormData();
        payload.append("document_type_code", documentTypeCode);
        payload.append("document_file", file);

        const res = await fetch(
            `/api/applications/student/${encodeURIComponent(studentId)}/applications/${encodeURIComponent(applicationId)}/documents`,
            {
                method: "POST",
                body: payload,
            }
        );

        let body = null;
        try {
            body = await res.json();
        } catch {
            body = null;
        }

        if (!res.ok) {
            throw new Error(body?.error || "Unable to upload replacement document.");
        }

        return body;
    }

    if (documentApplicationCardsRoot) {
        documentApplicationCardsRoot.addEventListener("click", (event) => {
            const toggleBtn = event.target.closest("button[data-action='toggle-scholarship-docs']");
            if (toggleBtn) {
                const applicationId = Number(toggleBtn.getAttribute("data-application-id"));
                if (!Number.isInteger(applicationId) || applicationId <= 0) return;
                openStudentDocumentsModal(applicationId);
            }
        });
    }

    if (studentDocumentsModalBody) {
        studentDocumentsModalBody.addEventListener("click", (event) => {
            const removeBtn = event.target.closest("button[data-action='remove-student-doc']");
            if (removeBtn) {
                const documentId = Number(removeBtn.getAttribute("data-document-id"));
                const applicationId = Number(removeBtn.getAttribute("data-application-id"));

                if (!Number.isInteger(documentId) || documentId <= 0) return;

                window.showModal(
                    "Remove Document",
                    "This document will be removed from your application and admin review records while the application is still pending. Continue?",
                    async () => {
                        try {
                            await removeStudentDocument(documentId);
                            await fetchStudentDocuments({ silent: true });
                            if (Number.isInteger(applicationId) && applicationId > 0) {
                                activeDocumentsModalApplicationId = applicationId;
                                refreshStudentDocumentsModalIfOpen();
                            }
                            window.showModal("Document Removed", "Document removed. You can now upload a replacement file.");
                        } catch (error) {
                            window.showModal("Remove Failed", escapeHtml(error.message || "Unable to remove document."));
                        }
                    },
                    { okText: "Remove", cancelText: "Cancel", showCancel: true }
                );

                return;
            }

            const uploadBtn = event.target.closest("button[data-action='upload-student-doc']");
            if (uploadBtn) {
                const inputId = uploadBtn.getAttribute("data-upload-input-id");
                if (!inputId) return;

                const input = document.getElementById(inputId);
                if (input) input.click();
            }
        });

        studentDocumentsModalBody.addEventListener("change", async (event) => {
            const uploadInput = event.target.closest("input[data-action='upload-student-doc-input']");
            if (!uploadInput) return;

            const file = uploadInput.files?.[0] || null;
            if (!file) return;

            const applicationId = Number(uploadInput.getAttribute("data-application-id"));
            const documentTypeCode = (uploadInput.getAttribute("data-document-code") || "").trim().toLowerCase();

            if (!Number.isInteger(applicationId) || applicationId <= 0 || !documentTypeCode) {
                uploadInput.value = "";
                return;
            }

            try {
                await uploadStudentDocument(applicationId, documentTypeCode, file);
                await fetchStudentDocuments({ silent: true });
                activeDocumentsModalApplicationId = applicationId;
                refreshStudentDocumentsModalIfOpen();
                window.showModal("Upload Complete", "Replacement document uploaded successfully.");
            } catch (error) {
                window.showModal("Upload Failed", escapeHtml(error.message || "Unable to upload document."));
            } finally {
                uploadInput.value = "";
            }
        });
    }

    if (studentDocumentsModalClose) {
        studentDocumentsModalClose.addEventListener("click", () => {
            closeStudentDocumentsModal();
        });
    }

    if (studentDocumentsModal) {
        studentDocumentsModal.addEventListener("click", (event) => {
            if (event.target === studentDocumentsModal) {
                closeStudentDocumentsModal();
            }
        });
    }

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && studentDocumentsModal && !studentDocumentsModal.classList.contains("hidden")) {
            closeStudentDocumentsModal();
        }
    });

    function updateTrackerSummary(rows) {
        if (!trackerSummaryValues || trackerSummaryValues.length < 4) return;

        const total = rows.length;
        const approved = rows.filter((row) => normalizeStatus(row.status) === "Approved").length;
        const active = rows.filter((row) => {
            const status = normalizeStatus(row.status);
            return status !== "Approved" && status !== "Rejected";
        }).length;

        trackerSummaryValues[0].textContent = String(total);
        trackerSummaryValues[1].textContent = String(active);
        trackerSummaryValues[2].textContent = String(approved);
        trackerSummaryValues[3].textContent = rows[0] ? formatDate(rows[0].applied_at) : "—";
    }

    async function fetchStudentApplications(options = {}) {
        const { silent = false } = options;

        if (!trackerTableBody) return;

        const studentId = getCurrentStudentId();

        if (!studentId) {
            studentApplicationRows = [];
            lastTrackerSnapshot = "";
            appliedScholarshipIds = new Set();
            renderFilteredScholarshipCards();
            populateScholarshipDropdown(scholarshipCatalog);

            trackerTableBody.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align: center; color: #6c757d;">Unable to load tracker because your account has no student identifier.</td>
                </tr>
            `;
            updateTrackerSummary([]);
            return;
        }

        try {
            const cacheKey = Date.now();
            const res = await fetch(`/api/applications/student/${encodeURIComponent(studentId)}?_ts=${cacheKey}`, {
                cache: "no-store",
            });
            if (!res.ok) throw new Error("Failed to load student applications.");

            const rows = await res.json();
            const list = Array.isArray(rows) ? rows : [];
            const nextTrackerSnapshot = buildTrackerSnapshot(list);
            if (silent && nextTrackerSnapshot === lastTrackerSnapshot) {
                return;
            }

            studentApplicationRows = list;
            lastTrackerSnapshot = nextTrackerSnapshot;

            appliedScholarshipIds = new Set(
                list
                    .map((row) => row.scholarship_id ?? row.scholarshipId)
                    .filter((value) => value !== undefined && value !== null && value !== "")
                    .map((value) => String(value))
            );

            renderFilteredScholarshipCards();
            populateScholarshipDropdown(scholarshipCatalog);

            if (!list.length) {
                trackerTableBody.innerHTML = `
                    <tr>
                        <td colspan="4" style="text-align: center; color: #6c757d;">No applications submitted yet.</td>
                    </tr>
                `;
                updateTrackerSummary([]);
                return;
            }

            trackerTableBody.innerHTML = list
                .map((row) => {
                    const applicationId = row.application_id ?? row.id ?? "N/A";
                    const scholarshipTitle = row.scholarship_title || row.scholarship || "Untitled Scholarship";
                    const appliedAt = row.applied_at || row.appliedAt || row.created_at || null;
                    const status = normalizeStatus(row.status || row.application_status || row.autoVetStatus || "Pending");

                    return `
                        <tr>
                            <td>${escapeHtml(String(applicationId))}</td>
                            <td>${escapeHtml(String(scholarshipTitle))}</td>
                            <td>${escapeHtml(formatDate(appliedAt))}</td>
                            <td><span class="status-badge ${statusClass(status)}">${escapeHtml(status)}</span></td>
                        </tr>
                    `;
                })
                .join("");

            rememberStudentId(studentId);
            updateTrackerSummary(list);
        } catch (error) {
            console.error("Failed to fetch tracker data:", error);
            studentApplicationRows = [];
            if (!silent) {
                trackerTableBody.innerHTML = `
                    <tr>
                        <td colspan="4" style="text-align: center; color: #6c757d;">Unable to load tracker right now.</td>
                    </tr>
                `;
                updateTrackerSummary([]);
            }
        }
    }

    if (applicationForm) {
        applicationForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            const authenticatedStudentId = getAuthenticatedStudentId();
            const studentId = authenticatedStudentId.trim();
            const learnerReferenceNumber = (document.getElementById("appLearnerRef")?.value || "").trim();
            const name = (document.getElementById("appFullName")?.value || currentUser?.name || "").trim();
            const program = (document.getElementById("appCourse")?.value || currentUser?.program || "").trim();
            const yearLevel = (document.getElementById("appYearLevel")?.value || "").trim();
            const gpa = (document.getElementById("appGpa")?.value || "").trim();
            const scholarshipId = (scholarshipSelect?.value || "").trim();
            const letterOfIntent = (document.getElementById("appEssay")?.value || "").trim();

            const filePayloads = DOCUMENT_INPUTS.map((config) => {
                const input = document.getElementById(config.inputId);
                const file = input?.files?.[0] || null;
                return { ...config, file };
            });
            const missingFiles = filePayloads.filter((entry) => !entry.file);

            if (!studentId) {
                window.showModal("Session Error", "Your account Student ID was not found. Please log out and log in again.");
                return;
            }

            if (!name || !program || !yearLevel || !gpa || !scholarshipId || !letterOfIntent) {
                window.showModal("Incomplete Form", "Please complete all required application fields before submitting.");
                return;
            }

            const studentGwa = Number(gpa);
            if (!Number.isFinite(studentGwa) || studentGwa < 1 || studentGwa > 5) {
                window.showModal("Invalid GWA", "Please enter a valid GWA between 1.00 and 5.00.");
                return;
            }

            const minimumGwa = getScholarshipMinimumGwa(scholarshipId);
            if (Number.isFinite(minimumGwa) && studentGwa > minimumGwa) {
                window.showModal(
                    "Not Eligible",
                    `Your GWA does not meet this scholarship's minimum GWA requirement of <b>${escapeHtml(minimumGwa.toFixed(2))}</b>.`
                );
                return;
            }

            if (appliedScholarshipIds.has(String(scholarshipId))) {
                window.showModal(
                    "Duplicate Application",
                    "You already submitted an application for this scholarship. Please monitor your tracker for status updates."
                );
                return;
            }

            if (missingFiles.length > 0) {
                window.showModal("Missing Documents", "Please upload all required documents before submitting your application.");
                return;
            }

            const submitBtn = document.getElementById("btnSubmitFinal");
            const previousLabel = submitBtn ? submitBtn.textContent : null;
            if (submitBtn) {
                submitBtn.textContent = "Submitting...";
                submitBtn.disabled = true;
            }

            try {
                const payload = new FormData();
                payload.append("student_id", studentId);
                payload.append("name", name);
                payload.append("program", program);
                payload.append("year_level", yearLevel);
                payload.append("gpa", gpa);
                payload.append("scholarship_id", scholarshipId);

                payload.append("full_name", name);
                payload.append("date_of_birth", (document.getElementById("appDob")?.value || "").trim());
                payload.append("address", (document.getElementById("appAddress")?.value || "").trim());
                payload.append("contact_number", (document.getElementById("appContact")?.value || "").trim());
                payload.append("email", (document.getElementById("appEmail")?.value || "").trim());
                payload.append("course_program", program);
                payload.append("gwa", gpa);
                payload.append("learner_reference_number", learnerReferenceNumber);
                payload.append("family_income", (document.getElementById("appIncome")?.value || "").trim());
                payload.append("parent_occupation", (document.getElementById("appOccupation")?.value || "").trim());
                payload.append("special_membership", (document.getElementById("appSpecial")?.value || "none").trim());
                payload.append("letter_of_intent", letterOfIntent);

                for (const fileEntry of filePayloads) {
                    payload.append(fileEntry.field, fileEntry.file);
                }

                const res = await fetch("/api/applications/apply", {
                    method: "POST",
                    body: payload,
                });

                let body = null;
                try {
                    body = await res.json();
                } catch {
                    body = null;
                }

                if (!res.ok) {
                    throw new Error(body?.error || "Unable to submit application.");
                }

                window.showModal(
                    "Application Submitted",
                    `Your application has been submitted successfully.<br/><br/>Initial status: <b>${escapeHtml(body?.status || "Pending")}</b>.`
                );

                rememberStudentId(studentId);
                appliedScholarshipIds.add(String(scholarshipId));
                renderFilteredScholarshipCards();
                populateScholarshipDropdown(scholarshipCatalog);

                applicationForm.reset();
                if (typeof window.validateStep1 === "function") window.validateStep1();
                if (typeof window.validateStep2 === "function") window.validateStep2();
                if (typeof window.goToStep === "function") window.goToStep(1);

                await fetchStudentApplications();
                await fetchStudentDocuments();
                navigateTo("view-tracker");
            } catch (error) {
                window.showModal("Submission Failed", escapeHtml(error.message || "Unable to submit application."));
            } finally {
                if (submitBtn) {
                    submitBtn.textContent = previousLabel || "Submit Formal Application";
                    submitBtn.disabled = false;
                }
            }
        });
    }

    document.addEventListener("click", (event) => {
        const applyBtn = event.target.closest("button[data-action='apply-scholarship']");
        if (!applyBtn) return;
        if (applyBtn.disabled) return;

        const scholarshipId = applyBtn.getAttribute("data-scholarship-id");
        if (!scholarshipId) return;

        if (scholarshipSelect) scholarshipSelect.value = scholarshipId;
        navigateTo("view-apply");
    });

    if (scholarshipSearchInput) {
        scholarshipSearchInput.addEventListener("input", () => {
            scholarshipListingSearchTerm = (scholarshipSearchInput.value || "").trim();
            renderFilteredScholarshipCards();
        });
    }

    if (scholarshipGwaFilter) {
        scholarshipGwaFilter.addEventListener("change", () => {
            const parsed = Number(scholarshipGwaFilter.value);
            scholarshipListingGwaThreshold = Number.isFinite(parsed) ? parsed : Number.NaN;
            renderFilteredScholarshipCards();
        });
    }

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden && isTrackerActive()) {
            fetchStudentApplications({ silent: true });
        }

        if (!document.hidden && isListingsActive()) {
            fetchScholarships();
        }

        if (!document.hidden && isDocumentsActive()) {
            fetchStudentDocuments({ silent: true });
        }

        if (!document.hidden) {
            fetchStudentNotifications({ silent: true });
        }
    });

    window.addEventListener("focus", () => {
        if (isTrackerActive()) {
            fetchStudentApplications({ silent: true });
        }

        if (isListingsActive()) {
            fetchScholarships();
        }

        if (isDocumentsActive()) {
            fetchStudentDocuments({ silent: true });
        }

        fetchStudentNotifications({ silent: true });
    });

    window.addEventListener("beforeunload", () => {
        stopTrackerAutoRefresh();
        stopScholarshipAutoRefresh();
        stopNotificationAutoRefresh();
        stopDocumentsAutoRefresh();
    });

    // FAQ Accordion (Student Portal)
    const faqAccordion = document.getElementById("faqAccordion");
    if (faqAccordion) {
        faqAccordion.addEventListener("click", (event) => {
            const questionEl = event.target.closest(".faq-question");
            if (!questionEl) return;

            const itemEl = questionEl.closest(".faq-item");
            if (!itemEl) return;

            const willOpen = !itemEl.classList.contains("active");

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

    fetchScholarships();
    fetchStudentApplications();
    fetchStudentDocuments();
    fetchStudentNotifications();
    syncTrackerAutoRefresh(activeSection?.id || "");
    syncScholarshipAutoRefresh(activeSection?.id || "");
    syncDocumentsAutoRefresh(activeSection?.id || "");
    startNotificationAutoRefresh();
});
