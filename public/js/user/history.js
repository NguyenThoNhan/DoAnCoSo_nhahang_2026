/* ================================================================
   GOMEAL — HISTORY.JS
   File: public/js/user/history.js

   Trang Lịch sử đơn hàng — views/user/history.html
   Yêu cầu: authToken (layout.js đã guard, redirect login nếu thiếu)

   Chức năng:
     1.  loadOrders()        — GET /api/user/order-history  (+ Bearer authToken)
     2.  renderSummaryStrip()— 4 stat cards: tổng đơn, hoàn thành, đang xử lý, tổng chi
     3.  renderTabs()        — Cập nhật count badges trên từng tab
     4.  filterOrders()      — Filter theo status tab + search keyword
     5.  renderOrderList()   — Render danh sách order cards với badges màu
     6.  openDetailModal()   — Modal chi tiết: chips meta + item rows + summary
     7.  closeModal()        — Đóng modal
     8.  initTabs()          — Bind tab click events
     9.  initSearch()        — Debounce search, sync topbar proxy
     10. initRefreshBtn()    — Nút làm mới với spin animation
     11. initPagination()    — Phân trang (10 orders/page)
     12. highlightLastOrder()— Highlight đơn vừa đặt (từ localStorage.lastOrderId)
     13. showToast()         — Inline toast

   API dùng (đúng theo user.routes.js):
     GET /api/user/order-history  → verifyToken + isCustomer
     Authorization: Bearer <authToken>

   Response shape (Order.findByUserId):
     [ { id, user_id, table_id, promo_id, total_amount, discount_amount,
         status, created_at, table_number }, ... ]

   Status values: 'pending' | 'processing' | 'completed' | 'cancelled'

   NOTE: Không có API riêng để lấy order items — hiển thị summary only trong modal.
         Items được đọc từ localStorage 'localCart' snapshot nếu có.
   ================================================================ */

'use strict';

/* ================================================================
   0. STATE
   ================================================================ */
const _hs = {
    orders:       [],     // raw từ API
    filtered:     [],     // sau khi filter tab + search
    activeStatus: 'all',
    keyword:      '',
    currentPage:  1,
    pageSize:     10,
    searchTimer:  null,
};

const STATUS_CONFIG = {
    pending:    { label: 'Chờ xử lý',  badgeClass: 'pending',    icon: 'fa-clock',              color: '#D97706' },
    processing: { label: 'Đang làm',   badgeClass: 'processing', icon: 'fa-fire-burner',        color: '#2563EB' },
    completed:  { label: 'Hoàn thành', badgeClass: 'completed',  icon: 'fa-circle-check',       color: '#059669' },
    cancelled:  { label: 'Đã hủy',     badgeClass: 'cancelled',  icon: 'fa-circle-xmark',       color: '#DC2626' },
};


/* ================================================================
   1. ENTRY POINT
   ================================================================ */
document.addEventListener('DOMContentLoaded', function historyInit() {
    try {
        initTopbarSync();
        initTabs();
        initSearch();
        initRefreshBtn();
        initModalClose();

        loadOrders();

    } catch (err) {
        console.error('[History] Init error:', err.message);
    }
});


/* ================================================================
   2. LOAD ORDERS — GET /api/user/order-history
      Dùng GoMeal.safeFetch để tự gắn Authorization header
   ================================================================ */
async function loadOrders() {
    try {
        _setListLoading(true);

        const authToken  = GoMeal.getToken();
        const guestToken = GoMeal.getGuestToken ? GoMeal.getGuestToken() : null;
        const lastOrderId = _lsGet('lastOrderId');

        // ── GUEST: không có authToken, chỉ có guestToken ──
        // Hiển thị đơn vừa đặt theo lastOrderId thay vì toàn bộ lịch sử
        if (!authToken && (guestToken || lastOrderId)) {
            await _loadGuestLastOrder(lastOrderId, guestToken);
            return;
        }

        const result = await GoMeal.safeFetch('/api/user/order-history');

        if (!result.ok) {
            if (result.status === 401 || result.status === 403) {
                // Không có authToken và không có guestToken → hướng dẫn đăng nhập
                _renderGuestPrompt();
            } else {
                _renderError('Không thể tải lịch sử đơn hàng. Vui lòng thử lại.');
            }
            return;
        }

        const orders = Array.isArray(result.data) ? result.data : [];
        _hs.orders = orders;

        renderSummaryStrip(orders);
        updateTabCounts(orders);
        filterAndRender();
        highlightLastOrder();

    } catch (err) {
        console.error('[History] loadOrders:', err.message);
        _renderError('Lỗi kết nối. Vui lòng thử lại.');
    } finally {
        _setListLoading(false);
    }
}

