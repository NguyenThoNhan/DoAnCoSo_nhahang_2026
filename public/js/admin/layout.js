/* ================================================================
   GOMEAL — ADMIN LAYOUT.JS
   File: public/js/admin/layout.js

   Chạy trên MỌI trang Admin. Phụ trách:
     1. Load sidebar component
     2. Auth guard (admin only)
     3. Active nav highlight
     4. Dropdown toggle
     5. Sidebar collapse (desktop) & toggle (mobile)
     6. Pending badge từ API
     7. Inject tên Admin từ localStorage
     8. Topbar: title, breadcrumb, search toggle
     9. Logout handler
    10. Topbar mobile toggle

   Phụ thuộc: common.js phải load trước file này.
   ================================================================ */

'use strict';

/* ----------------------------------------------------------------
   GUARD: Đảm bảo GoMeal (common.js) đã load
   ---------------------------------------------------------------- */
if (typeof window.GoMeal === 'undefined') {
    console.error('[AdminLayout] common.js chưa được load. AdminLayout sẽ không hoạt động.');
}

/* ----------------------------------------------------------------
   CONSTANTS nội bộ
   ---------------------------------------------------------------- */
const SIDEBAR_COMPONENT_URL  = '/public/components/admin-sidebar.html';
const SIDEBAR_CONTAINER_ID   = '#admin-sidebar-container';
const SIDEBAR_COLLAPSED_KEY  = 'adminSidebarCollapsed'; // localStorage key
const PENDING_POLL_INTERVAL  = 30000; // 30s poll badge

/* ----------------------------------------------------------------
   STATE nội bộ (không expose ra ngoài)
   ---------------------------------------------------------------- */
let _pendingPollTimer  = null;  // setInterval ID cho pending badge
let _sidebarLoaded     = false; // Flag tránh load 2 lần

/* ================================================================
   1. ENTRY POINT — Chạy sau DOMContentLoaded
   ================================================================ */
document.addEventListener('DOMContentLoaded', async function adminLayoutInit() {

    // ── 1.1 Auth guard: chỉ admin mới vào được ──
    try {
        const token = GoMeal.getToken();
        const role  = GoMeal.getUserRole();

        if (!token || role !== 'admin') {
            const pathname = window.location.pathname || '';
            // Chỉ redirect nếu chưa ở trang login
            if (!pathname.includes('/auth/login')) {
                console.warn('[AdminLayout] Không có quyền admin. Chuyển về login.');
                window.location.href = '/views/auth/login.html';
            }
            return; // Dừng toàn bộ khởi tạo nếu không có quyền
        }
    } catch (authErr) {
        console.warn('[AdminLayout] Auth check lỗi (bỏ qua):', authErr.message);
    }

    // ── 1.2 Load sidebar component ──
    await _loadSidebar();

    // ── 1.3 Khởi tạo tất cả features sau khi sidebar đã có trong DOM ──
    _initActiveNav();
    _initDropdowns();
    _initSidebarCollapse();
    _initSidebarMobileToggle();
    _injectAdminInfo();
    _initLogout();
    _initTopbar();
    _startPendingBadgePoll();
});

/* ================================================================
   2. LOAD SIDEBAR COMPONENT
   ================================================================ */
async function _loadSidebar() {
    try {
        if (_sidebarLoaded) return;

        const container = document.querySelector(SIDEBAR_CONTAINER_ID);
        if (!container) {
            // Thử fallback selector
            const fallback = document.querySelector('#adminSidebar');
            if (fallback) {
                // Sidebar đã có sẵn trong HTML (không dùng component loading)
                _sidebarLoaded = true;
                return;
            }
            console.warn('[AdminLayout] Không tìm thấy sidebar container:', SIDEBAR_CONTAINER_ID);
            return;
        }

        const success = await GoMeal.loadComponent(SIDEBAR_CONTAINER_ID, SIDEBAR_COMPONENT_URL);

        if (success) {
            _sidebarLoaded = true;
        } else {
            console.warn('[AdminLayout] Load sidebar component thất bại.');
        }

    } catch (err) {
        console.warn('[AdminLayout] _loadSidebar lỗi (bỏ qua):', err.message);
    }
}

