/* ================================================================
   GOMEAL — COMMON.JS
   File: public/js/common.js
   Dùng chung toàn bộ hệ thống (Admin + User)

   NGUYÊN TẮC AN TOÀN:
   - Mọi function đều có try/catch
   - Không throw error ra ngoài
   - Không assume DOM tồn tại
   - Không assume API trả đúng format
   - Không redirect vòng lặp
   - showToast KHÔNG bao giờ gọi lại chính nó
   ================================================================ */

'use strict';

/* ----------------------------------------------------------------
   0. CONSTANTS
   ---------------------------------------------------------------- */
const GOMEAL = {
    API_BASE:          '',                          // relative URL, Express phục vụ cùng origin
    TOKEN_KEY:         'authToken',
    ROLE_KEY:          'userRole',
    GUEST_TOKEN_KEY:   'guestToken',
    TABLE_ID_KEY:      'tableId',
    TOAST_DURATION:    3000,                        // ms
    MAX_TOASTS:        5,
    SETTINGS_CACHE_KEY:'gomeal_settings_cache',
    DEFAULT_RES_NAME:  'GoMeal',
};

/* ----------------------------------------------------------------
   1. TOKEN HELPERS
   ---------------------------------------------------------------- */

/**
 * Lấy auth token từ localStorage.
 * @returns {string|null}
 */
function getToken() {
    try {
        return localStorage.getItem(GOMEAL.TOKEN_KEY) || null;
    } catch (_) {
        return null;
    }
}

/**
 * Lấy role của user từ localStorage.
 * @returns {string|null}  'admin' | 'customer' | null
 */
function getUserRole() {
    try {
        return localStorage.getItem(GOMEAL.ROLE_KEY) || null;
    } catch (_) {
        return null;
    }
}

/**
 * Lấy guest token (phiên QR bàn) từ localStorage.
 * @returns {string|null}
 */
function getGuestToken() {
    try {
        return localStorage.getItem(GOMEAL.GUEST_TOKEN_KEY) || null;
    } catch (_) {
        return null;
    }
}

/**
 * Trả về Authorization header nếu có token, ngược lại trả về {}.
 * Ưu tiên: authToken (admin/customer) → guestToken (khách vãng lai tại bàn) → {}
 * KHÔNG bao giờ throw.
 * @returns {Object}
 */
function getAuthHeader() {
    try {
        // Ưu tiên 1: auth token (member đã đăng nhập hoặc admin)
        const token = getToken();
        if (token && typeof token === 'string' && token.trim() !== '') {
            return { 'Authorization': `Bearer ${token.trim()}` };
        }
        // Ưu tiên 2: guest token (khách ngồi tại bàn, quét QR)
        // Dùng cho các API order của trang user khi khách chưa đăng nhập
        const guestToken = getGuestToken();
        if (guestToken && typeof guestToken === 'string' && guestToken.trim() !== '') {
            return { 'Authorization': `Bearer ${guestToken.trim()}` };
        }
        return {};
    } catch (_) {
        return {};
    }
}

/**
 * Xóa toàn bộ session data khỏi localStorage.
 */
function clearSession() {
    try {
        localStorage.removeItem(GOMEAL.TOKEN_KEY);
        localStorage.removeItem(GOMEAL.ROLE_KEY);
        localStorage.removeItem(GOMEAL.GUEST_TOKEN_KEY);
        localStorage.removeItem(GOMEAL.TABLE_ID_KEY);
    } catch (_) {
        // localStorage có thể bị block trong một số môi trường — bỏ qua
    }
}

/* ----------------------------------------------------------------
   2. AUTH GUARD
   ---------------------------------------------------------------- */

/**
 * Kiểm tra xác thực và redirect nếu cần.
 *
 * Logic:
 * - Nếu đang ở trang login/register → KHÔNG redirect (tránh vòng lặp)
 * - Nếu đang ở trang /admin/* và không có token → redirect về login
 * - Các trang user không bắt buộc token (guest có thể xem menu)
 *
 * KHÔNG redirect vòng lặp: kiểm tra pathname trước khi redirect.
 */
