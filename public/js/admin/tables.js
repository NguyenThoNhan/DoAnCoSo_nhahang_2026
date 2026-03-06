/**
 * tables.js — Admin Table Management
 * Sprint 4 / Phase 3
 *
 * ROUTES (confirmed in admin.routes.js):
 *   GET    /api/admin/tables
 *     → [{id, table_number, capacity, status, qr_code_path, current_order_id}]
 *   POST   /api/admin/tables
 *     body: { table_number, capacity }
 *     → { message, id, qr_code_path }   ← backend auto-generates QR to /uploads/qrcodes/
 *   PUT    /api/admin/tables/:id
 *     body: { status }                  ← validStatuses: available|occupied|reserved|maintenance
 *   PUT    /api/admin/tables/:id/release
 *     → resets status = 'available', current_order_id = NULL
 *   DELETE /api/admin/tables/:id
 *
 * QR PATH: Backend saves to /uploads/qrcodes/table_N.png
 *   served statically at http://server/uploads/qrcodes/table_N.png
 *   The QR image URL embedded in the PNG points to the server's LAN IP,
 *   so phones on the same WiFi can scan and open the menu page.
 *
 * RULES:
 *   - GoMeal.getAuthHeader() — NOT getAuthHeaders()
 *   - id="admin-sidebar-container" already set in HTML
 *   - window.xxx expose for inline onclick in template literals
 *   - Confirm modal before delete
 */

'use strict';

/* ─────────────────────────────────────────
   CONFIG
───────────────────────────────────────── */
const API         = '/api/admin';
const DEBOUNCE_MS = 260;

/* ─────────────────────────────────────────
   STATUS CONFIG
───────────────────────────────────────── */
const ST = {
    available:   { label: 'Sẵn sàng',   emoji: '✅', icon: '🪑', iconCls: 'tc-icon-available',   borderCls: 'tc-available',   dotCls: 'tsd-available',   badgeCls: 'tsb-available'   },
    occupied:    { label: 'Có khách',    emoji: '🔴', icon: '👥', iconCls: 'tc-icon-occupied',    borderCls: 'tc-occupied',    dotCls: 'tsd-occupied',    badgeCls: 'tsb-occupied'    },
    reserved:    { label: 'Đặt trước',   emoji: '📋', icon: '📋', iconCls: 'tc-icon-reserved',    borderCls: 'tc-reserved',    dotCls: 'tsd-reserved',    badgeCls: 'tsb-reserved'    },
    maintenance: { label: 'Bảo trì',    emoji: '🔧', icon: '🔧', iconCls: 'tc-icon-maintenance', borderCls: 'tc-maintenance', dotCls: 'tsd-maintenance', badgeCls: 'tsb-maintenance' },
};

