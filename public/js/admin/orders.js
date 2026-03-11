/**
 * orders.js — Admin Orders Management
 * Sprint 3 / Phase 3
 *
 * ROUTES (confirmed in admin.routes.js):
 *   GET /api/admin/orders
 *     → [{id, created_at, completed_at, total_amount, discount_amount,
 *          status, note, table_number, table_status,
 *          customer_name, customer_phone, items:[]}]
 *   GET /api/admin/orders/:id
 *     → same shape + items[]
 *   PUT /api/admin/orders/:id/status
 *     body: { status: 'pending'|'processing'|'ready'|'completed'|'cancelled' }
 *   PUT /api/admin/orders/:id/complete-and-release
 *     → hoàn tất đơn + giải phóng bàn + cộng điểm + trừ tồn kho
 *
 * STATUS FLOW: pending → processing → ready → completed
 *              (có thể cancel từ pending hoặc processing)
 *
 * Lỗi đã biết tránh:
 *   - Dùng GoMeal.getAuthHeader() (không phải getAuthHeaders)
 *   - id="admin-sidebar-container" đã đặt đúng trong HTML
 *   - window.xxx expose cho inline onclick trong template literals
 */

'use strict';

/* ─────────────────────────────────────────
   CONFIG
───────────────────────────────────────── */
const API           = '/api/admin';
const AUTO_REFRESH  = 30_000;   // 30s polling
const DEBOUNCE_MS   = 260;

/* ─────────────────────────────────────────
   STATUS CONFIG
───────────────────────────────────────── */
const STATUS = {
    pending:    { label: 'Chờ xác nhận', emoji: '⏳', color: '#F59E0B', bg: '#FEF3C7', text: '#92400E' },
    processing: { label: 'Đang nấu',     emoji: '🍳', color: '#3B82F6', bg: '#DBEAFE', text: '#1D4ED8' },
    ready:      { label: 'Sẵn sàng',     emoji: '✅', color: '#8B5CF6', bg: '#EDE9FE', text: '#5B21B6' },
    completed:  { label: 'Hoàn thành',   emoji: '🎉', color: '#10B981', bg: '#D1FAE5', text: '#065F46' },
    cancelled:  { label: 'Đã huỷ',       emoji: '❌', color: '#EF4444', bg: '#FEE2E2', text: '#B91C1C' },
};

/* Next step in the flow (for action button) */
const NEXT_STATUS = {
    pending:    'processing',
    processing: 'ready',
    ready:      null,       // ready → use complete-and-release only
};