/* ================================================================
   3. ACTIVE NAV HIGHLIGHT
   Đọc pathname, match với data-page attribute của mỗi nav-link
   ================================================================ */
function _initActiveNav() {
    try {
        const pathname = window.location.pathname || '';

        // Lấy tên file hiện tại (vd: "orders.html" → "orders")
        const segments = pathname.split('/');
        const filename = segments[segments.length - 1] || '';
        const currentPage = filename.replace('.html', '') || 'index';

        // ── Active cho nav-link thường ──
        const navLinks = document.querySelectorAll('.nav-link[data-page]');
        navLinks.forEach(link => {
            try {
                const page = link.getAttribute('data-page');
                if (page && page === currentPage) {
                    link.classList.add('active');

                    // Nếu link nằm trong dropdown → mở dropdown cha
                    const parentDropdown = link.closest('.has-dropdown');
                    if (parentDropdown) {
                        parentDropdown.classList.add('open');
                        // Active luôn trigger link cho dropdown parent
                        const triggerLink = parentDropdown.querySelector('.nav-dropdown-trigger');
                        if (triggerLink) triggerLink.classList.add('active');
                    }
                }
            } catch (_) { /* single link fail → skip */ }
        });

        // ── Active cho nav-dropdown-item ──
        const dropdownItems = document.querySelectorAll('.nav-dropdown-item[data-page]');
        dropdownItems.forEach(item => {
            try {
                const page = item.getAttribute('data-page');
                if (page && page === currentPage) {
                    item.classList.add('active');

                    // Mở dropdown cha
                    const parentDropdown = item.closest('.has-dropdown');
                    if (parentDropdown) {
                        parentDropdown.classList.add('open');
                        const triggerLink = parentDropdown.querySelector('.nav-dropdown-trigger');
                        if (triggerLink) triggerLink.classList.add('active');
                    }
                }
            } catch (_) { /* skip */ }
        });

        // ── Cập nhật topbar breadcrumb & title ──
        _updateTopbarPageInfo(currentPage);

    } catch (err) {
        console.warn('[AdminLayout] _initActiveNav lỗi (bỏ qua):', err.message);
    }
}

/* ================================================================
   4. DROPDOWN TOGGLE (Quản lý Menu)
   ================================================================ */
function _initDropdowns() {
    try {
        const triggers = document.querySelectorAll('.nav-dropdown-trigger');

        triggers.forEach(trigger => {
            if (!trigger) return;

            trigger.addEventListener('click', function onDropdownClick(e) {
                try {
                    e.preventDefault();
                    const parentItem = trigger.closest('.has-dropdown');
                    if (!parentItem) return;

                    const isOpen = parentItem.classList.contains('open');

                    // Đóng tất cả dropdown khác trước
                    document.querySelectorAll('.nav-item.has-dropdown.open').forEach(openItem => {
                        try {
                            if (openItem !== parentItem) {
                                openItem.classList.remove('open');
                            }
                        } catch (_) { /* skip */ }
                    });

                    // Toggle dropdown này
                    parentItem.classList.toggle('open', !isOpen);

                } catch (clickErr) {
                    console.warn('[AdminLayout] Dropdown click lỗi:', clickErr.message);
                }
            });
        });

    } catch (err) {
        console.warn('[AdminLayout] _initDropdowns lỗi (bỏ qua):', err.message);
    }
}

/* ================================================================
   5. SIDEBAR COLLAPSE (Desktop — thu gọn thành icon-only)
   ================================================================ */