function checkAuth() {
    try {
        const pathname = window.location.pathname || '';

        // Danh sách trang không cần guard
        const publicPaths = [
            '/views/auth/login.html',
            '/views/auth/register.html',
            '/views/user/table-select.html',
        ];

        const isPublicPage = publicPaths.some(p => pathname.includes(p));
        if (isPublicPage) return;

        // Guard cho Admin pages
        const isAdminPage = pathname.includes('/views/admin/');
        if (isAdminPage) {
            const token = getToken();
            const role  = getUserRole();

            if (!token || role !== 'admin') {
                console.warn('[GoMeal] Không có quyền truy cập trang admin. Redirect về login.');
                // Chỉ redirect nếu CHƯA ở trang login (tránh vòng lặp)
                if (!pathname.includes('/auth/login')) {
                    window.location.href = '/views/auth/login.html';
                }
            }
        }
    } catch (err) {
        // Không bao giờ crash — chỉ log
        console.warn('[GoMeal] checkAuth error (bỏ qua):', err.message);
    }
}

/**
 * Đăng xuất: xóa session và về trang login.
 */
function logout() {
    try {
        clearSession();
        window.location.href = '/views/auth/login.html';
    } catch (_) {
        // Fallback nếu redirect fail
        try { window.location.replace('/views/auth/login.html'); } catch (__) { /* nothing */ }
    }
}

/* ----------------------------------------------------------------
   3. SAFE FETCH — Wrapper fetch an toàn
   ---------------------------------------------------------------- */

/**
 * Wrapper fetch tự động:
 *  - Gắn Authorization header nếu có token
 *  - Gắn Content-Type: application/json cho POST/PUT
 *  - Xử lý lỗi HTTP (401, 404, 500...)
 *  - KHÔNG throw ra ngoài — trả về { ok: false, data: null, status } nếu lỗi
 *
 * @param {string} url
 * @param {RequestInit} options
 * @returns {Promise<{ok: boolean, status: number, data: any}>}
 */
async function safeFetch(url, options = {}) {
    try {
        // Build headers
        const headers = {
            'Content-Type': 'application/json',
            ...getAuthHeader(),
            ...(options.headers || {}),
        };

        const response = await fetch(url, {
            ...options,
            headers,
        });

        // Đọc body text trước, rồi parse JSON để tránh crash nếu body không phải JSON
        let data = null;
        try {
            const text = await response.text();
            if (text && text.trim().length > 0) {
                data = JSON.parse(text);
            }
        } catch (_) {
            // Body không phải JSON — data giữ null, không crash
            console.warn(`[GoMeal] safeFetch: Response từ ${url} không phải JSON`);
        }

        // Xử lý các HTTP error codes
        if (!response.ok) {
            if (response.status === 401) {
                console.warn(`[GoMeal] safeFetch 401: Unauthorized — ${url}`);
                // Không redirect tự động để tránh vòng lặp
                // checkAuth() sẽ handle redirect ở page load
            } else if (response.status === 403) {
                console.warn(`[GoMeal] safeFetch 403: Forbidden — ${url}`);
            } else if (response.status === 404) {
                console.warn(`[GoMeal] safeFetch 404: Not found — ${url}`);
            } else if (response.status >= 500) {
                console.warn(`[GoMeal] safeFetch ${response.status}: Server error — ${url}`);
            }

            return { ok: false, status: response.status, data };
        }

        return { ok: true, status: response.status, data };

    } catch (networkErr) {
        // Lỗi mạng (offline, CORS, DNS...) — không crash, chỉ warn
        console.warn(`[GoMeal] safeFetch network error (${url}):`, networkErr.message);
        return { ok: false, status: 0, data: null };
    }
}

/* ----------------------------------------------------------------
   4. APPLY GLOBAL SETTINGS
   ---------------------------------------------------------------- */