/* ================================================================
   2b. LOAD GUEST LAST ORDER — hiển thị đơn vừa đặt cho guest
   ================================================================ */
async function _loadGuestLastOrder(orderId, guestToken) {
    try {
        if (!orderId) {
            _renderGuestPrompt();
            return;
        }

        const token = guestToken || GoMeal.getToken();
        const res = await fetch('/api/user/order/' + orderId, {
            headers: { 'Authorization': 'Bearer ' + token }
        });

        if (!res.ok) {
            _renderGuestPrompt();
            return;
        }

        const order = await res.json();

        // Hiện banner thông báo guest
        const list = document.getElementById('hsOrderList');
        if (!list) return;

        const fmt = function(n) {
            return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n || 0);
        };
        const statusMap = {
            pending:    { label: 'Chờ xử lý',   color: '#F59E0B' },
            processing: { label: 'Đang làm',     color: '#3B82F6' },
            ready:      { label: 'Sẵn sàng',     color: '#8B5CF6' },
            completed:  { label: 'Hoàn thành',   color: '#10B981' },
            cancelled:  { label: 'Đã huỷ',       color: '#EF4444' },
        };
        const s = statusMap[order.status] || { label: order.status, color: '#6B7280' };

        const itemsHtml = Array.isArray(order.items) && order.items.length
            ? order.items.map(function(it) {
                return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #F3F4F6;font-size:.85rem">'
                    + '<span>' + (it.quantity > 1 ? '<b>' + it.quantity + 'x</b> ' : '') + _esc(it.item_name) + '</span>'
                    + '<span style="color:#111;font-weight:700">' + fmt(it.price_at_order * it.quantity) + '</span>'
                    + '</div>';
              }).join('')
            : '<div style="color:#9CA3AF;font-size:.82rem;padding:8px 0">Không có thông tin món</div>';

        list.innerHTML = `
            <div style="background:#FFF7ED;border:1.5px solid #FED7AA;border-radius:16px;padding:20px;margin-bottom:20px;display:flex;align-items:flex-start;gap:12px">
                <i class="fas fa-circle-info" style="color:#F97316;margin-top:2px;flex-shrink:0"></i>
                <div style="font-size:.85rem;color:#92400E;line-height:1.5">
                    Bạn đang xem với tư cách <b>Khách</b>.
                    <a href="/views/auth/login.html" style="color:#F97316;font-weight:700;text-decoration:underline">Đăng nhập</a>
                    để xem toàn bộ lịch sử đơn hàng.
                </div>
            </div>

            <div style="background:#fff;border:1.5px solid #E5E7EB;border-radius:20px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.06)">
                <!-- Header -->
                <div style="padding:16px 20px;border-bottom:1px solid #F3F4F6;display:flex;align-items:center;justify-content:space-between">
                    <div>
                        <div style="font-weight:800;color:#111;font-size:1rem">Đơn hàng #${order.id}</div>
                        <div style="font-size:.75rem;color:#9CA3AF;margin-top:2px">
                            ${order.table_number ? 'Bàn ' + order.table_number : ''}
                            · ${order.order_date ? new Date(order.order_date).toLocaleString('vi-VN') : ''}
                        </div>
                    </div>
                    <span style="background:${s.color}22;color:${s.color};font-size:.75rem;font-weight:700;padding:4px 12px;border-radius:99px">
                        ${s.label}
                    </span>
                </div>

                <!-- Items -->
                <div style="padding:12px 20px">
                    <div style="font-size:.7rem;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">
                        Món đã đặt
                    </div>
                    ${itemsHtml}
                </div>

                <!-- Total -->
                <div style="padding:12px 20px;border-top:1px solid #F3F4F6;background:#F9FAFB;display:flex;justify-content:space-between;align-items:center">
                    <span style="font-size:.85rem;color:#6B7280">Tổng tiền</span>
                    <span style="font-size:1.1rem;font-weight:900;color:#111">${fmt(order.total_amount)}</span>
                </div>
            </div>
        `;

    } catch (err) {
        console.error('[History] _loadGuestLastOrder:', err.message);
        _renderGuestPrompt();
    } finally {
        _setListLoading(false);
    }
}

/* ================================================================
   2c. GUEST PROMPT — hướng dẫn đăng nhập khi không có token
   ================================================================ */