/* ─────────────────────────────────────────
   STATE
───────────────────────────────────────── */
let _orders       = [];         // full list from server
let _filtered     = [];         // after filter/search
let _viewMode     = 'kanban';   // 'kanban' | 'table'
let _filterStatus = 'all';      // status bar active filter
let _search       = '';
let _dateFilter   = '';
let _detailId     = null;       // order ID currently in modal
let _payReleaseId = null;       // order ID pending pay-release confirm
let _refreshTimer = null;
let _searchTimer  = null;

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */
function esc(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmt(n) {
    const num = Number(n) || 0;
    return num.toLocaleString('vi-VN') + '₫';
}

function fmtTime(iso) {
    if (!iso) return '--';
    const d = new Date(iso);
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        + ' ' + d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

function timeSince(iso) {
    if (!iso) return '';
    const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (diff < 60)   return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}p`;
    return `${Math.floor(diff / 3600)}h`;
}

function statusBadgeHtml(status) {
    const s = STATUS[status] || STATUS.pending;
    return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:99px;
        background:${s.bg};color:${s.text};font-size:0.65rem;font-weight:700;white-space:nowrap">
        ${s.emoji} ${esc(s.label)}</span>`;
}

/* ─────────────────────────────────────────
   TOAST
───────────────────────────────────────── */
function toast(msg, type = 'success') {
    const cfg = {
        success: { ico: 'circle-check',         color: '#10B981' },
        error:   { ico: 'triangle-exclamation', color: '#EF4444' },
        warning: { ico: 'triangle-exclamation', color: '#F59E0B' },
        info:    { ico: 'circle-info',           color: '#3B82F6' },
    };
    const { ico, color } = cfg[type] || cfg.info;
    if (!document.getElementById('_toastStyle')) {
        const s = document.createElement('style');
        s.id = '_toastStyle';
        s.textContent = '@keyframes toast-in{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}';
        document.head.appendChild(s);
    }
    const el = document.createElement('div');
    el.style.cssText = [
        'display:flex;align-items:center;gap:10px',
        'padding:12px 18px;border-radius:12px',
        'background:var(--color-white)',
        'box-shadow:0 8px 30px rgba(0,0,0,0.14)',
        `border-left:4px solid ${color}`,
        'font-family:var(--font-primary);font-size:14px',
        'color:var(--color-gray-800);max-width:380px',
        'pointer-events:all;animation:toast-in 0.3s ease',
    ].join(';');
    el.innerHTML = `
        <i class="fas fa-${esc(ico)}" style="color:${color};font-size:1rem;flex-shrink:0"></i>
        <span style="flex:1;line-height:1.4">${esc(msg)}</span>
        <button onclick="this.parentElement.remove()"
            style="background:none;border:none;cursor:pointer;color:var(--color-gray-400);font-size:0.8rem;padding:0">
            <i class="fas fa-xmark"></i></button>`;
    document.getElementById('toastContainer')?.appendChild(el);
    setTimeout(() => el?.remove(), 5000);
}

/* ─────────────────────────────────────────
   API FETCH
───────────────────────────────────────── */
async function apiFetch(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...GoMeal.getAuthHeader(),
        ...(options.headers || {}),
    };
    const res  = await fetch(`${API}${endpoint}`, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw Object.assign(
            new Error(data.message || `HTTP ${res.status}`),
            { status: res.status, data }
        );
    }
    return data;
}

/* ─────────────────────────────────────────
   LOAD DATA
───────────────────────────────────────── */
async function loadOrders(silent = false) {
    if (!silent) showSkeleton();
    try {
        _orders = await apiFetch('/orders') || [];
        updateStatusBar();
        applyFilter();
        if (!silent) stopRefreshAnim();
    } catch (err) {
        console.error('[Orders] Load error:', err);
        if (!silent) toast('Không tải được đơn hàng: ' + err.message, 'error');
        stopRefreshAnim();
    }
}

/* ─────────────────────────────────────────
   AUTO REFRESH
───────────────────────────────────────── */
function startAutoRefresh() {
    stopAutoRefresh();
    _refreshTimer = setInterval(() => loadOrders(true), AUTO_REFRESH);
    const label = document.getElementById('refreshLabel');
    if (label) label.textContent = 'Tự cập nhật 30s';
}

function stopAutoRefresh() {
    if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null; }
}

function stopRefreshAnim() {
    // Reset spinner on refresh button
    const btn = document.getElementById('btnRefresh');
    if (btn) btn.querySelector('i')?.classList.remove('fa-spin');
}

/* ─────────────────────────────────────────
   STATUS BAR — counts
───────────────────────────────────────── */
function updateStatusBar() {
    const counts = { all: _orders.length, pending: 0, processing: 0, ready: 0, completed: 0, cancelled: 0 };
    _orders.forEach(o => { if (counts[o.status] !== undefined) counts[o.status]++; });

    setText('sbAll',        counts.all);
    setText('sbPending',    counts.pending);
    setText('sbProcessing', counts.processing);
    setText('sbReady',      counts.ready);
    setText('sbCompleted',  counts.completed);
    setText('sbCancelled',  counts.cancelled);

    setText('kcBadgePending',    counts.pending);
    setText('kcBadgeProcessing', counts.processing);
    setText('kcBadgeReady',      counts.ready);
    setText('kcBadgeCompleted',  counts.completed);

    // Head count
    const hc = document.getElementById('headCount');
    if (hc) hc.textContent = `(${counts.all})`;
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(val);
}