/**
 * Gọi API settings và áp dụng tên nhà hàng lên DOM.
 *
 * - Nếu API lỗi → dùng default hoặc cached value
 * - Không throw error
 * - Không crash nếu DOM element không tồn tại
 */
async function applyGlobalSettings() {
    try {
        // GET /api/admin/settings là admin-only (verifyToken+isAdmin).
        // common.js chạy trên cả trang user → không thể gọi route này.
        // Dùng sessionStorage cache (lưu từ trang admin nếu có), hoặc default name.
        let cachedName = null;
        try {
            cachedName = sessionStorage.getItem(GOMEAL.SETTINGS_CACHE_KEY);
        } catch (_) { /* sessionStorage blocked */ }

        _applyResName(cachedName || GOMEAL.DEFAULT_RES_NAME);

    } catch (err) {
        console.warn('[GoMeal] applyGlobalSettings error (bỏ qua):', err.message);
    }
}

/**
 * Helper nội bộ: inject tên nhà hàng vào tất cả .res-name elements.
 * KHÔNG export ra ngoài.
 * @param {string} name
 */
function _applyResName(name) {
    try {
        if (!name || typeof name !== 'string') return;
        const elements = document.querySelectorAll('.res-name');
        elements.forEach(el => {
            try { el.textContent = name; } catch (_) { /* single element fail → skip */ }
        });
    } catch (_) {
        // querySelectorAll có thể fail trong edge cases — bỏ qua
    }
}

/* ----------------------------------------------------------------
   5. TOAST NOTIFICATION
   ---------------------------------------------------------------- */

// Flag nội bộ để đảm bảo container chỉ tạo 1 lần
let _toastContainer = null;

/**
 * Lấy hoặc tạo toast container.
 * KHÔNG gọi showToast hoặc bất kỳ hàm nào có thể gây đệ quy.
 * @returns {HTMLElement|null}
 */
function _getToastContainer() {
    try {
        if (_toastContainer && document.body.contains(_toastContainer)) {
            return _toastContainer;
        }

        // Tìm container đã có trong DOM
        const existing = document.getElementById('toastContainer');
        if (existing) {
            _toastContainer = existing;
            return _toastContainer;
        }

        // Tạo mới nếu chưa có
        const container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        container.setAttribute('aria-live', 'polite');
        container.setAttribute('aria-atomic', 'false');

        if (document.body) {
            document.body.appendChild(container);
            _toastContainer = container;
            return _toastContainer;
        }

        return null;
    } catch (_) {
        return null;
    }
}

/**
 * Hiển thị toast notification.
 *
 * ⚠️ QUAN TRỌNG:
 *  - Hàm này KHÔNG gọi lại chính nó trong bất kỳ nhánh nào
 *  - Không dùng recursion
 *  - Không dùng thư viện ngoài
 *  - setTimeout callback chỉ thao tác DOM, không gọi showToast
 *
 * @param {string} message  - Nội dung toast
 * @param {'success'|'error'|'warning'|'info'} type - Loại toast
 * @param {string} [title]  - Tiêu đề tùy chọn
 */