function _renderGuestPrompt() {
    const list = document.getElementById('hsOrderList');
    if (!list) return;
    list.innerHTML = `
        <div class="hs-empty">
            <div class="hs-empty-illustration">🔐</div>
            <h3 class="hs-empty-title">Đăng nhập để xem lịch sử</h3>
            <p class="hs-empty-sub">Bạn cần đăng nhập để xem toàn bộ lịch sử đơn hàng.</p>
            <a href="/views/auth/login.html" class="hs-empty-cta">
                <i class="fas fa-right-to-bracket"></i> Đăng nhập ngay
            </a>
        </div>
    `;
}


/* ================================================================
   3. SUMMARY STRIP — 4 stat cards
   ================================================================ */
function renderSummaryStrip(orders) {
    try {
        const strip = document.getElementById('hsSummaryStrip');
        if (!strip) return;

        const total     = orders.length;
        const completed = orders.filter(function(o) { return o.status === 'completed'; }).length;
        const pending   = orders.filter(function(o) { return o.status === 'pending' || o.status === 'processing'; }).length;
        const totalSpent = orders
            .filter(function(o) { return o.status !== 'cancelled'; })
            .reduce(function(sum, o) { return sum + Number(o.total_amount || 0); }, 0);

        strip.innerHTML = `
            <div class="hs-stat-card">
                <div class="hs-stat-icon orange">
                    <i class="fas fa-receipt"></i>
                </div>
                <div class="hs-stat-body">
                    <div class="hs-stat-val">${total}</div>
                    <div class="hs-stat-label">Tổng đơn hàng</div>
                </div>
            </div>
            <div class="hs-stat-card">
                <div class="hs-stat-icon green">
                    <i class="fas fa-circle-check"></i>
                </div>
                <div class="hs-stat-body">
                    <div class="hs-stat-val">${completed}</div>
                    <div class="hs-stat-label">Đã hoàn thành</div>
                </div>
            </div>
            <div class="hs-stat-card">
                <div class="hs-stat-icon amber">
                    <i class="fas fa-fire-burner"></i>
                </div>
                <div class="hs-stat-body">
                    <div class="hs-stat-val">${pending}</div>
                    <div class="hs-stat-label">Đang xử lý</div>
                </div>
            </div>
            <div class="hs-stat-card">
                <div class="hs-stat-icon violet">
                    <i class="fas fa-coins"></i>
                </div>
                <div class="hs-stat-body">
                    <div class="hs-stat-val">${_fmtCompact(totalSpent)}</div>
                    <div class="hs-stat-label">Tổng chi tiêu</div>
                </div>
            </div>
        `;
    } catch (err) {
        console.warn('[History] renderSummaryStrip:', err.message);
    }
}


/* ================================================================
   4. TAB COUNT BADGES
   ================================================================ */
function updateTabCounts(orders) {
    try {
        const countAll        = orders.length;
        const countPending    = orders.filter(function(o){ return o.status === 'pending'; }).length;
        const countProcessing = orders.filter(function(o){ return o.status === 'processing'; }).length;
        const countCompleted  = orders.filter(function(o){ return o.status === 'completed'; }).length;
        const countCancelled  = orders.filter(function(o){ return o.status === 'cancelled'; }).length;

        _setText('hsCountAll',        countAll);
        _setText('hsCountPending',    countPending);
        _setText('hsCountProcessing', countProcessing);
        _setText('hsCountCompleted',  countCompleted);
        _setText('hsCountCancelled',  countCancelled);
    } catch (err) {
        console.warn('[History] updateTabCounts:', err.message);
    }
}


/* ================================================================
   5. FILTER + RENDER
   ================================================================ */
function filterAndRender() {
    try {
        let orders = _hs.orders.slice();

        // Filter by status
        if (_hs.activeStatus !== 'all') {
            orders = orders.filter(function(o) {
                return o.status === _hs.activeStatus;
            });
        }

        // Filter by search keyword (order id or table number)
        if (_hs.keyword) {
            const kw = _hs.keyword.toLowerCase();
            orders = orders.filter(function(o) {
                return String(o.id).includes(kw) ||
                       String(o.table_number || '').includes(kw) ||
                       String(o.status || '').toLowerCase().includes(kw);
            });
        }

        _hs.filtered = orders;
        _hs.currentPage = 1;

        renderOrderList();
        renderPagination();

    } catch (err) {
        console.warn('[History] filterAndRender:', err.message);
    }
}