/* ─────────────────────────────────────────
   FILTER + APPLY
───────────────────────────────────────── */
function applyFilter() {
    const searchLow = _search.toLowerCase();

    _filtered = _orders.filter(o => {
        // Status filter
        if (_filterStatus !== 'all' && o.status !== _filterStatus) return false;

        // Date filter
        if (_dateFilter) {
            const orderDate = new Date(o.created_at).toISOString().slice(0, 10);
            if (orderDate !== _dateFilter) return false;
        }

        // Search: id, table_number, customer_name
        if (searchLow) {
            const haystack = [
                String(o.id),
                String(o.table_number || ''),
                String(o.customer_name || ''),
                String(o.customer_phone || ''),
            ].join(' ').toLowerCase();
            if (!haystack.includes(searchLow)) return false;
        }

        return true;
    });

    // Show/hide clear filter button
    const clearBtn = document.getElementById('btnClearFilter');
    if (clearBtn) {
        clearBtn.style.display = (_search || _dateFilter || _filterStatus !== 'all') ? 'inline-flex' : 'none';
    }

    if (_viewMode === 'kanban') renderKanban();
    else                        renderTable();
}

/* ─────────────────────────────────────────
   RENDER: KANBAN
───────────────────────────────────────── */
function renderKanban() {
    const cols = {
        pending:    document.getElementById('colPending'),
        processing: document.getElementById('colProcessing'),
        ready:      document.getElementById('colReady'),
        completed:  document.getElementById('colCompleted'),
    };

    // Clear columns
    Object.values(cols).forEach(c => { if (c) c.innerHTML = ''; });

    // When filtering by a non-kanban status (cancelled), show table fallback message
    const kanbanStatuses = ['pending', 'processing', 'ready', 'completed'];

    let placed = 0;
    _filtered.forEach(order => {
        if (!cols[order.status]) return;    // cancelled → not shown in kanban
        cols[order.status].insertAdjacentHTML('beforeend', kanbanCardHtml(order));
        placed++;
    });

    // Empty states
    Object.entries(cols).forEach(([status, col]) => {
        if (!col) return;
        if (!col.children.length) {
            col.innerHTML = `
                <div class="kc-empty">
                    <i class="fas fa-inbox"></i>
                    <span>Không có đơn</span>
                </div>`;
        }
    });

    // Show notice if filter resulted in cancelled orders (not in kanban columns)
    if (_filterStatus === 'cancelled') {
        Object.values(cols).forEach(c => {
            if (c) c.innerHTML = `
                <div class="kc-empty">
                    <i class="fas fa-ban"></i>
                    <span>Đơn huỷ không hiển thị trên kanban</span>
                </div>`;
        });
        // Fallback: switch to table view for cancelled
        renderTable();
        setViewMode('table');
        toast('Đơn đã huỷ được hiển thị ở chế độ Bảng.', 'info');
    }
}