function _initSidebarCollapse() {
    try {
        const collapseBtn = document.getElementById('sidebarCollapseBtn');
        const sidebar     = document.getElementById('adminSidebar');
        const mainEl      = document.querySelector('.admin-main');

        if (!collapseBtn || !sidebar) return;

        // Khôi phục trạng thái collapse từ localStorage
        try {
            const savedState = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
            if (savedState === 'true') {
                sidebar.classList.add('collapsed');
                if (mainEl) mainEl.style.marginLeft = '68px';
            }
        } catch (_) { /* localStorage blocked */ }

        collapseBtn.addEventListener('click', function onCollapseClick() {
            try {
                const isCollapsed = sidebar.classList.toggle('collapsed');

                // Cập nhật margin của main content
                if (mainEl) {
                    mainEl.style.marginLeft = isCollapsed
                        ? '68px'
                        : 'var(--sidebar-admin-width)';
                }

                // Lưu state
                try {
                    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isCollapsed));
                } catch (_) { /* ignore */ }

                // Đổi icon
                const icon = collapseBtn.querySelector('i');
                if (icon) {
                    icon.className = isCollapsed ? 'fas fa-bars' : 'fas fa-bars';
                }

                // Dispatch event để các trang có thể react (vd: resize chart)
                try {
                    window.dispatchEvent(new Event('sidebarToggle'));
                } catch (_) { /* older browsers */ }

            } catch (collapseErr) {
                console.warn('[AdminLayout] Collapse click lỗi:', collapseErr.message);
            }
        });

    } catch (err) {
        console.warn('[AdminLayout] _initSidebarCollapse lỗi (bỏ qua):', err.message);
    }
}

/* ================================================================
   6. SIDEBAR MOBILE TOGGLE
   ================================================================ */
function _initSidebarMobileToggle() {
    try {
        const toggleBtn = document.getElementById('sidebarToggleBtn');
        const sidebar   = document.getElementById('adminSidebar');
        const overlay   = document.getElementById('sidebarOverlay');

        if (!toggleBtn && !sidebar) return;

        // Hàm mở sidebar
        function openSidebar() {
            try {
                if (sidebar)  sidebar.classList.add('open');
                if (overlay)  overlay.classList.add('active');
                document.body.style.overflow = 'hidden';
            } catch (_) { /* nothing */ }
        }

        // Hàm đóng sidebar
        function closeSidebar() {
            try {
                if (sidebar)  sidebar.classList.remove('open');
                if (overlay)  overlay.classList.remove('active');
                document.body.style.overflow = '';
            } catch (_) { /* nothing */ }
        }

        // Toggle button click
        if (toggleBtn) {
            toggleBtn.addEventListener('click', function onToggleClick() {
                try {
                    const isOpen = sidebar && sidebar.classList.contains('open');
                    isOpen ? closeSidebar() : openSidebar();
                } catch (_) { /* nothing */ }
            });
        }

        // Overlay click → đóng
        if (overlay) {
            overlay.addEventListener('click', function onOverlayClick() {
                closeSidebar();
            });
        }

        // ESC key → đóng
        document.addEventListener('keydown', function onEscKey(e) {
            try {
                if (e.key === 'Escape') closeSidebar();
            } catch (_) { /* nothing */ }
        });

    } catch (err) {
        console.warn('[AdminLayout] _initSidebarMobileToggle lỗi (bỏ qua):', err.message);
    }
}

/* ================================================================
   7. INJECT ADMIN USER INFO vào sidebar footer
   ================================================================ */
function _injectAdminInfo() {
    try {
        // Đọc thông tin từ localStorage (được lưu lúc login)
        let userName = 'Admin User';
        let userRole = 'Quản trị viên';

        try {
            const stored = localStorage.getItem('adminInfo');
            if (stored) {
                const info = JSON.parse(stored);
                if (info && typeof info.name === 'string' && info.name.trim()) {
                    userName = info.name.trim();
                }
                if (info && typeof info.role === 'string' && info.role.trim()) {
                    userRole = info.role.trim();
                }
            }
        } catch (_) { /* JSON parse fail → dùng default */ }

        // Inject tên
        const nameEl = document.getElementById('adminUserName');
        if (nameEl) nameEl.textContent = userName;

        // Inject avatar initial (chữ đầu của tên)
        const avatarEl = document.getElementById('adminAvatarText');
        if (avatarEl) {
            const initial = userName.trim().charAt(0).toUpperCase() || 'A';
            avatarEl.textContent = initial;
        }

        // Inject topbar profile nếu có
        const topbarName = document.getElementById('topbarUserName');
        if (topbarName) topbarName.textContent = userName;

        const topbarAvatar = document.getElementById('topbarUserAvatar');
        if (topbarAvatar) {
            const initial = userName.trim().charAt(0).toUpperCase() || 'A';
            topbarAvatar.textContent = initial;
        }

    } catch (err) {
        console.warn('[AdminLayout] _injectAdminInfo lỗi (bỏ qua):', err.message);
    }
}