/* ================================================================
   6. RENDER ORDER LIST (current page)
   ================================================================ */
function renderOrderList() {
    try {
        const list = document.getElementById('hsOrderList');
        if (!list) return;

        const start  = (_hs.currentPage - 1) * _hs.pageSize;
        const page   = _hs.filtered.slice(start, start + _hs.pageSize);

        if (_hs.filtered.length === 0) {
            list.innerHTML = _emptyHTML();
            return;
        }

        list.innerHTML = page.map(function(order, idx) {
            return _orderCardHTML(order, start + idx);
        }).join('');

        // Bind detail buttons
        list.querySelectorAll('.hs-detail-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const orderId = parseInt(this.getAttribute('data-order-id'), 10);
                const order   = _hs.orders.find(function(o) { return o.id === orderId; });
                if (order) openDetailModal(order);
            });
        });

        // Bind card click → open modal too
        list.querySelectorAll('.hs-order-card').forEach(function(card) {
            card.addEventListener('click', function(e) {
                if (e.target.closest('.hs-detail-btn') || e.target.closest('.hs-reorder-btn')) return;
                const orderId = parseInt(this.getAttribute('data-order-id'), 10);
                const order   = _hs.orders.find(function(o) { return o.id === orderId; });
                if (order) openDetailModal(order);
            });
        });

        // Bind reorder buttons
        list.querySelectorAll('.hs-reorder-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                showToast('Đang chuyển tới thực đơn...', 'info');
                setTimeout(function() {
                    window.location.href = '/views/user/menu.html';
                }, 800);
            });
        });

    } catch (err) {
        console.warn('[History] renderOrderList:', err.message);
    }
}

function _orderCardHTML(order, idx) {
    const status    = order.status || 'pending';
    const cfg       = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
    const total     = Number(order.total_amount || 0);
    const discount  = Number(order.discount_amount || 0);
    const tableNum  = order.table_number ? 'Bàn ' + order.table_number : '—';
    const dateStr   = _fmtDate(order.created_at);
    const timeStr   = _fmtTime(order.created_at);
    const timeAgo   = _timeAgo(order.created_at);

    // Determine if this is the last order (highlight)
    const lastOrderId = _lsGet('lastOrderId');
    const isLast      = lastOrderId && String(order.id) === String(lastOrderId);
    const extraStyle  = isLast ? 'border-color:#FF6B35;box-shadow:0 0 0 3px rgba(255,107,53,.15);' : '';

    return `
        <div class="hs-order-card status-${status}"
             data-order-id="${order.id}"
             style="cursor:pointer;${extraStyle}"
             role="button"
             tabindex="0"
             aria-label="Đơn hàng #${order.id}">

            <div class="hs-card-body">
                <!-- Order number circle -->
                <div class="hs-order-num-circle">
                    <span class="hs-order-num-label">Đơn</span>
                    <span class="hs-order-num-val">#${order.id}</span>
                </div>

                <!-- Main info -->
                <div class="hs-card-info">
                    <div class="hs-card-top">
                        <span class="hs-card-title">Đơn hàng #${order.id}${isLast ? ' <span style="font-size:.62rem;color:#FF6B35;font-weight:700;background:#FFF3EE;padding:2px 8px;border-radius:99px;margin-left:6px">Mới nhất</span>' : ''}</span>
                        <span class="hs-badge ${cfg.badgeClass}">
                            <i class="fas ${cfg.icon}"></i>
                            ${cfg.label}
                        </span>
                    </div>

                    <div class="hs-card-meta">
                        <div class="hs-meta-item">
                            <span class="hs-meta-label">Tổng tiền</span>
                            <span class="hs-meta-val price">
                                ${_fmtPrice(total)}
                            </span>
                        </div>
                        <div class="hs-meta-item">
                            <span class="hs-meta-label">Số bàn</span>
                            <span class="hs-meta-val">
                                <i class="fas fa-chair"></i>
                                ${_esc(tableNum)}
                            </span>
                        </div>
                        <div class="hs-meta-item">
                            <span class="hs-meta-label">Ngày đặt</span>
                            <span class="hs-meta-val">
                                <i class="fas fa-calendar-days"></i>
                                ${_esc(dateStr)}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Actions -->
            <div class="hs-card-actions">
                <button class="hs-detail-btn" data-order-id="${order.id}">
                    <i class="fas fa-eye"></i>
                    Xem chi tiết
                </button>
                <button class="hs-reorder-btn" data-order-id="${order.id}">
                    <i class="fas fa-rotate-right"></i>
                    Đặt lại
                </button>
                <span class="hs-card-time">
                    <i class="fas fa-clock"></i>
                    ${_esc(timeStr)} · ${_esc(timeAgo)}
                </span>
            </div>

        </div>
    `;
}