function showToast(message, type, title) {
    // ── Validate input — không throw, chỉ fallback ──
    const safeMessage = (typeof message === 'string' && message.trim())
        ? message.trim()
        : 'Có thông báo mới';

    const validTypes = ['success', 'error', 'warning', 'info'];
    const safeType   = validTypes.includes(type) ? type : 'info';

    // ── Icon map (inline string, không gọi hàm nào) ──
    const iconMap = {
        success: '<i class="fas fa-circle-check"></i>',
        error:   '<i class="fas fa-circle-xmark"></i>',
        warning: '<i class="fas fa-triangle-exclamation"></i>',
        info:    '<i class="fas fa-circle-info"></i>',
    };

    const titleMap = {
        success: 'Thành công',
        error:   'Lỗi',
        warning: 'Cảnh báo',
        info:    'Thông báo',
    };

    const safeTitle = (typeof title === 'string' && title.trim())
        ? title.trim()
        : titleMap[safeType];

    try {
        const container = _getToastContainer();
        if (!container) {
            // DOM chưa sẵn sàng — fallback im lặng, KHÔNG gọi lại showToast
            console.info(`[GoMeal Toast] ${safeType.toUpperCase()}: ${safeMessage}`);
            return;
        }

        // Giới hạn số toast đồng thời để tránh spam
        try {
            const existing = container.querySelectorAll('.toast');
            if (existing.length >= GOMEAL.MAX_TOASTS) {
                const oldest = existing[0];
                if (oldest && oldest.parentNode) {
                    oldest.parentNode.removeChild(oldest);
                }
            }
        } catch (_) { /* không quan trọng */ }

        // ── Tạo toast element ──
        const toast = document.createElement('div');
        toast.className = `toast toast-${safeType}`;
        toast.setAttribute('role', 'alert');

        // innerHTML an toàn vì icon là constant string, message đã sanitize
        toast.innerHTML = `
            <div class="toast-icon">${iconMap[safeType]}</div>
            <div class="toast-content">
                <div class="toast-title">${_escapeHtml(safeTitle)}</div>
                <div class="toast-message">${_escapeHtml(safeMessage)}</div>
            </div>
            <button class="toast-dismiss" type="button" aria-label="Đóng">
                <i class="fas fa-xmark"></i>
            </button>
        `;

        // ── Nút đóng — chỉ remove DOM element, KHÔNG gọi showToast ──
        const dismissBtn = toast.querySelector('.toast-dismiss');
        if (dismissBtn) {
            dismissBtn.addEventListener('click', function onDismiss() {
                // Cleanup listener trước khi thao tác DOM
                dismissBtn.removeEventListener('click', onDismiss);
                _removeToast(toast);
            });
        }

        container.appendChild(toast);

        // ── Auto remove sau TOAST_DURATION ms ──
        // setTimeout callback chỉ gọi _removeToast — KHÔNG gọi showToast
        const timerId = setTimeout(function autoRemove() {
            _removeToast(toast);
        }, GOMEAL.TOAST_DURATION);

        // Lưu timerId để có thể cancel khi dismiss sớm
        try { toast.dataset.timerId = String(timerId); } catch (_) { /* minor */ }

    } catch (err) {
        // Nếu mọi thứ fail — fallback im lặng, KHÔNG gọi lại showToast
        console.warn('[GoMeal] showToast error (bỏ qua):', err.message);
    }
}

/**
 * Helper nội bộ: remove 1 toast khỏi DOM với animation.
 * KHÔNG gọi showToast.
 * @param {HTMLElement} toastEl
 */
function _removeToast(toastEl) {
    try {
        if (!toastEl || !toastEl.parentNode) return;

        // Cancel auto-remove timer nếu còn
        try {
            const timerId = parseInt(toastEl.dataset.timerId, 10);
            if (!isNaN(timerId)) clearTimeout(timerId);
        } catch (_) { /* minor */ }

        // Trigger CSS hide animation
        toastEl.classList.add('hiding');

        // Remove khỏi DOM sau khi animation xong
        setTimeout(function removeFromDom() {
            try {
                if (toastEl.parentNode) {
                    toastEl.parentNode.removeChild(toastEl);
                }
            } catch (_) { /* element đã bị remove bởi nơi khác */ }
        }, 280); // khớp với keyframe toastOut duration

    } catch (_) { /* không crash */ }
}

/**
 * Helper: escape HTML để tránh XSS khi render toast message.
 * @param {string} str
 * @returns {string}
 */