/* ================================================================
   8. TOPBAR — Title, Breadcrumb
   ================================================================ */
function _initTopbar() {
    try {
        // Topbar mobile toggle
        const mobileToggle = document.getElementById('sidebarToggleBtn');
        if (mobileToggle) {
            // Handler đã được gán ở _initSidebarMobileToggle
            // Chỉ đảm bảo element tồn tại
        }

        // Notification button (placeholder — trang riêng sẽ implement chi tiết)
        const notifyBtn = document.getElementById('adminNotifyBtn');
        if (notifyBtn) {
            notifyBtn.addEventListener('click', function onNotifyClick(e) {
                try {
                    e.preventDefault();
                    // TODO: mở notification dropdown (implement ở trang cụ thể)
                } catch (_) { /* nothing */ }
            });
        }

    } catch (err) {
        console.warn('[AdminLayout] _initTopbar lỗi (bỏ qua):', err.message);
    }
}

/**
 * Cập nhật title và breadcrumb trên topbar dựa vào tên trang.
 * @param {string} currentPage  Tên file không có .html
 */
function _updateTopbarPageInfo(currentPage) {
    try {
        const pageMap = {
            'index':        { title: 'Dashboard',          crumb: 'Tổng quan' },
            'categories':   { title: 'Danh mục món',        crumb: 'Thực đơn › Danh mục' },
            'foods':        { title: 'Quản lý món ăn',      crumb: 'Thực đơn › Món ăn' },
            'ingredients':  { title: 'Nguyên liệu & Kho',   crumb: 'Thực đơn › Nguyên liệu' },
            'combos':       { title: 'Combo khuyến mãi',    crumb: 'Thực đơn › Combo' },
            'orders':       { title: 'Quản lý đơn hàng',    crumb: 'Đơn hàng' },
            'tables':       { title: 'Quản lý bàn',         crumb: 'Cơ sở › Bàn' },
            'staff':        { title: 'Nhân viên',           crumb: 'Cơ sở › Nhân viên' },
            'customer':     { title: 'Khách hàng',          crumb: 'Cơ sở › Khách hàng' },
            'promotions':   { title: 'Mã giảm giá',         crumb: 'Marketing › Khuyến mãi' },
            'chatbot':      { title: 'Chatbot AI',          crumb: 'Hệ thống › Chatbot' },
            'settings':     { title: 'Cài đặt hệ thống',    crumb: 'Hệ thống › Cài đặt' },
        };

        const info = pageMap[currentPage] || { title: 'GoMeal Admin', crumb: '' };

        // Cập nhật <title> tag
        try { document.title = `${info.title} — GoMeal Admin`; } catch (_) { /* nothing */ }

        // Cập nhật topbar title element
        const topbarTitle = document.getElementById('topbarTitle');
        if (topbarTitle) topbarTitle.textContent = info.title;

        // Cập nhật breadcrumb
        const breadcrumb = document.getElementById('topbarBreadcrumb');
        if (breadcrumb && info.crumb) {
            breadcrumb.innerHTML = `
                <a href="/views/admin/index.html">GoMeal</a>
                <span class="separator">›</span>
                <span class="current">${_safeEscape(info.crumb)}</span>
            `;
        }

    } catch (err) {
        console.warn('[AdminLayout] _updateTopbarPageInfo lỗi (bỏ qua):', err.message);
    }
}

/* ================================================================
   9. PENDING BADGE — Polling số đơn chờ xác nhận
   ================================================================ */
function _startPendingBadgePoll() {
    // Fetch ngay lần đầu
    _fetchPendingCount();

    // Poll định kỳ (clear nếu đã có timer trước đó)
    if (_pendingPollTimer) {
        clearInterval(_pendingPollTimer);
        _pendingPollTimer = null;
    }

    _pendingPollTimer = setInterval(function pollPending() {
        _fetchPendingCount();
    }, PENDING_POLL_INTERVAL);

    // Dọn timer khi rời trang
    window.addEventListener('beforeunload', function cleanupTimer() {
        try {
            if (_pendingPollTimer) {
                clearInterval(_pendingPollTimer);
                _pendingPollTimer = null;
            }
        } catch (_) { /* nothing */ }
    }, { once: true });
}