function _emptyHTML() {
    const isFiltered = _hs.activeStatus !== 'all' || _hs.keyword;
    return `
        <div class="hs-empty">
            <div class="hs-empty-illustration">
                ${isFiltered ? '🔍' : '🍽️'}
            </div>
            <h3 class="hs-empty-title">
                ${isFiltered ? 'Không tìm thấy đơn hàng' : 'Chưa có đơn hàng nào'}
            </h3>
            <p class="hs-empty-sub">
                ${isFiltered
                    ? 'Thử thay đổi bộ lọc hoặc từ khoá tìm kiếm.'
                    : 'Đặt món ngay để bắt đầu tích điểm thành viên!'}
            </p>
            ${!isFiltered ? `
            <a href="/views/user/menu.html" class="hs-empty-cta">
                <i class="fas fa-utensils"></i>
                Đặt món ngay
            </a>` : ''}
        </div>
    `;
}


/* ================================================================
   7. PAGINATION
   ================================================================ */
function renderPagination() {
    try {
        const wrap = document.getElementById('hsPagination');
        if (!wrap) return;

        const totalPages = Math.ceil(_hs.filtered.length / _hs.pageSize);

        if (totalPages <= 1) {
            wrap.style.display = 'none';
            return;
        }

        wrap.style.display = 'flex';

        let html = '';

        // Prev button
        html += `
            <button class="hs-page-btn" id="hsPrevBtn" ${_hs.currentPage <= 1 ? 'disabled' : ''} aria-label="Trang trước">
                <i class="fas fa-chevron-left"></i>
            </button>
        `;

        // Page buttons — hiện tối đa 5 pages xung quanh current
        const startPage = Math.max(1, _hs.currentPage - 2);
        const endPage   = Math.min(totalPages, startPage + 4);

        if (startPage > 1) {
            html += `<button class="hs-page-btn" data-page="1">1</button>`;
            if (startPage > 2) html += `<span style="color:#C4BAB3;padding:0 4px">…</span>`;
        }

        for (let p = startPage; p <= endPage; p++) {
            html += `
                <button class="hs-page-btn ${p === _hs.currentPage ? 'active' : ''}" data-page="${p}">${p}</button>
            `;
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) html += `<span style="color:#C4BAB3;padding:0 4px">…</span>`;
            html += `<button class="hs-page-btn" data-page="${totalPages}">${totalPages}</button>`;
        }

        // Next button
        html += `
            <button class="hs-page-btn" id="hsNextBtn" ${_hs.currentPage >= totalPages ? 'disabled' : ''} aria-label="Trang sau">
                <i class="fas fa-chevron-right"></i>
            </button>
        `;

        wrap.innerHTML = html;

        // Bind clicks
        wrap.querySelectorAll('.hs-page-btn[data-page]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                const page = parseInt(this.getAttribute('data-page'), 10);
                if (!isNaN(page)) _goToPage(page);
            });
        });

        const prevBtn = document.getElementById('hsPrevBtn');
        const nextBtn = document.getElementById('hsNextBtn');
        if (prevBtn) prevBtn.addEventListener('click', function() { _goToPage(_hs.currentPage - 1); });
        if (nextBtn) nextBtn.addEventListener('click', function() { _goToPage(_hs.currentPage + 1); });

    } catch (err) {
        console.warn('[History] renderPagination:', err.message);
    }
}