/* ─────────────────────────────────────────
   STATE
───────────────────────────────────────── */
let _tables      = [];      // full list from server
let _filtered    = [];      // after filter/search
let _selectedId  = null;    // table ID currently selected (info panel)
let _deleteId    = null;    // table ID pending delete confirmation
let _qrTableId   = null;    // table ID in QR modal
let _panelMode   = 'create';// 'create' | 'info'
let _filterStatus = 'all';
let _search      = '';
let _searchTimer = null;

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */
function esc(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(val);
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
    const el = document.createElement('div');
    el.style.cssText = [
        'display:flex;align-items:center;gap:10px',
        'padding:12px 18px;border-radius:12px',
        'background:var(--color-white)',
        'box-shadow:0 8px 30px rgba(0,0,0,0.14)',
        `border-left:4px solid ${color}`,
        'font-family:var(--font-primary);font-size:14px',
        'color:var(--color-gray-800);max-width:380px',
        'pointer-events:all',
        'animation:_toast-in 0.3s ease',
    ].join(';');
    if (!document.getElementById('_tbls_toast_style')) {
        const s = document.createElement('style');
        s.id = '_tbls_toast_style';
        s.textContent = '@keyframes _toast-in{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}';
        document.head.appendChild(s);
    }
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
   LOAD TABLES
───────────────────────────────────────── */
async function loadTables(silent = false) {
    if (!silent) showSkeleton();
    try {
        _tables = await apiFetch('/tables') || [];
        updateStats();
        applyFilter();
        // If selected table was deleted, reset panel
        if (_selectedId && !_tables.find(t => t.id === _selectedId)) {
            _selectedId = null;
            _panelMode  = 'create';
        }
        renderRightPanel();
    } catch (err) {
        console.error('[Tables] Load error:', err);
        if (!silent) toast('Không tải được danh sách bàn: ' + err.message, 'error');
    } finally {
        const icon = document.querySelector('#btnRefresh i');
        if (icon) icon.classList.remove('fa-spin');
    }
}

/* ─────────────────────────────────────────
   STATS
───────────────────────────────────────── */
function updateStats() {
    const counts = { all: _tables.length, available: 0, occupied: 0, other: 0 };
    _tables.forEach(t => {
        if (t.status === 'available')  counts.available++;
        else if (t.status === 'occupied') counts.occupied++;
        else counts.other++;
    });
    setText('statTotalVal',    counts.all);
    setText('statAvailVal',    counts.available);
    setText('statOccupiedVal', counts.occupied);
    setText('statOtherVal',    counts.other);
    setText('headCount',       `(${counts.all})`);
}

/* ─────────────────────────────────────────
   FILTER
───────────────────────────────────────── */
function applyFilter() {
    const q = _search.toLowerCase();
    _filtered = _tables.filter(t => {
        // Status filter
        if (_filterStatus !== 'all' && t.status !== _filterStatus) return false;
        // Search by table_number
        if (q && !String(t.table_number).includes(q)) return false;
        return true;
    });
    setText('resultCount', _filtered.length);
    renderGrid();

    // Sync filter button styles
    document.querySelectorAll('.ct-status-btn').forEach(btn => {
        const sf      = btn.dataset.sf;
        const active  = sf === _filterStatus;
        btn.style.background    = active ? 'var(--color-white)' : 'transparent';
        btn.style.color         = active ? 'var(--admin-primary)' : 'var(--color-gray-500)';
        btn.style.boxShadow     = active ? 'var(--shadow-xs)'     : 'none';
    });

    // Sync stat cards
    document.querySelectorAll('[data-filter]').forEach(card => {
        const f = card.dataset.filter;
        const active = f === _filterStatus || (f === 'other' && _filterStatus === 'other');
        card.classList.toggle('tsc-active', active);
    });
}

/* ─────────────────────────────────────────
   RENDER: FLOOR GRID
───────────────────────────────────────── */
function renderGrid() {
    const grid = document.getElementById('floorGrid');
    if (!grid) return;

    if (!_filtered.length) {
        grid.innerHTML = `
            <div class="floor-empty">
                <div class="fe-ico"><i class="fas fa-chair"></i></div>
                <div class="fe-title">Không có bàn nào</div>
                <div class="fe-desc">
                    ${_search || _filterStatus !== 'all'
                        ? 'Không tìm thấy bàn phù hợp với bộ lọc.'
                        : 'Nhấn "Thêm bàn" để bắt đầu thiết lập sơ đồ nhà hàng.'}
                </div>
            </div>`;
        return;
    }

    grid.innerHTML = _filtered.map(t => tableCardHtml(t)).join('');
}

function tableCardHtml(t) {
    const s         = ST[t.status] || ST.available;
    const isSelected = t.id === _selectedId;

    const actionBtns = `
        <div class="tc-actions">
            ${t.status !== 'available'
                ? `<button class="btn btn-success btn-sm" style="font-size:0.6rem;padding:0.3rem 0.65rem"
                       onclick="event.stopPropagation();releaseTable(${t.id})"
                       title="Giải phóng bàn về trạng thái Sẵn sàng">
                       <i class="fas fa-rotate-left"></i> Giải phóng
                   </button>` : ''}
            <button class="btn btn-secondary btn-sm" style="font-size:0.6rem;padding:0.3rem 0.65rem"
                    onclick="event.stopPropagation();openQrModal(${t.id})"
                    title="Xem QR code">
                <i class="fas fa-qrcode"></i>
            </button>
            <button class="btn btn-secondary btn-sm" style="font-size:0.6rem;padding:0.3rem 0.5rem;color:var(--color-error)"
                    onclick="event.stopPropagation();openDeleteModal(${t.id})"
                    title="Xoá bàn">
                <i class="fas fa-trash"></i>
            </button>
        </div>`;

    return `
    <div class="table-card ${s.borderCls} ${isSelected ? 'tc-selected' : ''}"
         id="tcard-${t.id}"
         onclick="selectTable(${t.id})">
        <div class="tc-icon ${s.iconCls}">
            <span style="font-size:1.5rem;line-height:1">${s.icon}</span>
            <div class="tc-status-dot ${s.dotCls}"></div>
        </div>
        <div class="tc-number">Bàn ${esc(String(t.table_number))}</div>
        <div class="tc-capacity">
            <i class="fas fa-user-group" style="font-size:0.55rem"></i>
            ${t.capacity} chỗ ngồi
        </div>
        <span class="tc-status-badge ${s.badgeCls}">${s.emoji} ${esc(s.label)}</span>
        ${actionBtns}
    </div>`;
}

/* ─────────────────────────────────────────
   TABLE SELECTION → info panel
───────────────────────────────────────── */
function selectTable(id) {
    if (_selectedId === id) {
        // Deselect
        _selectedId = null;
        _panelMode  = 'create';
    } else {
        _selectedId = id;
        _panelMode  = 'info';
    }
    // Re-render grid to update selected highlight
    renderGrid();
    renderRightPanel();
}

/* ─────────────────────────────────────────
   RENDER: RIGHT PANEL
───────────────────────────────────────── */
function renderRightPanel() {
    const panel = document.getElementById('rightPanel');
    if (!panel) return;
    if (_panelMode === 'info' && _selectedId) {
        const t = _tables.find(t => t.id === _selectedId);
        if (t) { panel.innerHTML = infoPanelHtml(t); bindInfoPanelEvents(t); return; }
    }
    panel.innerHTML = createPanelHtml();
    bindCreatePanelEvents();
}

/* ─── Create Panel ─── */
function createPanelHtml() {
    return `
    <div class="tbl-create-panel" id="createPanel">
        <div class="tcp-head">
            <div class="tcp-head-ico"><i class="fas fa-plus"></i></div>
            <div>
                <div class="tcp-head-title">Thêm bàn mới</div>
                <div class="tcp-head-sub">Backend tự tạo QR code theo IP máy chủ</div>
            </div>
        </div>

        <div class="tcp-body">
            <!-- Table number -->
            <div class="form-group">
                <label class="form-label" for="cpTableNum">Số bàn <span style="color:var(--color-error)">*</span></label>
                <input type="number" class="form-input" id="cpTableNum"
                       placeholder="VD: 1, 2, 10, 15..." min="1" max="999">
                <div class="form-error" id="cpTableNumErr"></div>
            </div>

            <!-- Capacity -->
            <div class="form-group">
                <label class="form-label" for="cpCapacity">Sức chứa (chỗ ngồi) <span style="color:var(--color-error)">*</span></label>
                <input type="number" class="form-input" id="cpCapacity"
                       placeholder="VD: 2, 4, 6, 8..." min="1" max="20">
                <div class="form-error" id="cpCapacityErr"></div>
            </div>

            <!-- QR note -->
            <div class="qr-note-box">
                <i class="fas fa-circle-info"></i>
                <span>Sau khi tạo, QR code sẽ được sinh tự động dựa trên địa chỉ IP + cổng của máy chủ.
                Khách dùng điện thoại <strong>cùng WiFi</strong> quét mã để vào thực đơn.</span>
            </div>
        </div>

        <div class="tcp-foot">
            <button class="btn btn-primary-admin" id="cpBtnCreate" style="width:100%">
                <i class="fas fa-plus"></i> Tạo bàn & sinh QR
            </button>
        </div>
    </div>`;
}

function bindCreatePanelEvents() {
    const btnCreate = document.getElementById('cpBtnCreate');
    if (!btnCreate) return;

    btnCreate.addEventListener('click', createTable);

    // Enter key support
    ['cpTableNum', 'cpCapacity'].forEach(id => {
        document.getElementById(id)?.addEventListener('keydown', e => {
            if (e.key === 'Enter') createTable();
        });
        document.getElementById(id)?.addEventListener('input', () => {
            clearFieldError(id + 'Err');
        });
    });
}

async function createTable() {
    const numEl = document.getElementById('cpTableNum');
    const capEl = document.getElementById('cpCapacity');
    if (!numEl || !capEl) return;

    const table_number = parseInt(numEl.value, 10);
    const capacity     = parseInt(capEl.value, 10);
    let valid = true;

    if (!table_number || table_number < 1) {
        showFieldError('cpTableNumErr', 'Vui lòng nhập số bàn hợp lệ (≥ 1)');
        valid = false;
    }
    // Duplicate check
    if (table_number && _tables.find(t => t.table_number === table_number)) {
        showFieldError('cpTableNumErr', `Bàn số ${table_number} đã tồn tại`);
        valid = false;
    }
    if (!capacity || capacity < 1) {
        showFieldError('cpCapacityErr', 'Vui lòng nhập sức chứa hợp lệ (≥ 1)');
        valid = false;
    }
    if (!valid) return;

    const btn = document.getElementById('cpBtnCreate');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tạo...'; }

    try {
        const res = await apiFetch('/tables', {
            method: 'POST',
            body: JSON.stringify({ table_number, capacity }),
        });

        toast(`✅ Bàn số ${table_number} đã được tạo kèm QR code!`, 'success');

        // Reset form
        if (numEl) numEl.value = '';
        if (capEl) capEl.value = '';

        // Auto-select the new table in info panel
        _selectedId = res.id;
        _panelMode  = 'info';
        await loadTables(true);

    } catch (err) {
        const msg = err.status === 400 ? err.data?.message || err.message : 'Lỗi tạo bàn: ' + err.message;
        toast(msg, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-plus"></i> Tạo bàn & sinh QR'; }
    }
}

/* ─── Info Panel ─── */
function infoPanelHtml(t) {
    const s       = ST[t.status] || ST.available;
    const qrPath  = t.qr_code_path;   // e.g. /uploads/qrcodes/table_3.png
    const hasQR   = !!qrPath;

    const qrSection = hasQR
        ? `<div class="tip-qr-section">
            <div class="tip-qr-label"><i class="fas fa-qrcode" style="margin-right:4px"></i>QR Code khách quét</div>
            <div class="tip-qr-frame" style="cursor:pointer" onclick="openQrModal(${t.id})" title="Click để xem lớn">
                <img src="${esc(qrPath)}" alt="QR Bàn ${esc(String(t.table_number))}"
                     onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                <div style="display:none;width:100%;height:100%;align-items:center;justify-content:center;color:var(--color-gray-400);flex-direction:column;gap:4px">
                    <i class="fas fa-image-slash" style="font-size:1.4rem"></i>
                    <span style="font-size:0.6rem">Chưa có ảnh</span>
                </div>
            </div>
            <div class="tip-qr-hint">
                <i class="fas fa-hand-pointer" style="margin-right:3px;color:var(--admin-primary)"></i>
                Click để xem lớn &amp; tải về<br>
                <i class="fas fa-wifi" style="color:#3B82F6;margin-right:3px"></i>
                Khách cùng WiFi quét bằng điện thoại
            </div>
        </div>`
        : `<div class="tip-qr-section">
            <div style="color:var(--color-gray-400);font-size:var(--text-xs);text-align:center;padding:var(--space-2)">
                <i class="fas fa-qrcode" style="font-size:1.5rem;opacity:0.3;display:block;margin-bottom:6px"></i>
                Chưa có QR code
            </div>
        </div>`;

    // Status change options
    const otherStatuses = Object.entries(ST)
        .filter(([k]) => k !== t.status)
        .map(([k, v]) => `<option value="${k}">${v.emoji} ${v.label}</option>`)
        .join('');

    return `
    <div class="tbl-info-panel" id="infoPanel">

        <div class="tip-head">
            <div style="display:flex;align-items:center;justify-content:space-between">
                <div>
                    <div class="tip-head-number">Bàn ${esc(String(t.table_number))}</div>
                    <div class="tip-head-sub">ID: #${t.id}</div>
                </div>
                <span class="tc-status-badge ${s.badgeCls}" style="font-size:0.7rem;padding:4px 10px">
                    ${s.emoji} ${esc(s.label)}
                </span>
            </div>
        </div>

        <div class="tip-body">
            <div class="tip-info-row">
                <span class="tip-info-label"><i class="fas fa-hashtag" style="margin-right:5px;color:var(--color-gray-300)"></i>Số bàn</span>
                <span class="tip-info-val">${esc(String(t.table_number))}</span>
            </div>
            <div class="tip-info-row">
                <span class="tip-info-label"><i class="fas fa-user-group" style="margin-right:5px;color:var(--color-gray-300)"></i>Sức chứa</span>
                <span class="tip-info-val">${t.capacity} chỗ ngồi</span>
            </div>
            <div class="tip-info-row">
                <span class="tip-info-label"><i class="fas fa-circle-half-stroke" style="margin-right:5px;color:var(--color-gray-300)"></i>Trạng thái</span>
                <span class="tip-info-val">${s.emoji} ${esc(s.label)}</span>
            </div>
            ${t.current_order_id
                ? `<div class="tip-info-row">
                    <span class="tip-info-label"><i class="fas fa-receipt" style="margin-right:5px;color:var(--color-gray-300)"></i>Đơn hiện tại</span>
                    <a href="/views/admin/orders.html" class="tip-info-val" style="color:var(--admin-primary);text-decoration:none">
                        #${t.current_order_id} <i class="fas fa-arrow-right" style="font-size:0.65rem"></i>
                    </a>
                </div>` : ''}
            <div class="tip-info-row" style="border:none">
                <span class="tip-info-label"><i class="fas fa-qrcode" style="margin-right:5px;color:var(--color-gray-300)"></i>QR code</span>
                <span class="tip-info-val" style="font-size:var(--text-xs);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(qrPath || 'Chưa có')}">
                    ${hasQR ? qrPath.split('/').pop() : 'Chưa có'}
                </span>
            </div>
        </div>

        ${qrSection}

        <!-- Change status -->
        <div style="padding:var(--space-4) var(--space-6);border-top:1px solid var(--color-gray-100)">
            <div style="font-size:0.65rem;font-weight:700;color:var(--color-gray-400);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:var(--space-2)">
                Đổi trạng thái thủ công
            </div>
            <div style="display:flex;gap:var(--space-2)">
                <select class="form-input" id="tipStatusSel"
                        style="flex:1;padding:0.45rem var(--space-3);font-size:var(--text-sm)">
                    ${otherStatuses}
                </select>
                <button class="btn btn-primary-admin btn-sm" id="tipBtnChangeStatus" style="flex-shrink:0">
                    <i class="fas fa-check"></i>
                </button>
            </div>
        </div>

        <!-- Foot buttons -->
        <div class="tip-foot">
            ${t.status !== 'available'
                ? `<button class="btn btn-success" id="tipBtnRelease" style="width:100%">
                    <i class="fas fa-rotate-left"></i> Giải phóng bàn
                   </button>` : ''}
            <div style="display:flex;gap:var(--space-2)">
                <button class="btn btn-secondary" id="tipBtnDeselect" style="flex:1">
                    <i class="fas fa-xmark"></i> Đóng
                </button>
                <button class="btn btn-danger btn-sm" id="tipBtnDelete" style="flex-shrink:0;padding:0 var(--space-4)">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>

    </div>`;
}

function bindInfoPanelEvents(t) {
    document.getElementById('tipBtnDeselect')?.addEventListener('click', () => {
        _selectedId = null; _panelMode = 'create';
        renderGrid(); renderRightPanel();
    });

    document.getElementById('tipBtnDelete')?.addEventListener('click', () => openDeleteModal(t.id));

    document.getElementById('tipBtnRelease')?.addEventListener('click', () => releaseTable(t.id));

    document.getElementById('tipBtnChangeStatus')?.addEventListener('click', async () => {
        const sel = document.getElementById('tipStatusSel');
        if (!sel) return;
        await changeTableStatus(t.id, sel.value);
    });
}

/* ─────────────────────────────────────────
   RELEASE TABLE
───────────────────────────────────────── */
async function releaseTable(id) {
    const t = _tables.find(t => t.id === id);
    const prevStatus = t?.status;

    // Optimistic update
    if (t) { t.status = 'available'; t.current_order_id = null; }
    updateStats(); applyFilter(); renderRightPanel();

    try {
        await apiFetch(`/tables/${id}/release`, { method: 'PUT' });
        toast(`✅ Bàn ${t?.table_number} đã được giải phóng!`, 'success');
    } catch (err) {
        // Rollback
        if (t) t.status = prevStatus;
        updateStats(); applyFilter(); renderRightPanel();
        toast('Lỗi giải phóng bàn: ' + err.message, 'error');
    }
}

/* ─────────────────────────────────────────
   CHANGE STATUS
───────────────────────────────────────── */
async function changeTableStatus(id, newStatus) {
    const t = _tables.find(t => t.id === id);
    const prev = t?.status;
    if (t) t.status = newStatus;
    updateStats(); applyFilter(); renderRightPanel();

    try {
        await apiFetch(`/tables/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ status: newStatus }),
        });
        const s = ST[newStatus];
        toast(`Bàn ${t?.table_number} → ${s.emoji} ${s.label}`, 'success');
    } catch (err) {
        if (t) t.status = prev;
        updateStats(); applyFilter(); renderRightPanel();
        toast('Lỗi đổi trạng thái: ' + err.message, 'error');
    }
}

/* ─────────────────────────────────────────
   DELETE FLOW
───────────────────────────────────────── */
function openDeleteModal(id) {
    const t = _tables.find(t => t.id === id);
    if (!t) return;
    _deleteId = id;
    setText('deleteTargetNum', String(t.table_number));
    openModal('deleteModal');
}

async function confirmDelete() {
    if (!_deleteId) return;
    const t    = _tables.find(t => t.id === _deleteId);
    const btn  = document.getElementById('btnDeleteConfirm');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xoá...'; }

    try {
        await apiFetch(`/tables/${_deleteId}`, { method: 'DELETE' });
        toast(`🗑️ Bàn số ${t?.table_number} đã được xoá.`, 'success');
        closeModal('deleteModal');
        // If deleted was selected, reset panel
        if (_selectedId === _deleteId) { _selectedId = null; _panelMode = 'create'; }
        _deleteId = null;
        await loadTables(true);
    } catch (err) {
        toast('Lỗi xoá bàn: ' + err.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-trash"></i> Xoá vĩnh viễn'; }
    }
}

/* ─────────────────────────────────────────
   QR MODAL
───────────────────────────────────────── */
function openQrModal(id) {
    const t = _tables.find(t => t.id === id);
    if (!t) return;
    _qrTableId = id;

    const qrPath = t.qr_code_path; // e.g. /uploads/qrcodes/table_3.png

    setText('qrModalTitle', `Bàn ${t.table_number}`);

    const imgEl = document.getElementById('qrModalImg');
    if (imgEl) imgEl.src = qrPath || '';

    // URL in QR: the QR image itself encodes the LAN URL
    // Display what's accessible to phone scanners on same WiFi
    const urlBox = document.getElementById('qrUrlBox');
    if (urlBox) {
        // The QR encodes: http://LAN_IP:PORT/views/user/table-select.html?table=N
        // We show the qr_code_path for reference
        urlBox.textContent = qrPath
            ? `${window.location.origin}${qrPath}\n\n⚠️ URL nhúng trong QR là IP nội bộ máy chủ — dùng cho điện thoại cùng WiFi.`
            : 'Chưa có QR code cho bàn này.';
    }

    // Download link
    const dlBtn = document.getElementById('btnQrDownload');
    if (dlBtn && qrPath) {
        dlBtn.href     = qrPath;
        dlBtn.download = `QR_Ban_${t.table_number}.png`;
    }

    openModal('qrModal');
}

function printQr() {
    const img = document.getElementById('qrModalImg');
    if (!img || !img.src) return;
    const t = _tables.find(t => t.id === _qrTableId);
    const w = window.open('', '_blank', 'width=400,height=500');
    if (!w) { toast('Vui lòng cho phép popup để in QR.', 'warning'); return; }
    w.document.write(`
        <!DOCTYPE html><html><head><title>QR Bàn ${t?.table_number || ''}</title>
        <style>
            body { display:flex;flex-direction:column;align-items:center;justify-content:center;
                   min-height:100vh;margin:0;font-family:Inter,sans-serif; }
            img  { width:280px;height:280px;border:3px solid #eee;border-radius:12px; }
            h2   { font-size:1.4rem;font-weight:900;margin:12px 0 4px; }
            p    { font-size:0.75rem;color:#888;margin:0; }
        </style></head><body>
        <img src="${img.src}" alt="QR">
        <h2>Bàn số ${t?.table_number || ''}</h2>
        <p>Quét QR để đặt món (cùng WiFi)</p>
        <script>window.onload=()=>{ window.print(); window.close(); }<\/script>
        </body></html>`);
    w.document.close();
}

/* ─────────────────────────────────────────
   SKELETON
───────────────────────────────────────── */
function showSkeleton() {
    const grid = document.getElementById('floorGrid');
    if (!grid) return;
    grid.innerHTML = Array(6).fill('').map(() => `
        <div class="sk-block skeleton" style="height:170px;border-radius:var(--radius-xl)"></div>
    `).join('');
}

/* ─────────────────────────────────────────
   FORM VALIDATION HELPERS
───────────────────────────────────────── */
function showFieldError(errId, msg) {
    const el = document.getElementById(errId);
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    // Highlight the sibling input
    const input = el.previousElementSibling;
    if (input) input.style.borderColor = 'var(--color-error)';
}

function clearFieldError(errId) {
    const el = document.getElementById(errId);
    if (!el) return;
    el.textContent = '';
    el.style.display = 'none';
    const input = el.previousElementSibling;
    if (input) input.style.borderColor = '';
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
    if (el) el.classList.remove('active');
}

/* ─────────────────────────────────────────
   INIT
───────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {

    // Initial load
    loadTables();

    // ── Refresh button ──
    document.getElementById('btnRefresh')?.addEventListener('click', () => {
        document.querySelector('#btnRefresh i')?.classList.add('fa-spin');
        loadTables();
    });

    // ── Add table button → scroll to form / focus ──
    document.getElementById('btnAddTable')?.addEventListener('click', () => {
        _selectedId = null; _panelMode = 'create';
        renderGrid(); renderRightPanel();
        // Scroll right panel into view on mobile
        document.getElementById('rightPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(() => document.getElementById('cpTableNum')?.focus(), 300);
    });

    // ── Status bar stat cards ──
    document.getElementById('statsRow')?.addEventListener('click', e => {
        const card = e.target.closest('[data-filter]');
        if (!card) return;
        const f = card.dataset.filter;
        _filterStatus = f;
        applyFilter();
    });

    // ── Toolbar filter buttons ──
    document.querySelectorAll('.ct-status-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            _filterStatus = btn.dataset.sf;
            applyFilter();
        });
    });

    // ── Search (topbar + toolbar, debounced) ──
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

    // ── Delete modal ──
    document.getElementById('deleteModalClose')?.addEventListener('click',  () => closeModal('deleteModal'));
    document.getElementById('btnDeleteCancel')?.addEventListener('click',   () => closeModal('deleteModal'));
    document.getElementById('btnDeleteConfirm')?.addEventListener('click',  confirmDelete);
    document.getElementById('deleteModal')?.addEventListener('click', e => {
        if (e.target === document.getElementById('deleteModal')) closeModal('deleteModal');
    });

    // ── QR modal ──
    document.getElementById('qrModalClose')?.addEventListener('click',  () => closeModal('qrModal'));
    document.getElementById('btnQrPrint')?.addEventListener('click',    printQr);
    document.getElementById('qrModal')?.addEventListener('click', e => {
        if (e.target === document.getElementById('qrModal')) closeModal('qrModal');
    });

    // ── ESC key ──
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            closeModal('deleteModal');
            closeModal('qrModal');
        }
    });
});

/* ─────────────────────────────────────────
   EXPOSE — required for onclick in template literals
───────────────────────────────────────── */
window.selectTable    = selectTable;
window.releaseTable   = releaseTable;
window.openDeleteModal = openDeleteModal;
window.openQrModal    = openQrModal;