/**
 * Fetch số đơn pending từ API và update badge.
 * Không crash nếu API lỗi.
 */
async function _fetchPendingCount() {
    try {
        // Thử stats/dashboard trước (khi DB có data)
        const statsResult = await GoMeal.safeFetch('/api/admin/stats/dashboard');
        if (statsResult.ok && statsResult.data) {
            const count = statsResult.data?.cards?.pendingCount ?? 0;
            _updatePendingBadge(Number(count) || 0);
            return;
        }
        // Fallback: đếm từ /api/admin/orders (luôn hoạt động)
        const ordersResult = await GoMeal.safeFetch('/api/admin/orders');
        if (ordersResult.ok && Array.isArray(ordersResult.data)) {
            const count = ordersResult.data.filter(o => o.status === 'pending').length;
            _updatePendingBadge(count);
        }
    } catch (err) {
        console.warn('[AdminLayout] _fetchPendingCount lỗi (bỏ qua):', err.message);
    }
}

/**
 * Cập nhật hiển thị badge số đơn pending.
 * @param {number} count
 */
function _updatePendingBadge(count) {
    try {
        const badge = document.getElementById('pendingBadge');
        if (!badge) return;

        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : String(count);
            badge.style.display = '';
        } else {
            badge.style.display = 'none';
        }

        // Cũng update topbar badge nếu có
        const topbarBadge = document.getElementById('topbarPendingBadge');
        if (topbarBadge) {
            topbarBadge.textContent = count > 99 ? '99+' : String(count);
            topbarBadge.style.display = count > 0 ? '' : 'none';
        }

    } catch (err) {
        console.warn('[AdminLayout] _updatePendingBadge lỗi (bỏ qua):', err.message);
    }
}

/* ================================================================
   10. LOGOUT HANDLER
   ================================================================ */
function _initLogout() {
    try {
        const logoutBtn = document.getElementById('adminLogoutBtn');
        if (!logoutBtn) return;

        logoutBtn.addEventListener('click', async function onLogoutClick(e) {
            try {
                e.preventDefault();
                const confirmed = await GoMeal.showConfirm(
                    'Bạn có chắc muốn đăng xuất không?',
                    'Đăng xuất',
                    'danger'
                );
                if (confirmed) {
                    // Dọn timer trước khi logout
                    if (_pendingPollTimer) {
                        clearInterval(_pendingPollTimer);
                        _pendingPollTimer = null;
                    }
                    GoMeal.logout();
                }
            } catch (clickErr) {
                console.warn('[AdminLayout] Logout click lỗi:', clickErr.message);
                // Fallback: logout thẳng không confirm
                GoMeal.logout();
            }
        });

    } catch (err) {
        console.warn('[AdminLayout] _initLogout lỗi (bỏ qua):', err.message);
    }
}

/* ================================================================
   HELPERS NỘI BỘ
   ================================================================ */

/**
 * Escape HTML đơn giản — dùng nội bộ trong layout.js.
 * @param {string} str
 * @returns {string}
 */
function _safeEscape(str) {
    try {
        if (typeof str !== 'string') return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    } catch (_) {
        return '';
    }
}

/* ================================================================
   EXPOSE — Các hàm public để trang con có thể gọi nếu cần
   ================================================================ */
window.AdminLayout = {
    /** Cập nhật badge thủ công (dùng sau khi admin xử lý đơn) */
    refreshPendingBadge: _fetchPendingCount,

    /** Đóng sidebar mobile thủ công */
    closeMobileSidebar: function () {
        try {
            const sidebar = document.getElementById('adminSidebar');
            const overlay = document.getElementById('sidebarOverlay');
            if (sidebar)  sidebar.classList.remove('open');
            if (overlay)  overlay.classList.remove('active');
            document.body.style.overflow = '';
        } catch (_) { /* nothing */ }
    },
};