function _goToPage(page) {
    try {
        const totalPages = Math.ceil(_hs.filtered.length / _hs.pageSize);
        if (page < 1 || page > totalPages) return;
        _hs.currentPage = page;
        renderOrderList();
        renderPagination();
        // Scroll lên đầu list
        try {
            const list = document.getElementById('hsOrderList');
            if (list) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch(_) {}
    } catch (err) {
        console.warn('[History] _goToPage:', err.message);
    }
}


/* ================================================================
   8. ORDER DETAIL MODAL
      API không có route lấy items riêng → hiển thị thông tin order
      + đọc localCart snapshot nếu có (đơn vừa đặt)
   ================================================================ */
function openDetailModal(order) {
    try {
        const status   = order.status || 'pending';
        const cfg      = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
        const total    = Number(order.total_amount || 0);
        const discount = Number(order.discount_amount || 0);
        const subtotal = total + discount;
        const tableNum = order.table_number ? 'Bàn ' + order.table_number : '—';
        const dateStr  = _fmtDate(order.created_at) + ' · ' + _fmtTime(order.created_at);

        // Title
        _setText('hsModalTitle', 'Đơn hàng #' + order.id);

        // Chips
        const chipsEl = document.getElementById('hsModalChips');
        if (chipsEl) {
            chipsEl.innerHTML = `
                <span class="hs-modal-chip">
                    <i class="fas fa-calendar-days"></i>
                    ${_esc(dateStr)}
                </span>
                <span class="hs-modal-chip">
                    <i class="fas fa-chair"></i>
                    ${_esc(tableNum)}
                </span>
                <span class="hs-badge ${cfg.badgeClass}" style="font-size:.62rem">
                    <i class="fas ${cfg.icon}"></i>
                    ${cfg.label}
                </span>
            `;
        }

        // Items — thử đọc từ localCart snapshot (key localCart) nếu đây là đơn cuối cùng
        const lastOrderId = _lsGet('lastOrderId');
        let items = [];

        if (lastOrderId && String(order.id) === String(lastOrderId)) {
            try {
                const raw = localStorage.getItem('localCart');
                if (raw) {
                    const cart = JSON.parse(raw);
                    if (Array.isArray(cart) && cart.length > 0) {
                        items = cart;
                    }
                }
            } catch (_) { items = []; }
        }

        // Render items
        const itemsEl = document.getElementById('hsModalItems');
        if (itemsEl) {
            if (items.length > 0) {
                itemsEl.innerHTML = items.map(function(item, idx) {
                    const name  = item.foodName || item.name || 'Món ăn';
                    const price = Number(item.price || item.priceAtOrder || 0);
                    const qty   = Number(item.quantity || 1);
                    return `
                        <div class="hs-modal-item">
                            <div class="hs-mi-idx">${idx + 1}</div>
                            <div class="hs-mi-info">
                                <p class="hs-mi-name">${_esc(name)}</p>
                                <p class="hs-mi-unit">${_fmtPrice(price)} / phần</p>
                            </div>
                            <span class="hs-mi-qty">x${qty}</span>
                            <span class="hs-mi-total">${_fmtPrice(price * qty)}</span>
                        </div>
                    `;
                }).join('');
            } else {
                // Không có items → hiện thông báo
                itemsEl.innerHTML = `
                    <div class="hs-modal-no-items">
                        <i class="fas fa-bowl-food"></i>
                        <p>Chi tiết món ăn không khả dụng</p>
                        <p style="font-size:.72rem;color:#C4BAB3;margin-top:4px">Tổng tiền đơn đã được ghi nhận bên dưới</p>
                    </div>
                `;
            }
        }

        // Summary
        _setText('hsModalSubtotal', _fmtPrice(subtotal > 0 ? subtotal : total));
        _setText('hsModalTotal',    _fmtPrice(total));

        const discRow = document.getElementById('hsModalDiscountRow');
        if (discRow) {
            if (discount > 0) {
                discRow.style.display = 'flex';
                _setText('hsModalDiscount', '−' + _fmtPrice(discount));
            } else {
                discRow.style.display = 'none';
            }
        }

        // Show overlay
        const overlay = document.getElementById('hsModalOverlay');
        if (overlay) {
            overlay.classList.add('show');
            document.body.style.overflow = 'hidden';
        }

    } catch (err) {
        console.warn('[History] openDetailModal:', err.message);
    }
}

function closeModal() {
    try {
        const overlay = document.getElementById('hsModalOverlay');
        if (overlay) overlay.classList.remove('show');
        document.body.style.overflow = '';
    } catch (_) {}
}


/* ================================================================
   9. INIT TABS
   ================================================================ */
function initTabs() {
    try {
        const tabs = document.getElementById('hsTabs');
        if (!tabs) return;

        tabs.querySelectorAll('.hs-tab').forEach(function(tab) {
            tab.addEventListener('click', function() {
                tabs.querySelectorAll('.hs-tab').forEach(function(t) { t.classList.remove('active'); });
                this.classList.add('active');
                _hs.activeStatus = this.getAttribute('data-status') || 'all';
                _hs.keyword = '';
                const inp = document.getElementById('hsSearchInp');
                const prx = document.getElementById('topbarSearchProxy');
                if (inp) inp.value = '';
                if (prx) prx.value = '';
                filterAndRender();
            });
        });

    } catch (err) {
        console.warn('[History] initTabs:', err.message);
    }
}


/* ================================================================
   10. INIT SEARCH — Debounce 300ms
   ================================================================ */
function initSearch() {
    try {
        const inp = document.getElementById('hsSearchInp');
        if (!inp) return;

        inp.addEventListener('input', function() {
            const val = this.value.trim();
            if (_hs.searchTimer) clearTimeout(_hs.searchTimer);
            _hs.searchTimer = setTimeout(function() {
                _hs.keyword = val;
                filterAndRender();
            }, 300);
        });

    } catch (err) {
        console.warn('[History] initSearch:', err.message);
    }
}


/* ================================================================
   11. TOPBAR SYNC — proxy search → main search
   ================================================================ */
function initTopbarSync() {
    try {
        const proxy = document.getElementById('topbarSearchProxy');
        const main  = document.getElementById('hsSearchInp');
        if (proxy && main) {
            proxy.addEventListener('input', function() {
                main.value = this.value;
                _hs.keyword = this.value.trim();
                if (_hs.searchTimer) clearTimeout(_hs.searchTimer);
                _hs.searchTimer = setTimeout(filterAndRender, 300);
            });
        }
    } catch (_) {}
}


/* ================================================================
   12. REFRESH BUTTON
   ================================================================ */
function initRefreshBtn() {
    try {
        const btn  = document.getElementById('refreshBtn');
        const icon = document.getElementById('refreshIcon');
        if (!btn) return;

        btn.addEventListener('click', async function() {
            try {
                if (icon) {
                    icon.style.transition = 'transform .6s ease';
                    icon.style.transform  = 'rotate(360deg)';
                    setTimeout(function() {
                        try { icon.style.transform = 'rotate(0deg)'; icon.style.transition = ''; } catch(_) {}
                    }, 650);
                }
                await loadOrders();
                showToast('Đã cập nhật lịch sử đơn hàng', 'success');
            } catch (_) {}
        });

    } catch (err) {
        console.warn('[History] initRefreshBtn:', err.message);
    }
}


/* ================================================================
   13. MODAL CLOSE
   ================================================================ */
function initModalClose() {
    try {
        const closeBtn = document.getElementById('hsModalClose');
        const overlay  = document.getElementById('hsModalOverlay');

        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (overlay) {
            overlay.addEventListener('click', function(e) {
                if (e.target === overlay) closeModal();
            });
        }

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') closeModal();
        });
    } catch (_) {}
}


