/* ================================================================
   GOMEAL — USER LAYOUT.JS
   File: public/js/user/layout.js

   Chạy trên MỌI trang User. Phụ trách:
     1. Load sidebar component
     2. Auth guard nhẹ (guest OK, chỉ check token khi cần)
     3. Active nav highlight
     4. Sidebar mobile toggle
     5. Inject thông tin user (tên, điểm, membership)
     6. Cart dot indicator từ localStorage
     7. Topbar greeting động
     8. Logout handler
     9. Performance card SVG animation

   Phụ thuộc: common.js phải load trước file này.
   ================================================================ */

'use strict';

/* ----------------------------------------------------------------
   GUARD: Đảm bảo GoMeal (common.js) đã load
   ---------------------------------------------------------------- */
if (typeof window.GoMeal === 'undefined') {
    console.error('[UserLayout] common.js chưa được load. UserLayout sẽ không hoạt động.');
}

/* ----------------------------------------------------------------
   CONSTANTS nội bộ
   ---------------------------------------------------------------- */
const USER_SIDEBAR_COMPONENT_URL = '/public/components/user-sidebar.html';
const USER_SIDEBAR_CONTAINER_ID  = '#user-sidebar-container';
const CART_STORAGE_KEY           = 'gomeal_cart';       // localStorage key cho giỏ hàng

/* ----------------------------------------------------------------
   STATE nội bộ
   ---------------------------------------------------------------- */
let _userSidebarLoaded = false;

/* ================================================================
   1. ENTRY POINT
   ================================================================ */
document.addEventListener('DOMContentLoaded', async function userLayoutInit() {

    // ── 1.1 Soft auth check: trang user KHÔNG bắt buộc login ──
    // Chỉ block nếu trang yêu cầu đăng nhập (vd: history, profile)
    try {
        _softAuthCheck();
    } catch (authErr) {
        console.warn('[UserLayout] Auth check lỗi (bỏ qua):', authErr.message);
    }

    // ── 1.2 Load sidebar component ──
    await _loadUserSidebar();

    // ── 1.3 Khởi tạo features sau khi sidebar đã sẵn ──
    _initActiveNav();
    _initSidebarMobileToggle();
    _injectUserInfo();
    _updateCartDot();
    _initLogout();
    _initTopbarGreeting();
    _initPerformanceAnimation();
    _initChatbot();       // Chatbot hiện diện xuyên suốt mọi trang user

    // ── 1.4 Lắng nghe sự kiện giỏ hàng thay đổi từ menu.js ──
    window.addEventListener('cartUpdated', function onCartUpdated() {
        try { _updateCartDot(); } catch (_) { /* nothing */ }
    });
});

/* ================================================================
   2. SOFT AUTH CHECK
   Một số trang user yêu cầu login (history, profile, settings)
   Nhưng guest (có guestToken) luôn được phép vào menu
   ================================================================ */
function _softAuthCheck() {
    try {
        const pathname = window.location.pathname || '';

        // Các trang yêu cầu login thật (authToken)
        // NOTE: history.html KHÔNG nằm đây — guest cần xem đơn vừa đặt
        const authRequiredPages = [
            '/views/user/profile.html',
            '/views/user/settings.html',
        ];

        const requiresAuth = authRequiredPages.some(p => pathname.includes(p));

        if (requiresAuth) {
            const token = GoMeal.getToken();
            if (!token) {
                console.warn('[UserLayout] Trang này yêu cầu đăng nhập. Redirect về login.');
                window.location.href = '/views/auth/login.html';
            }
        }

    } catch (err) {
        console.warn('[UserLayout] _softAuthCheck lỗi (bỏ qua):', err.message);
    }
}

/* ================================================================
   3. LOAD SIDEBAR COMPONENT
   ================================================================ */