function kanbanCardHtml(o) {
    const items    = o.items || [];
    const preview  = items.slice(0, 2).map(i => `<div class="okc-item-line">· ${esc(i.item_name)} ×${i.quantity}</div>`).join('');
    const moreHtml = items.length > 2
        ? `<div class="okc-more">+${items.length - 2} món khác</div>` : '';
    const tableTag = o.table_number
        ? `<div class="okc-table"><i class="fas fa-chair" style="font-size:0.55rem"></i> Bàn ${esc(String(o.table_number))}</div>` : '';
    const customerName = o.customer_name || 'Khách vãng lai';

    // Action button based on next step
    let actionBtn = '';
    const next = NEXT_STATUS[o.status];
    if (o.status === 'pending') {
        actionBtn = `<button class="okc-action-btn okc-btn-process"
            onclick="event.stopPropagation();quickUpdateStatus(${o.id},'processing')"
            title="Xác nhận bắt đầu nấu">
            <i class="fas fa-fire-burner"></i> Bắt đầu nấu
        </button>`;
    } else if (o.status === 'processing') {
        actionBtn = `<button class="okc-action-btn okc-btn-ready"
            onclick="event.stopPropagation();quickUpdateStatus(${o.id},'ready')"
            title="Đánh dấu món đã xong">
            <i class="fas fa-bell-concierge"></i> Món đã xong
        </button>`;
    } else if (o.status === 'ready') {
        actionBtn = `<button class="okc-action-btn okc-btn-complete"
            onclick="event.stopPropagation();openPayRelease(${o.id})"
            title="Thanh toán & trả bàn">
            <i class="fas fa-cash-register"></i> Thanh toán & Trả bàn
        </button>`;
    }

    return `
    <div class="order-kcard" onclick="openOrderDetail(${o.id})">
        <div class="okc-top">
            <span class="okc-id">#${o.id}</span>
            ${tableTag}
        </div>
        <div class="okc-customer">${esc(customerName)}</div>
        <div class="okc-items">
            ${preview}
            ${moreHtml}
        </div>
        <div class="okc-bottom">
            <span class="okc-amount">${fmt(o.total_amount)}</span>
            <span class="okc-time">
                <i class="fas fa-clock" style="font-size:0.6rem"></i>
                ${timeSince(o.created_at)}
            </span>
        </div>
        ${actionBtn ? `<div>${actionBtn}</div>` : ''}
    </div>`;
}

/* ─────────────────────────────────────────
   RENDER: TABLE VIEW
───────────────────────────────────────── */
function renderTable() {
    const tbody = document.getElementById('ordersTableBody');
    if (!tbody) return;

    if (!_filtered.length) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:var(--space-12);color:var(--color-gray-400)">
            <i class="fas fa-inbox" style="font-size:2rem;opacity:0.3;display:block;margin-bottom:8px"></i>
            Không có đơn hàng nào
        </td></tr>`;
        return;
    }

    tbody.innerHTML = _filtered.map(o => {
        const items    = o.items || [];
        const itemsStr = items.slice(0, 2).map(i => `${esc(i.item_name)} ×${i.quantity}`).join(', ')
                       + (items.length > 2 ? ` +${items.length - 2}` : '');
        return `
        <tr style="cursor:pointer" onclick="openOrderDetail(${o.id})">
            <td style="font-weight:700;color:var(--admin-primary)">#${o.id}</td>
            <td style="font-weight:700">${o.table_number ? `Bàn ${esc(String(o.table_number))}` : '--'}</td>
            <td>
                <div style="font-weight:600;color:var(--color-gray-800)">${esc(o.customer_name || 'Khách vãng lai')}</div>
                ${o.customer_phone ? `<div style="font-size:0.68rem;color:var(--color-gray-400)">${esc(o.customer_phone)}</div>` : ''}
            </td>
            <td style="font-size:var(--text-xs);color:var(--color-gray-500);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${itemsStr || '--'}</td>
            <td style="font-weight:800;color:var(--color-gray-900)">${fmt(o.total_amount)}</td>
            <td>${statusBadgeHtml(o.status)}</td>
            <td style="font-size:var(--text-xs);color:var(--color-gray-400)">${fmtTime(o.created_at)}</td>
            <td onclick="event.stopPropagation()">
                <button class="btn btn-secondary btn-sm" onclick="openOrderDetail(${o.id})"
                    style="padding:0.3rem 0.6rem;font-size:0.65rem">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        </tr>`;
    }).join('');
}

/* ─────────────────────────────────────────
   SKELETON
───────────────────────────────────────── */
function showSkeleton() {
    const colIds = ['colPending', 'colProcessing', 'colReady', 'colCompleted'];
    colIds.forEach(id => {
        const col = document.getElementById(id);
        if (col) col.innerHTML = Array(2).fill('<div class="okc-shimmer skeleton"></div>').join('');
    });
}

/* ─────────────────────────────────────────
   VIEW MODE TOGGLE
───────────────────────────────────────── */
function setViewMode(mode) {
    _viewMode = mode;
    const kanban    = document.getElementById('kanbanView');
    const tableView = document.getElementById('tableView');
    const btnK      = document.getElementById('btnKanban');
    const btnT      = document.getElementById('btnTable');

    if (mode === 'kanban') {
        if (kanban)    kanban.style.display    = '';
        if (tableView) tableView.style.display = 'none';
        btnK?.classList.add('vt-active');
        btnT?.classList.remove('vt-active');
        renderKanban();
    } else {
        if (kanban)    kanban.style.display    = 'none';
        if (tableView) tableView.style.display = '';
        btnK?.classList.remove('vt-active');
        btnT?.classList.add('vt-active');
        renderTable();
    }
}

/* ─────────────────────────────────────────
   QUICK STATUS UPDATE (from kanban card btn)
───────────────────────────────────────── */
async function quickUpdateStatus(id, newStatus) {
    // Optimistic: update local state immediately
    const order = _orders.find(o => o.id === id);
    if (!order) return;
    const prevStatus = order.status;
    order.status = newStatus;
    updateStatusBar();
    applyFilter();

    try {
        await apiFetch(`/orders/${id}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status: newStatus }),
        });
        const s = STATUS[newStatus];
        toast(`Đơn #${id} → ${s.emoji} ${s.label}`, 'success');
    } catch (err) {
        // Rollback on error
        order.status = prevStatus;
        updateStatusBar();
        applyFilter();
        toast('Không cập nhật được trạng thái: ' + err.message, 'error');
    }
}