/* ================================================================
   14. HIGHLIGHT LAST ORDER (từ localStorage.lastOrderId)
   ================================================================ */
function highlightLastOrder() {
    try {
        const lastOrderId = _lsGet('lastOrderId');
        if (!lastOrderId) return;

        const order = _hs.orders.find(function(o) { return String(o.id) === String(lastOrderId); });
        if (!order) return;

        // Nếu order không nằm trong filtered hiện tại → switch về All
        const inFiltered = _hs.filtered.find(function(o) { return String(o.id) === String(lastOrderId); });
        if (!inFiltered) {
            _hs.activeStatus = 'all';
            _hs.keyword = '';
            document.querySelectorAll('.hs-tab').forEach(function(t) { t.classList.remove('active'); });
            const allTab = document.querySelector('.hs-tab[data-status="all"]');
            if (allTab) allTab.classList.add('active');
            filterAndRender();
        }

        // Toast thông báo nếu vừa đặt
        showToast('Đơn hàng #' + lastOrderId + ' đã được ghi nhận! 🎉', 'success');

        // Xoá key sau khi đã highlight
        try { localStorage.removeItem('lastOrderId'); } catch (_) {}

    } catch (err) {
        console.warn('[History] highlightLastOrder:', err.message);
    }
}


/* ================================================================
   15. TOAST
   ================================================================ */
function showToast(msg, type) {
    try {
        const container = document.getElementById('hsToastContainer');
        if (!container) return;

        const iconMap = {
            success: 'fa-circle-check',
            error:   'fa-circle-xmark',
            warning: 'fa-triangle-exclamation',
            info:    'fa-circle-info',
        };
        const icon = iconMap[type] || 'fa-circle-info';

        const toast = document.createElement('div');
        toast.className = 'hs-toast ' + (type || 'info');
        toast.innerHTML = `<i class="fas ${icon} ${type || 'info'}"></i> ${_esc(msg)}`;

        container.appendChild(toast);

        setTimeout(function() {
            try {
                toast.style.opacity   = '0';
                toast.style.transform = 'translateX(14px)';
                toast.style.transition = 'all .25s ease';
                setTimeout(function() { try { toast.remove(); } catch(_) {} }, 260);
            } catch (_) {}
        }, 3200);

    } catch (_) {}
}


