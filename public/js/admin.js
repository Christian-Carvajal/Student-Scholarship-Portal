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
        if (modalConfirmCallback) modalConfirmCallback();
        modalOverlay.classList.add("hidden");
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
        if (targetId === "view-admin") fetchAdminLeaderboard();
    }

    navLinks.forEach(link => {
        link.addEventListener("click", (e) => {
            const targetId = e.target.getAttribute("data-target");
            if(targetId) navigateTo(targetId);
        });
    });

    fetchAdminLeaderboard(); // Init

    function fetchAdminLeaderboard() {
        const tbody = document.getElementById("adminTableBody");
        if (tbody) {
            tbody.innerHTML = `<tr>
                <td>Juan Dela Cruz</td>
                <td>Academic Excellence Grant</td>
                <td>3.85 / 4.0</td>
                <td><span class=\"status-verified\">Verified</span></td>
                <td>
                    <button class=\"btn btn-gold btn-sm\" onclick=\"window.showModal(\'Approve\', \'Approve Application?\')\">Approve</button>
                    <button class=\"btn btn-sm\" style=\"background-color:#dc3545; color:white;\">Reject</button>
                </td>
            </tr>`;
        }
    }
});