/* ─────────────────────────────────────────
   ORDER DETAIL MODAL
───────────────────────────────────────── */
async function openOrderDetail(id) {
    _detailId = id;
    openModal('orderDetailModal');

    // Show loading state
    const titleEl    = document.getElementById('modalOrderTitle');
    const metaEl     = document.getElementById('modalMetaStrip');
    const itemsEl    = document.getElementById('modalItemsList');
    const actionEl   = document.getElementById('modalActionZone');

    if (titleEl) titleEl.textContent = `Đơn #${id} — Đang tải...`;
    if (metaEl)  metaEl.innerHTML = '<div style="padding:8px;color:var(--color-gray-400);font-size:0.8rem"><i class="fas fa-spinner fa-spin"></i> Đang tải...</div>';
    if (itemsEl) itemsEl.innerHTML = '';
    if (actionEl) actionEl.innerHTML = '';

    try {
        const order = await apiFetch(`/orders/${id}`);
        renderOrderDetailModal(order);
    } catch (err) {
        toast('Không tải được chi tiết đơn hàng: ' + err.message, 'error');
        closeModal('orderDetailModal');
    }
}

function renderOrderDetailModal(o) {
    /* ── Title + status flow ── */
    const titleEl = document.getElementById('modalOrderTitle');
    if (titleEl) titleEl.textContent = `Đơn hàng #${o.id}`;

    // Status flow breadcrumb highlight
    document.querySelectorAll('#modalStatusFlow .sf-step').forEach(el => {
        el.className = 'sf-step';
        const step = el.dataset.step;
        const flow = ['pending', 'processing', 'ready', 'completed'];
        const currentIdx = flow.indexOf(o.status);
        const stepIdx    = flow.indexOf(step);
        if (o.status === 'cancelled') {
            el.className = 'sf-step';
        } else if (stepIdx < currentIdx) {
            el.classList.add('sf-done');
        } else if (stepIdx === currentIdx) {
            el.classList.add(`sf-active-${step}`);
        }
    });

    /* ── Meta strip ── */
    const metaEl = document.getElementById('modalMetaStrip');
    if (metaEl) {
        const chips = [
            o.table_number
                ? `<div class="odm-meta-chip"><i class="fas fa-chair"></i> Bàn ${esc(String(o.table_number))}</div>`
                : `<div class="odm-meta-chip"><i class="fas fa-chair"></i> Không có bàn</div>`,
            `<div class="odm-meta-chip"><i class="fas fa-user"></i> ${esc(o.customer_name || 'Khách vãng lai')}</div>`,
            o.customer_phone
                ? `<div class="odm-meta-chip"><i class="fas fa-phone"></i> ${esc(o.customer_phone)}</div>` : '',
            `<div class="odm-meta-chip"><i class="fas fa-clock"></i> ${fmtTime(o.created_at)}</div>`,
            `${statusBadgeHtml(o.status)}`,
        ].filter(Boolean).join('');
        metaEl.innerHTML = chips;
    }

    /* ── Items list ── */
    const itemsEl = document.getElementById('modalItemsList');
    const items   = o.items || [];
    if (itemsEl) {
        if (!items.length) {
            itemsEl.innerHTML = '<div style="color:var(--color-gray-400);font-size:0.8rem;padding:8px">Chưa có món.</div>';
        } else {
            itemsEl.innerHTML = items.map((item, idx) => `
                <div class="odm-item">
                    <div class="odm-item-num">${idx + 1}</div>
                    <div class="odm-item-name">${esc(item.item_name)}</div>
                    <div class="odm-item-qty">×${item.quantity}</div>
                    <div class="odm-item-price">${fmt(item.price_at_order * item.quantity)}</div>
                </div>`).join('');
        }
    }

    /* ── Summary ── */
    const subtotal = items.reduce((s, i) => s + (Number(i.price_at_order) * Number(i.quantity)), 0);
    const discount = Number(o.discount_amount) || 0;
    const total    = Number(o.total_amount)    || subtotal - discount;

    const subRow = document.getElementById('modalSumSubtotal');
    if (subRow) subRow.querySelector('.odm-sum-val').textContent = fmt(subtotal);

    const discRow = document.getElementById('modalSumDiscount');
    if (discRow) {
        if (discount > 0) {
            discRow.style.display = '';
            discRow.querySelector('.odm-sum-val').textContent = '−' + fmt(discount);
        } else {
            discRow.style.display = 'none';
        }
    }

    const totalEl = document.getElementById('modalSumTotal');
    if (totalEl) totalEl.textContent = fmt(total);

    /* ── Note ── */
    // (note shown in action zone if exists)

    /* ── Action zone ── */
    renderModalActionZone(o);
}