async function _loadUserSidebar() {
    try {
        if (_userSidebarLoaded) return;

        const container = document.querySelector(USER_SIDEBAR_CONTAINER_ID);
        if (!container) {
            // Sidebar đã có sẵn trong HTML (không dùng component loader)
            const existing = document.getElementById('userSidebar');
            if (existing) {
                _userSidebarLoaded = true;
                return;
            }
            console.warn('[UserLayout] Không tìm thấy sidebar container:', USER_SIDEBAR_CONTAINER_ID);
            return;
        }

        const success = await GoMeal.loadComponent(
            USER_SIDEBAR_CONTAINER_ID,
            USER_SIDEBAR_COMPONENT_URL
        );

        if (success) {
            _userSidebarLoaded = true;
        } else {
            console.warn('[UserLayout] Load user sidebar component thất bại.');
        }

    } catch (err) {
        console.warn('[UserLayout] _loadUserSidebar lỗi (bỏ qua):', err.message);
    }
}

/* ================================================================
   4. ACTIVE NAV HIGHLIGHT
   ================================================================ */
function _initActiveNav() {
    try {
        const pathname = window.location.pathname || '';
        const segments = pathname.split('/');
        const filename = segments[segments.length - 1] || '';
        const currentPage = filename.replace('.html', '') || 'index';

        const menuItems = document.querySelectorAll('.menu-item[data-page]');

        menuItems.forEach(item => {
            try {
                const page = item.getAttribute('data-page');
                if (page && page === currentPage) {
                    item.classList.add('active');
                }
            } catch (_) { /* skip */ }
        });

    } catch (err) {
        console.warn('[UserLayout] _initActiveNav lỗi (bỏ qua):', err.message);
    }
}

/* ================================================================
   5. SIDEBAR MOBILE TOGGLE
   ================================================================ */