function _escapeHtml(str) {
    try {
        if (typeof str !== 'string') return '';
        return str
            .replace(/&/g,  '&amp;')
            .replace(/</g,  '&lt;')
            .replace(/>/g,  '&gt;')
            .replace(/"/g,  '&quot;')
            .replace(/'/g,  '&#x27;');
    } catch (_) {
        return '';
    }
}

/* ----------------------------------------------------------------
   6. FORMAT HELPERS
   ---------------------------------------------------------------- */

/**
 * Format số tiền VND.
 * @param {number|string} amount
 * @returns {string}  VD: "150.000₫"
 */
function formatCurrency(amount) {
    try {
        const num = Number(amount);
        if (isNaN(num)) return '0₫';
        return num.toLocaleString('vi-VN') + '₫';
    } catch (_) {
        return '0₫';
    }
}

/**
 * Format date string sang dd/mm/yyyy.
 * @param {string|Date} dateInput
 * @returns {string}
 */
function formatDate(dateInput) {
    try {
        if (!dateInput) return '—';
        const d = new Date(dateInput);
        if (isNaN(d.getTime())) return String(dateInput);
        const dd   = String(d.getDate()).padStart(2, '0');
        const mm   = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
    } catch (_) {
        return '—';
    }
}

/**
 * Format datetime sang dd/mm/yyyy HH:MM.
 * @param {string|Date} dateInput
 * @returns {string}
 */
function formatDateTime(dateInput) {
    try {
        if (!dateInput) return '—';
        const d = new Date(dateInput);
        if (isNaN(d.getTime())) return String(dateInput);
        const dd   = String(d.getDate()).padStart(2, '0');
        const mm   = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        const hh   = String(d.getHours()).padStart(2, '0');
        const min  = String(d.getMinutes()).padStart(2, '0');
        return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
    } catch (_) {
        return '—';
    }
}

/**
 * Format "time ago" — bao nhiêu phút/giờ trước.
 * @param {string|Date} dateInput
 * @returns {string}
 */
function timeAgo(dateInput) {
    try {
        if (!dateInput) return '—';
        const d = new Date(dateInput);
        if (isNaN(d.getTime())) return '—';

        const diffMs  = Date.now() - d.getTime();
        const diffMin = Math.floor(diffMs / 60000);

        if (diffMin < 1)  return 'Vừa xong';
        if (diffMin < 60) return `${diffMin} phút trước`;

        const diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24)  return `${diffHr} giờ trước`;

        const diffDay = Math.floor(diffHr / 24);
        if (diffDay < 7)  return `${diffDay} ngày trước`;

        return formatDate(d);
    } catch (_) {
        return '—';
    }
}

/* ----------------------------------------------------------------
   7. DOM HELPERS
   ---------------------------------------------------------------- */

/**
 * Load một HTML component vào selector bằng fetch.
 * An toàn: không crash nếu selector không tồn tại hoặc URL lỗi.
 *
 * @param {string} selector   CSS selector của container (VD: '#sidebar-container')
 * @param {string} url        Đường dẫn tới file HTML component
 * @returns {Promise<boolean>} true nếu thành công
 */
async function loadComponent(selector, url) {
    try {
        const container = document.querySelector(selector);
        if (!container) {
            console.warn(`[GoMeal] loadComponent: selector "${selector}" không tìm thấy trong DOM`);
            return false;
        }

        const response = await fetch(url);
        if (!response.ok) {
            console.warn(`[GoMeal] loadComponent: không thể load "${url}" (HTTP ${response.status})`);
            return false;
        }

        const html = await response.text();
        if (typeof html !== 'string') return false;

        container.innerHTML = html;
        return true;

    } catch (err) {
        console.warn(`[GoMeal] loadComponent error (${url}):`, err.message);
        return false;
    }
}

/**
 * Lấy element an toàn — trả về null thay vì throw nếu không tìm thấy.
 * @param {string} selector
 * @param {HTMLElement|Document} [root=document]
 * @returns {HTMLElement|null}
 */
function $(selector, root) {
    try {
        return (root || document).querySelector(selector) || null;
    } catch (_) {
        return null;
    }
}

/**
 * Gắn event listener an toàn — không crash nếu element null.
 * @param {string|HTMLElement} target  Selector string hoặc DOM element
 * @param {string}             event   Tên event
 * @param {Function}           handler Callback
 */
function onEvent(target, event, handler) {
    try {
        const el = typeof target === 'string' ? $(target) : target;
        if (!el) return;
        if (typeof handler !== 'function') return;
        el.addEventListener(event, handler);
    } catch (_) { /* không crash */ }
}

/**
 * Hiển thị element.
 * @param {string|HTMLElement} target
 */
function show(target) {
    try {
        const el = typeof target === 'string' ? $(target) : target;
        if (el) el.style.display = '';
    } catch (_) { /* nothing */ }
}

/**
 * Ẩn element.
 * @param {string|HTMLElement} target
 */
function hide(target) {
    try {
        const el = typeof target === 'string' ? $(target) : target;
        if (el) el.style.display = 'none';
    } catch (_) { /* nothing */ }
}

/**
 * Set text content an toàn.
 * @param {string|HTMLElement} target
 * @param {string}             text
 */
function setText(target, text) {
    try {
        const el = typeof target === 'string' ? $(target) : target;
        if (el) el.textContent = String(text ?? '');
    } catch (_) { /* nothing */ }
}

/* ----------------------------------------------------------------
   8. LOADING STATE HELPERS
   ---------------------------------------------------------------- */

/**
 * Hiển thị loading skeleton cho một container.
 * @param {string|HTMLElement} target
 * @param {number} [rows=3]   Số skeleton rows
 */
function showSkeleton(target, rows) {
    try {
        const el = typeof target === 'string' ? $(target) : target;
        if (!el) return;
        const count   = (typeof rows === 'number' && rows > 0 && rows <= 20) ? rows : 3;
        let html = '';
        for (let i = 0; i < count; i++) {
            html += `<div class="skeleton" style="height:44px;margin-bottom:8px;border-radius:8px;"></div>`;
        }
        el.innerHTML = html;
    } catch (_) { /* nothing */ }
}

/**
 * Disable nút và hiển thị loading spinner.
 * @param {HTMLButtonElement} btn
 * @param {string} [loadingText='Đang xử lý...']
 */
function setButtonLoading(btn, loadingText) {
    try {
        if (!btn) return;
        btn.disabled = true;
        btn._originalHtml = btn.innerHTML;
        const text = (typeof loadingText === 'string') ? loadingText : 'Đang xử lý...';
        btn.innerHTML = `<span class="loading-spinner"></span><span>${_escapeHtml(text)}</span>`;
    } catch (_) { /* nothing */ }
}

/**
 * Khôi phục nút sau khi loading xong.
 * @param {HTMLButtonElement} btn
 */
function resetButton(btn) {
    try {
        if (!btn) return;
        btn.disabled = false;
        if (btn._originalHtml !== undefined) {
            btn.innerHTML = btn._originalHtml;
            delete btn._originalHtml;
        }
    } catch (_) { /* nothing */ }
}

/* ----------------------------------------------------------------
   9. ORDER STATUS HELPERS
   ---------------------------------------------------------------- */

/**
 * Trả về badge HTML cho trạng thái đơn hàng.
 * @param {string} status
 * @returns {string}  HTML string
 */
function getOrderStatusBadge(status) {
    try {
        const map = {
            'pending':    { label: 'Chờ xác nhận', cls: 'badge-pending' },
            'processing': { label: 'Đang làm',     cls: 'badge-processing' },
            'completed':  { label: 'Hoàn thành',   cls: 'badge-completed' },
            'cancelled':  { label: 'Đã hủy',       cls: 'badge-cancelled' },
        };
        const s = (status && map[status]) ? map[status] : { label: status || '—', cls: 'badge-gray' };
        return `<span class="badge ${_escapeHtml(s.cls)}">${_escapeHtml(s.label)}</span>`;
    } catch (_) {
        return `<span class="badge badge-gray">${_escapeHtml(String(status || '—'))}</span>`;
    }
}

/**
 * Trả về badge HTML cho trạng thái bàn.
 * @param {string} status
 * @returns {string}
 */
function getTableStatusBadge(status) {
    try {
        const map = {
            'available': { label: 'Trống',       cls: 'badge-success' },
            'occupied':  { label: 'Có khách',    cls: 'badge-error' },
            'cleaning':  { label: 'Đang dọn',    cls: 'badge-info' },
        };
        const s = (status && map[status]) ? map[status] : { label: status || '—', cls: 'badge-gray' };
        return `<span class="badge ${_escapeHtml(s.cls)}">${_escapeHtml(s.label)}</span>`;
    } catch (_) {
        return `<span class="badge badge-gray">${_escapeHtml(String(status || '—'))}</span>`;
    }
}

/* ----------------------------------------------------------------
   10. DEBOUNCE — dùng cho search input
   ---------------------------------------------------------------- */

/**
 * Debounce function — trả về function đã debounce.
 * Không có đệ quy, không có vòng lặp vô hạn.
 *
 * @param {Function} fn
 * @param {number}   delay  ms
 * @returns {Function}
 */
function debounce(fn, delay) {
    let timerId = null;
    return function debounced(...args) {
        try {
            if (timerId !== null) {
                clearTimeout(timerId);
                timerId = null;
            }
            timerId = setTimeout(function runFn() {
                timerId = null;
                try { fn.apply(this, args); } catch (e) {
                    console.warn('[GoMeal] debounce callback error:', e.message);
                }
            }.bind(this), typeof delay === 'number' ? delay : 300);
        } catch (_) { /* nothing */ }
    };
}

/* ----------------------------------------------------------------
   11. MODAL HELPERS
   ---------------------------------------------------------------- */

/**
 * Mở modal — thêm class 'active'.
 * @param {string} modalId
 */
function openModal(modalId) {
    try {
        const overlay = document.getElementById(modalId);
        if (overlay) {
            overlay.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    } catch (_) { /* nothing */ }
}

/**
 * Đóng modal — bỏ class 'active'.
 * @param {string} modalId
 */
function closeModal(modalId) {
    try {
        const overlay = document.getElementById(modalId);
        if (overlay) {
            overlay.classList.remove('active');
            document.body.style.overflow = '';
        }
    } catch (_) { /* nothing */ }
}

/**
 * Đóng modal khi click vào overlay (không phải modal content).
 * Gọi 1 lần trong DOMContentLoaded.
 */
function initModalOverlayClose() {
    try {
        document.addEventListener('click', function handleOverlayClick(e) {
            try {
                if (e.target && e.target.classList.contains('modal-overlay')) {
                    e.target.classList.remove('active');
                    document.body.style.overflow = '';
                }
            } catch (_) { /* nothing */ }
        });
    } catch (_) { /* nothing */ }
}

/* ----------------------------------------------------------------
   12. CONFIRM DIALOG — thay alert/confirm native
   ---------------------------------------------------------------- */

/**
 * Hiển thị dialog xác nhận với Promise.
 * Dùng thay cho window.confirm() (bị block trên một số browser).
 *
 * @param {string} message
 * @param {string} [confirmText='Xác nhận']
 * @param {'danger'|'primary'} [type='danger']
 * @returns {Promise<boolean>}
 */
function showConfirm(message, confirmText, type) {
    return new Promise(function confirmPromise(resolve) {
        try {
            const safeMsg         = typeof message === 'string' ? message : 'Bạn có chắc chắn không?';
            const safeConfirmText = typeof confirmText === 'string' ? confirmText : 'Xác nhận';
            const btnClass        = type === 'primary' ? 'btn-primary-admin' : 'btn-danger';

            // Tạo overlay
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay active';
            overlay.style.zIndex = '9999';

            overlay.innerHTML = `
                <div class="modal" style="max-width:400px">
                    <div class="modal-body" style="padding:2rem;text-align:center">
                        <div style="
                            width:56px;height:56px;border-radius:50%;
                            background:var(--color-error-light);
                            display:flex;align-items:center;justify-content:center;
                            margin:0 auto 1rem;font-size:1.5rem;color:var(--color-error)
                        ">
                            <i class="fas fa-triangle-exclamation"></i>
                        </div>
                        <p style="font-size:0.9375rem;color:var(--color-gray-700);line-height:1.6;font-weight:500">
                            ${_escapeHtml(safeMsg)}
                        </p>
                    </div>
                    <div class="modal-footer" style="justify-content:center;gap:0.75rem">
                        <button class="btn btn-secondary" id="_confirmCancel">Hủy</button>
                        <button class="btn ${_escapeHtml(btnClass)}" id="_confirmOk">
                            ${_escapeHtml(safeConfirmText)}
                        </button>
                    </div>
                </div>
            `;

            // Handler: OK
            function handleOk() {
                cleanup();
                resolve(true);
            }

            // Handler: Cancel / overlay click
            function handleCancel(e) {
                if (!e || e.target === overlay || e.currentTarget.id === '_confirmCancel') {
                    cleanup();
                    resolve(false);
                }
            }

            // Cleanup: remove overlay và listeners
            function cleanup() {
                try {
                    const okBtn     = overlay.querySelector('#_confirmOk');
                    const cancelBtn = overlay.querySelector('#_confirmCancel');
                    if (okBtn)     okBtn.removeEventListener('click', handleOk);
                    if (cancelBtn) cancelBtn.removeEventListener('click', handleCancel);
                    overlay.removeEventListener('click', handleCancel);
                    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                    document.body.style.overflow = '';
                } catch (_) { /* nothing */ }
            }

            const okBtn     = overlay.querySelector('#_confirmOk');
            const cancelBtn = overlay.querySelector('#_confirmCancel');

            if (okBtn)     okBtn.addEventListener('click', handleOk);
            if (cancelBtn) cancelBtn.addEventListener('click', handleCancel);
            overlay.addEventListener('click', handleCancel);

            if (document.body) {
                document.body.appendChild(overlay);
                document.body.style.overflow = 'hidden';
            } else {
                // DOM chưa sẵn sàng — fallback
                resolve(false);
            }

        } catch (_) {
            resolve(false);
        }
    });
}

/* ----------------------------------------------------------------
   13. DOMContentLoaded — Entry point an toàn
   ---------------------------------------------------------------- */

document.addEventListener('DOMContentLoaded', function onDomReady() {
    // Wrap toàn bộ logic trong try/catch lớn
    // Nếu một bước fail, bước sau vẫn chạy

    // ── 1. Auth check ──
    try {
        checkAuth();
    } catch (e) {
        console.warn('[GoMeal] DOMContentLoaded: checkAuth fail (bỏ qua):', e.message);
    }

    // ── 2. Apply settings (async, không block) ──
    // Dùng .catch() thay vì await để không block DOMContentLoaded
    applyGlobalSettings().catch(function settingsFail(e) {
        console.warn('[GoMeal] DOMContentLoaded: applyGlobalSettings fail (bỏ qua):', e.message);
    });

    // ── 3. Init modal overlay close ──
    try {
        initModalOverlayClose();
    } catch (e) {
        console.warn('[GoMeal] DOMContentLoaded: initModalOverlayClose fail (bỏ qua):', e.message);
    }
});

/* ----------------------------------------------------------------
   14. GLOBAL EXPORTS
   Expose ra window để các file JS khác dùng được
   ---------------------------------------------------------------- */
window.GoMeal = {
    // Auth
    getToken,
    getUserRole,
    getGuestToken,
    getAuthHeader,
    clearSession,
    checkAuth,
    logout,

    // Fetch
    safeFetch,

    // Settings
    applyGlobalSettings,

    // Toast
    showToast,

    // Format
    formatCurrency,
    formatDate,
    formatDateTime,
    timeAgo,

    // DOM
    loadComponent,
    $,
    onEvent,
    show,
    hide,
    setText,

    // Loading
    showSkeleton,
    setButtonLoading,
    resetButton,

    // Status badges
    getOrderStatusBadge,
    getTableStatusBadge,

    // Utils
    debounce,

    // Modal
    openModal,
    closeModal,
    showConfirm,

    // Constants
    CONSTANTS: GOMEAL,
};