function renderModalActionZone(o) {
    const zone = document.getElementById('modalActionZone');
    if (!zone) return;

    const isDone      = o.status === 'completed' || o.status === 'cancelled';
    const canPayRelease = ['pending', 'processing', 'ready'].includes(o.status);
    const nextStatus    = NEXT_STATUS[o.status];

    let html = `<div class="odm-action-zone-title">Thao tác</div>`;

    // Note box
    if (o.note) {
        html += `
        <div class="odm-note-box">
            <i class="fas fa-note-sticky"></i>
            <span><strong>Ghi chú:</strong> ${esc(o.note)}</span>
        </div>`;
    }

    if (isDone) {
        const doneMsg = o.status === 'completed'
            ? `<i class="fas fa-circle-check" style="color:var(--color-success)"></i> Đơn đã hoàn thành lúc ${fmtTime(o.completed_at)}`
            : `<i class="fas fa-ban" style="color:var(--color-error)"></i> Đơn đã bị huỷ`;
        html += `<div style="font-size:var(--text-sm);color:var(--color-gray-500);text-align:center;padding:var(--space-2)">${doneMsg}</div>`;
        zone.innerHTML = html;
        return;
    }

    /* ── Pay & Release: always primary CTA for active orders ── */
    html += `
    <button class="btn-pay-release" id="modalBtnPayRelease"
            onclick="openPayRelease(${o.id})">
        <i class="fas fa-cash-register"></i> Thanh toán & Trả bàn
    </button>`;

    /* ── Intermediate step buttons ── */
    if (nextStatus) {
        const s = STATUS[nextStatus];
        html += `
        <div style="display:flex;gap:var(--space-2)">
            <button class="btn btn-secondary" style="flex:1"
                    onclick="modalQuickUpdate(${o.id},'${nextStatus}')">
                ${s.emoji} ${esc(s.label)}
            </button>
            <button class="btn btn-secondary" style="flex:0;padding:0 var(--space-3);color:var(--color-error)"
                    onclick="modalQuickUpdate(${o.id},'cancelled')"
                    title="Huỷ đơn hàng này">
                <i class="fas fa-ban"></i>
            </button>
        </div>`;
    } else if (o.status === 'ready') {
        // Only cancel remaining when ready
        html += `
        <button class="btn btn-secondary" style="width:100%;color:var(--color-error)"
                onclick="modalQuickUpdate(${o.id},'cancelled')">
            <i class="fas fa-ban"></i> Huỷ đơn
        </button>`;
    }

    zone.innerHTML = html;
}