function _initSidebarMobileToggle() {
    try {
        // Toggle button (nằm trong topbar, không phải sidebar)
        const toggleBtn = document.getElementById('userSidebarToggleBtn');
        const sidebar   = document.getElementById('userSidebar');
        const overlay   = document.getElementById('userSidebarOverlay');

        if (!sidebar) return;

        function openSidebar() {
            try {
                sidebar.classList.add('open');
                if (overlay) overlay.classList.add('active');
                document.body.style.overflow = 'hidden';
            } catch (_) { /* nothing */ }
        }

        function closeSidebar() {
            try {
                sidebar.classList.remove('open');
                if (overlay) overlay.classList.remove('active');
                document.body.style.overflow = '';
            } catch (_) { /* nothing */ }
        }

        // Toggle button click
        if (toggleBtn) {
            toggleBtn.addEventListener('click', function onToggleClick() {
                try {
                    sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
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

        // Expose closeSidebar để menu items có thể gọi sau khi navigate
        window._closeUserSidebar = closeSidebar;

    } catch (err) {
        console.warn('[UserLayout] _initSidebarMobileToggle lỗi (bỏ qua):', err.message);
    }
}

/* ================================================================
   6. INJECT USER INFO
   Fetch profile nếu đã đăng nhập, ngược lại hiển thị "Khách"
   ================================================================ */
async function _injectUserInfo() {
    try {
        const token = GoMeal.getToken();

        if (!token) {
            // Guest — giữ mặc định "Khách" trong sidebar HTML
            _setGuestMode();
            return;
        }

        // Có token → fetch profile
        const result = await GoMeal.safeFetch('/api/user/profile-details');

        if (!result.ok || !result.data) {
            // API lỗi → vẫn hiển thị guest mode, không crash
            _setGuestMode();
            return;
        }

        const profile = result.data;

        // ── Tên user ──
        const nameEl = document.getElementById('userDisplayName');
        if (nameEl) {
            const name = (
                typeof profile.name === 'string' && profile.name.trim()
                    ? profile.name.trim()
                    : 'Thành viên'
            );
            nameEl.textContent = name;

            // Cập nhật avatar initial
            const avatarEl = document.getElementById('userAvatarMini');
            if (avatarEl) {
                const initial = name.trim().charAt(0).toUpperCase() || 'U';
                avatarEl.innerHTML = `<span style="font-size:1rem;font-weight:800">${initial}</span>`;
            }
        }

        // ── Membership badge ──
        const badgeEl = document.getElementById('userMemberBadge');
        if (badgeEl) {
            const level = profile.membership_level || 'none';
            const badgeMap = {
                'silver':   { label: 'Bạc',       icon: 'fas fa-medal',  color: '#9CA3AF' },
                'gold':     { label: 'Vàng',       icon: 'fas fa-medal',  color: '#F59E0B' },
                'platinum': { label: 'Bạch kim',   icon: 'fas fa-gem',    color: '#6366F1' },
                'none':     { label: 'Thành viên', icon: 'fas fa-circle', color: '#10B981' },
            };
            const badge = badgeMap[level] || badgeMap['none'];

            badgeEl.innerHTML = `
                <i class="${badge.icon}" style="font-size:7px;color:${badge.color}"></i>
                <span>${badge.label}</span>
            `;

            // Thêm class màu cho gold
            if (level === 'gold') badgeEl.classList.add('gold');
        }

        // ── Điểm tích lũy ──
        const totalPoints = Number(profile.total_points) || 0;
        const pointsDisplay = document.getElementById('userPointsDisplay');
        const pointsValue   = document.getElementById('pointsValue');

        if (totalPoints > 0 && pointsDisplay && pointsValue) {
            pointsValue.textContent = totalPoints > 9999
                ? (totalPoints / 1000).toFixed(1) + 'k'
                : String(totalPoints);
            pointsDisplay.style.display = '';
        }

        // ── Update performance stats ──
        _updatePerformanceStats(profile);

        // ── Topbar: tên user ──
        const topbarName = document.getElementById('topbarUserName');
        if (topbarName && typeof profile.name === 'string') {
            topbarName.textContent = profile.name.trim();
        }

    } catch (err) {
        console.warn('[UserLayout] _injectUserInfo lỗi (bỏ qua):', err.message);
        _setGuestMode();
    }
}

/**
 * Hiển thị UI chế độ guest (không đăng nhập).
 */
function _setGuestMode() {
    try {
        // Profile mini: không hiển thị points
        const pointsDisplay = document.getElementById('userPointsDisplay');
        if (pointsDisplay) pointsDisplay.style.display = 'none';

        // Ẩn upgrade banner nếu là guest hoàn toàn (không có guestToken cũng không có authToken)
        // Giữ lại nếu có guestToken (đang ngồi ở bàn)
        const guestToken = GoMeal.getGuestToken();
        if (!guestToken) {
            // Guest hoàn toàn - sidebar vẫn hiện nhưng một số feature bị disable
            const nameEl = document.getElementById('userDisplayName');
            if (nameEl) nameEl.textContent = 'Khách vãng lai';
        }
    } catch (_) { /* nothing */ }
}

/**
 * Cập nhật performance stats (đơn hàng + điểm) ở sidebar.
 * @param {Object} profile
 */
function _updatePerformanceStats(profile) {
    try {
        // Total orders (từ history nếu có, hoặc để trống)
        const ordersEl = document.getElementById('totalOrdersStat');
        if (ordersEl && profile.total_orders !== undefined) {
            ordersEl.textContent = String(Number(profile.total_orders) || 0);
        }

        const pointsEl = document.getElementById('totalPointsStat');
        if (pointsEl) {
            const pts = Number(profile.total_points) || 0;
            pointsEl.textContent = pts > 9999 ? (pts / 1000).toFixed(1) + 'k' : String(pts);
        }
    } catch (_) { /* nothing */ }
}

/* ================================================================
   7. CART DOT INDICATOR
   Hiển thị chấm đỏ trên menu "Đặt món" nếu giỏ hàng có item
   ================================================================ */
function _updateCartDot() {
    try {
        const cartDot = document.getElementById('cartDot');
        if (!cartDot) return;

        let hasItems = false;

        try {
            const cartRaw = localStorage.getItem(CART_STORAGE_KEY);
            if (cartRaw) {
                const cart = JSON.parse(cartRaw);
                hasItems = Array.isArray(cart) && cart.length > 0;
            }
        } catch (_) { /* JSON parse fail → hasItems giữ false */ }

        cartDot.style.display = hasItems ? '' : 'none';

    } catch (err) {
        console.warn('[UserLayout] _updateCartDot lỗi (bỏ qua):', err.message);
    }
}

/* ================================================================
   8. TOPBAR GREETING — Lời chào động theo giờ
   ================================================================ */
function _initTopbarGreeting() {
    try {
        const greetingEl = document.getElementById('topbarGreetingText');
        if (!greetingEl) return;

        const hour = new Date().getHours();
        let greeting = 'Chào bạn';

        if (hour >= 5  && hour < 12) greeting = 'Chào buổi sáng';
        else if (hour >= 12 && hour < 14) greeting = 'Chào buổi trưa';
        else if (hour >= 14 && hour < 18) greeting = 'Chào buổi chiều';
        else if (hour >= 18 && hour < 22) greeting = 'Chào buổi tối';
        else greeting = 'Khuya rồi, chúc ngon miệng';

        // Lấy tên từ profile mini nếu đã inject
        const nameEl = document.getElementById('userDisplayName');
        const userName = (nameEl && nameEl.textContent && nameEl.textContent !== 'Khách')
            ? `, ${nameEl.textContent}!`
            : '!';

        greetingEl.textContent = `${greeting}${userName}`;

    } catch (err) {
        console.warn('[UserLayout] _initTopbarGreeting lỗi (bỏ qua):', err.message);
    }
}

/* ================================================================
   9. PERFORMANCE CARD SVG ANIMATION
   Animate stroke-dashoffset dựa trên điểm tích lũy
   ================================================================ */
function _initPerformanceAnimation() {
    try {
        const circle = document.getElementById('progressCircle');
        if (!circle) return;

        // Tổng chu vi = 2 * π * 33 ≈ 207.3
        const CIRCUMFERENCE = 207.3;

        // Đọc total_points — nếu chưa inject thì dùng 0
        const pointsEl = document.getElementById('totalPointsStat');
        let pts = 0;
        if (pointsEl) {
            const raw = pointsEl.textContent.replace(/[^0-9.]/g, '');
            pts = parseFloat(raw) || 0;
            // Nếu là dạng "1.2k"
            if (pointsEl.textContent.includes('k')) pts *= 1000;
        }

        // Target: 500 điểm = 100%. Clamp 0–100%
        const TARGET_FULL = 500;
        const pct = Math.min(1, Math.max(0, pts / TARGET_FULL));

        // dashoffset: 0 = full circle, CIRCUMFERENCE = empty
        const offset = CIRCUMFERENCE * (1 - pct);

        // Animate sau 300ms (đợi sidebar render xong)
        setTimeout(function animateCircle() {
            try {
                if (circle.parentNode) {
                    circle.style.strokeDashoffset = String(offset);
                }
            } catch (_) { /* nothing */ }
        }, 300);

        // Cập nhật progress value text
        const progressValueEl = document.getElementById('progressValue');
        if (progressValueEl) {
            const pctDisplay = Math.round(pct * 100);
            progressValueEl.textContent = `+${pctDisplay}%`;
        }

    } catch (err) {
        console.warn('[UserLayout] _initPerformanceAnimation lỗi (bỏ qua):', err.message);
    }
}

/* ================================================================
   10. LOGOUT HANDLER
   ================================================================ */
function _initLogout() {
    try {
        const logoutBtn = document.getElementById('userLogoutBtn');
        if (!logoutBtn) return;

        logoutBtn.addEventListener('click', async function onLogoutClick(e) {
            try {
                e.preventDefault();

                // Nếu là guest (chỉ có guestToken) → chỉ xóa guestToken
                const authToken  = GoMeal.getToken();
                const guestToken = GoMeal.getGuestToken();

                if (!authToken && guestToken) {
                    // Xóa session bàn và về landing
                    try {
                        localStorage.removeItem('guestToken');
                        localStorage.removeItem('tableId');
                    } catch (_) { /* nothing */ }
                    window.location.href = '/';
                    return;
                }

                // Có authToken → confirm trước khi logout
                const confirmed = await GoMeal.showConfirm(
                    'Bạn có chắc muốn đăng xuất không?',
                    'Đăng xuất',
                    'danger'
                );

                if (confirmed) {
                    GoMeal.logout();
                }

            } catch (clickErr) {
                console.warn('[UserLayout] Logout click lỗi:', clickErr.message);
                GoMeal.logout();
            }
        });

    } catch (err) {
        console.warn('[UserLayout] _initLogout lỗi (bỏ qua):', err.message);
    }
}


/* ================================================================
   11. CHATBOT WIDGET — Hiện diện xuyên suốt mọi trang User
   FAB button + cửa sổ chat nổi, gọi POST /api/user/public/chatbot/ask
   ================================================================ */
function _initChatbot() {
    try {
        // Tránh tạo 2 lần nếu layout.js bị gọi lại
        if (document.getElementById('chatbotBubble')) return;

        // ── Inject HTML widget vào body ──
        const widget = document.createElement('div');
        widget.id = 'chatbotBubble';
        widget.className = 'chatbot-bubble';
        widget.innerHTML = `
            <!-- FAB button -->
            <button class="chatbot-fab" id="chatbotFab" aria-label="Mở chatbot">
                <span class="fab-pulse"></span>
                <i class="fas fa-comment-dots"></i>
                <span class="fab-unread" id="fabUnread" style="display:none">1</span>
            </button>

            <!-- Chat window -->
            <div class="chatbot-window" id="chatbotWindow">
                <!-- Header -->
                <div class="chat-hd">
                    <div class="chat-hd-ico"><i class="fas fa-robot"></i></div>
                    <div>
                        <div class="chat-hd-name">GoMeal Assistant</div>
                        <div class="chat-hd-status">Đang hoạt động</div>
                    </div>
                    <button class="chat-close-btn" id="chatbotClose" aria-label="Đóng">
                        <i class="fas fa-xmark"></i>
                    </button>
                </div>

                <!-- Messages -->
                <div class="chat-msgs" id="chatbotMessages">
                    <!-- Tin nhắn chào mừng -->
                    <div class="chat-msg bot">
                        <div class="chat-icon"><i class="fas fa-robot"></i></div>
                        <div class="chat-bubble">
                            Xin chào! 👋 Tôi là GoMeal Assistant. Tôi có thể giúp bạn về <strong>thực đơn</strong>, <strong>giờ mở cửa</strong> hoặc <strong>khuyến mãi</strong>. Bạn cần gì nào?
                        </div>
                    </div>
                </div>

                <!-- Input -->
                <div class="chat-input-row">
                    <input type="text" class="chat-inp" id="chatbotInput"
                           placeholder="Nhập tin nhắn..." maxlength="200"
                           autocomplete="off">
                    <button class="chat-send-btn" id="chatbotSend" aria-label="Gửi">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(widget);

        // ── Lấy references ──
        const fab    = document.getElementById('chatbotFab');
        const window_ = document.getElementById('chatbotWindow');
        const closeBtn = document.getElementById('chatbotClose');
        const msgs   = document.getElementById('chatbotMessages');
        const input  = document.getElementById('chatbotInput');
        const sendBtn = document.getElementById('chatbotSend');
        const unread = document.getElementById('fabUnread');

        if (!fab || !window_) return;

        // ── Toggle open/close ──
        function openChat() {
            try {
                window_.classList.add('open');
                unread.style.display = 'none';
                if (input) input.focus();
            } catch (_) {}
        }
        function closeChat() {
            try { window_.classList.remove('open'); } catch (_) {}
        }

        fab.addEventListener('click', function() {
            window_.classList.contains('open') ? closeChat() : openChat();
        });
        if (closeBtn) closeBtn.addEventListener('click', closeChat);

        // ── ESC đóng chat ──
        document.addEventListener('keydown', function(e) {
            try { if (e.key === 'Escape') closeChat(); } catch (_) {}
        });

        // ── Append message bubble ──
        function appendMsg(text, role) {
            try {
                const div = document.createElement('div');
                div.className = `chat-msg \${role}`;
                if (role === 'bot') {
                    div.innerHTML = `
                        <div class="chat-icon"><i class="fas fa-robot"></i></div>
                        <div class="chat-bubble">\${_escapeHtml(text)}</div>`;
                } else {
                    div.innerHTML = `<div class="chat-bubble">\${_escapeHtml(text)}</div>`;
                }
                msgs.appendChild(div);
                msgs.scrollTop = msgs.scrollHeight;
            } catch (_) {}
        }

        // ── Typing indicator ──
        let _typingEl = null;
        function showTyping() {
            try {
                if (_typingEl) return;
                _typingEl = document.createElement('div');
                _typingEl.className = 'chat-msg bot';
                _typingEl.innerHTML = `
                    <div class="chat-icon"><i class="fas fa-robot"></i></div>
                    <div class="chat-bubble">
                        <div class="typing-indicator">
                            <span></span><span></span><span></span>
                        </div>
                    </div>`;
                msgs.appendChild(_typingEl);
                msgs.scrollTop = msgs.scrollHeight;
            } catch (_) {}
        }
        function hideTyping() {
            try {
                if (_typingEl && _typingEl.parentNode) {
                    _typingEl.parentNode.removeChild(_typingEl);
                }
                _typingEl = null;
            } catch (_) {}
        }

        // ── Escape helper (dùng nội bộ vì _escapeHtml là hàm private của common.js) ──
        function _escapeHtml(str) {
            if (typeof str !== 'string') return '';
            return str.replace(/&/g,'&amp;').replace(/</g,'&lt;')
                      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        }

        // ── Gửi message ──
        let _sending = false;
        async function sendMessage() {
            try {
                const msg = (input.value || '').trim();
                if (!msg || _sending) return;

                _sending = true;
                input.value = '';
                sendBtn.disabled = true;

                appendMsg(msg, 'user');
                showTyping();

                const res = await fetch('/api/user/public/chatbot/ask', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: msg }),
                });

                hideTyping();

                if (res.ok) {
                    const data = await res.json();
                    appendMsg(data.response || 'Xin lỗi, tôi không hiểu câu hỏi này.', 'bot');
                } else {
                    appendMsg('Xin lỗi, có lỗi xảy ra. Vui lòng thử lại!', 'bot');
                }

            } catch (err) {
                hideTyping();
                appendMsg('Không thể kết nối. Kiểm tra lại mạng nhé!', 'bot');
                console.warn('[Chatbot] sendMessage error:', err.message);
            } finally {
                _sending = false;
                if (sendBtn) sendBtn.disabled = false;
                if (input)   input.focus();
            }
        }

        // ── Events ──
        sendBtn.addEventListener('click', sendMessage);
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        // Unread dot: hiện sau 3s nếu chat chưa mở (gợi ý user)
        setTimeout(function() {
            try {
                if (!window_.classList.contains('open') && unread) {
                    unread.style.display = 'flex';
                }
            } catch (_) {}
        }, 3000);

    } catch (err) {
        console.warn('[UserLayout] _initChatbot lỗi (bỏ qua):', err.message);
    }
}

/* ================================================================
   EXPOSE — Public API cho trang con
   ================================================================ */
window.UserLayout = {
    /** Cập nhật cart dot sau khi giỏ hàng thay đổi */
    refreshCartDot: _updateCartDot,

    /** Cập nhật greeting sau khi biết tên user */
    refreshGreeting: _initTopbarGreeting,

    /** Đóng sidebar mobile */
    closeMobileSidebar: function () {
        try {
            if (typeof window._closeUserSidebar === 'function') {
                window._closeUserSidebar();
            }
        } catch (_) { /* nothing */ }
    },

    /** Cập nhật unread badge trên menu Tin nhắn */
    setUnreadCount: function (count) {
        try {
            const badge = document.getElementById('unreadBadge');
            if (!badge) return;
            const n = Number(count) || 0;
            if (n > 0) {
                badge.textContent = n > 99 ? '99+' : String(n);
                badge.style.display = '';
            } else {
                badge.style.display = 'none';
            }
        } catch (_) { /* nothing */ }
    },

    /** Mở cửa sổ chatbot từ bên ngoài */
    openChatbot: function () {
        try {
            const win = document.getElementById('chatbotWindow');
            if (win) win.classList.add('open');
        } catch (_) {}
    },

    /** Đóng cửa sổ chatbot từ bên ngoài */
    closeChatbot: function () {
        try {
            const win = document.getElementById('chatbotWindow');
            if (win) win.classList.remove('open');
        } catch (_) {}
    },
};