/* ================================================================
   16. LOADING STATE
   ================================================================ */
function _setListLoading(loading) {
    try {
        const list = document.getElementById('hsOrderList');
        if (!list) return;

        if (loading) {
            list.innerHTML = `
                <div class="hs-sk-card"><div class="hs-sk hs-sk-circle"></div><div class="hs-sk-lines"><div class="hs-sk hs-sk-l1"></div><div class="hs-sk hs-sk-l2"></div><div class="hs-sk hs-sk-l3"></div></div></div>
                <div class="hs-sk-card"><div class="hs-sk hs-sk-circle"></div><div class="hs-sk-lines"><div class="hs-sk hs-sk-l1"></div><div class="hs-sk hs-sk-l2"></div><div class="hs-sk hs-sk-l3"></div></div></div>
                <div class="hs-sk-card"><div class="hs-sk hs-sk-circle"></div><div class="hs-sk-lines"><div class="hs-sk hs-sk-l1"></div><div class="hs-sk hs-sk-l2"></div><div class="hs-sk hs-sk-l3"></div></div></div>
            `;
        }
    } catch (_) {}
}

function _renderError(msg) {
    try {
        const list = document.getElementById('hsOrderList');
        if (list) {
            list.innerHTML = `
                <div class="hs-empty">
                    <div class="hs-empty-illustration">⚠️</div>
                    <h3 class="hs-empty-title">Không thể tải dữ liệu</h3>
                    <p class="hs-empty-sub">${_esc(msg)}</p>
                    <button class="hs-empty-cta" onclick="loadOrders()">
                        <i class="fas fa-rotate-right"></i>
                        Thử lại
                    </button>
                </div>
            `;
        }
    } catch (_) {}
}


/* ================================================================
   17. UTILITIES
   ================================================================ */
function _fmtPrice(num) {
    try { return Number(num).toLocaleString('vi-VN') + '₫'; }
    catch(_) { return num + '₫'; }
}

function _fmtCompact(num) {
    try {
        if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M₫';
        if (num >= 1000)    return (num / 1000).toFixed(0) + 'K₫';
        return _fmtPrice(num);
    } catch(_) { return _fmtPrice(num); }
}

function _fmtDate(dateStr) {
    try {
        const d = new Date(dateStr);
        if (isNaN(d)) return '—';
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yy = d.getFullYear();
        return `${dd}/${mm}/${yy}`;
    } catch(_) { return '—'; }
}

function _fmtTime(dateStr) {
    try {
        const d = new Date(dateStr);
        if (isNaN(d)) return '—';
        const hh = String(d.getHours()).padStart(2, '0');
        const mi = String(d.getMinutes()).padStart(2, '0');
        return `${hh}:${mi}`;
    } catch(_) { return '—'; }
}

function _timeAgo(dateStr) {
    try {
        const now   = Date.now();
        const then  = new Date(dateStr).getTime();
        if (isNaN(then)) return '';
        const diff  = Math.max(0, now - then);
        const mins  = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days  = Math.floor(diff / 86400000);

        if (mins < 1)   return 'Vừa xong';
        if (mins < 60)  return `${mins} phút trước`;
        if (hours < 24) return `${hours} giờ trước`;
        if (days < 7)   return `${days} ngày trước`;
        return _fmtDate(dateStr);
    } catch(_) { return ''; }
}

function _esc(str) {
    try {
        return String(str || '')
            .replace(/&/g,'&amp;').replace(/</g,'&lt;')
            .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
            .replace(/'/g,'&#39;');
    } catch(_) { return ''; }
}

function _setText(id, text) {
    try {
        const el = document.getElementById(id);
        if (el) el.textContent = String(text);
    } catch(_) {}
}

function _lsGet(key) {
    try { return localStorage.getItem(key) || null; }
    catch(_) { return null; }
}


/* ================================================================
   18. EXPOSE PUBLIC
   ================================================================ */
window.HistoryPage = {
    loadOrders:      loadOrders,
    openDetailModal: openDetailModal,
    closeModal:      closeModal,
    filterAndRender: filterAndRender,
    showToast:       showToast,
};