/* ─────────────────────────────────────────
   MODAL QUICK STATUS (from inside modal)
   Closes modal after update
───────────────────────────────────────── */
async function modalQuickUpdate(id, newStatus) {
    await quickUpdateStatus(id, newStatus);
    closeModal('orderDetailModal');
}

/* ─────────────────────────────────────────
   PAY & RELEASE FLOW
───────────────────────────────────────── */
function openPayRelease(id) {
    const order = _orders.find(o => o.id === id);
    if (!order) return;

    _payReleaseId = id;
    const setText2 = (elId, val) => { const e = document.getElementById(elId); if (e) e.textContent = val; };
    setText2('payReleaseOrderId', `#${id}`);
    setText2('payReleaseTable',   order.table_number ? `Bàn ${order.table_number}` : 'Không có bàn');
    setText2('payReleaseAmount',  fmt(order.total_amount));

    // Reset & hiển thị phương thức thanh toán giả lập + tên thu ngân
    try {
        const sel = document.getElementById('payMethodSelect');
        if (sel) sel.value = 'cash';
        const cashierEl = document.getElementById('payCashierName');
        if (cashierEl) {
            // Lấy tên admin từ layout (nếu đã inject) hoặc fallback
            const nameFromCard = document.getElementById('adminUserName')?.textContent || '';
            cashierEl.textContent = nameFromCard || 'Admin hiện tại';
        }
    } catch (_) {}

    closeModal('orderDetailModal');
    openModal('payReleaseModal');
}

async function confirmPayRelease() {
    if (!_payReleaseId) return;

    const btn = document.getElementById('btnPayReleaseConfirm');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...'; }

    // Đọc phương thức thanh toán giả lập từ select
    let paymentMethod = 'cash';
    try {
        const sel = document.getElementById('payMethodSelect');
        if (sel && sel.value) paymentMethod = sel.value;
    } catch (_) {}

    try {
        await apiFetch(`/orders/${_payReleaseId}/complete-and-release`, {
            method: 'PUT',
            body: JSON.stringify({ payment_method: paymentMethod }),
        });

        toast(`🎉 Đơn #${_payReleaseId} đã thanh toán & trả bàn thành công!`, 'success');
        closeModal('payReleaseModal');
        _payReleaseId = null;
        await loadOrders(true);   // silent refresh

    } catch (err) {
        const msg = err.status === 400
            ? 'Đơn hàng đã được hoàn tất trước đó.'
            : 'Lỗi thanh toán: ' + err.message;
        toast(msg, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-check-circle"></i> Xác nhận thanh toán';
        }
    }
}

/* ─────────────────────────────────────────
   MODAL HELPERS
───────────────────────────────────────── */
function openModal(id) {
    const el = document.getElementById(id);
    if (el) requestAnimationFrame(() => el.classList.add('active'));
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('active');
}

/* ─────────────────────────────────────────
   STATUS BAR FILTER
───────────────────────────────────────── */
function setStatusFilter(status) {
    _filterStatus = status;
    document.querySelectorAll('#statusBar .osb-item').forEach(el => {
        el.classList.toggle('osb-active', el.dataset.filter === status);
    });
    applyFilter();
}

/* ─────────────────────────────────────────
   INIT
───────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {

    // Initial data load
    loadOrders();

    // Auto-refresh
    startAutoRefresh();

    // ── Toolbar ──
    document.getElementById('btnRefresh')?.addEventListener('click', () => {
        const btn = document.getElementById('btnRefresh');
        btn?.querySelector('i')?.classList.add('fa-spin');
        loadOrders();
    });

    // ── View toggle ──
    document.getElementById('btnKanban')?.addEventListener('click', () => setViewMode('kanban'));
    document.getElementById('btnTable')?.addEventListener('click',  () => setViewMode('table'));

    // ── Status bar ──
    document.getElementById('statusBar')?.addEventListener('click', e => {
        const item = e.target.closest('[data-filter]');
        if (item) setStatusFilter(item.dataset.filter);
    });

    // ── Search (dual: topbar + toolbar, debounced) ──
    function handleSearch(val) {
        _search = val.trim();
        applyFilter();
    }
    ['topbarSearch', 'searchInput'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', e => {
            clearTimeout(_searchTimer);
            _searchTimer = setTimeout(() => handleSearch(e.target.value), DEBOUNCE_MS);
        });
    });

    // ── Date filter ──
    document.getElementById('dateFilter')?.addEventListener('change', e => {
        _dateFilter = e.target.value;
        applyFilter();
    });

    // ── Clear filter ──
    document.getElementById('btnClearFilter')?.addEventListener('click', () => {
        _search      = '';
        _dateFilter  = '';
        _filterStatus = 'all';
        const si = document.getElementById('searchInput');
        const di = document.getElementById('dateFilter');
        const ts = document.getElementById('topbarSearch');
        if (si) si.value = '';
        if (di) di.value = '';
        if (ts) ts.value = '';
        document.querySelectorAll('#statusBar .osb-item').forEach(el => {
            el.classList.toggle('osb-active', el.dataset.filter === 'all');
        });
        applyFilter();
    });

    // ── Order detail modal ──
    document.getElementById('modalClose')?.addEventListener('click', () => closeModal('orderDetailModal'));
    document.getElementById('orderDetailModal')?.addEventListener('click', e => {
        if (e.target === document.getElementById('orderDetailModal')) closeModal('orderDetailModal');
    });

    // ── Pay & Release modal ──
    document.getElementById('payReleaseModalClose')?.addEventListener('click', () => closeModal('payReleaseModal'));
    document.getElementById('btnPayReleaseCancel')?.addEventListener('click',  () => closeModal('payReleaseModal'));
    document.getElementById('btnPayReleaseConfirm')?.addEventListener('click', confirmPayRelease);
    document.getElementById('payReleaseModal')?.addEventListener('click', e => {
        if (e.target === document.getElementById('payReleaseModal')) closeModal('payReleaseModal');
    });

    // ── ESC key ──
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            closeModal('orderDetailModal');
            closeModal('payReleaseModal');
        }
    });

    // ── Cleanup on unload ──
    window.addEventListener('beforeunload', stopAutoRefresh, { once: true });
});

/* ─────────────────────────────────────────
   EXPOSE — required for inline onclick in template literals
───────────────────────────────────────── */
window.openOrderDetail    = openOrderDetail;
window.quickUpdateStatus  = quickUpdateStatus;
window.modalQuickUpdate   = modalQuickUpdate;
window.openPayRelease     = openPayRelease;