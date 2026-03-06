/**
 * ingredients.js — Admin Ingredient / Inventory Management
 * ══════════════════════════════════════════════════════════
 * ROUTES (admin.routes.js — confirmed):
 *   GET    /api/admin/ingredients        → [{id, name, unit, stock_quantity, min_stock_level}]
 *   POST   /api/admin/ingredients        → 201 {message, id} | 400 missing name/unit
 *   PUT    /api/admin/ingredients/:id    → 200 {message}
 *   DELETE /api/admin/ingredients/:id    → 200 {message}
 *
 * Stock status logic:
 *   stock_quantity <= min_stock_level        → 'low'  (critical / red)
 *   stock_quantity <= min_stock_level * 2    → 'warn' (amber)
 *   otherwise                               → 'ok'   (green)
 *
 * Rules: GoMeal.getAuthHeader() for every fetch.
 *        window.openEdit / window.openDelete exposed for onclick in template strings.
 * ══════════════════════════════════════════════════════════
 */

'use strict';

/* ─── Constants ─── */
const ING_API  = '/api/admin/ingredients';
const DEBOUNCE = 250;

/* ─── State ─── */
let _items       = [];
let _filtered    = [];
let _stockFilter = 'all';   // 'all' | 'ok' | 'warn' | 'low'
let _search      = '';
let _editId      = null;    // null = ADD mode, number = EDIT mode
let _deleteId    = null;
let _searchTimer = null;

/* ══════════════════════════════════════════
   STOCK STATUS HELPERS
══════════════════════════════════════════ */
function stockStatus(qty, min) {
    const q = Number(qty) || 0;
    const m = Number(min) || 0;
    if (m === 0) return q === 0 ? 'low' : 'ok';
    if (q <= m)     return 'low';
    if (q <= m * 2) return 'warn';
    return 'ok';
}

const STATUS_LABEL = { ok: 'Còn hàng',      warn: 'Sắp hết',   low: 'Dưới ngưỡng' };
const STATUS_BADGE = { ok: 'sb-ok',          warn: 'sb-warn',   low: 'sb-low'       };
const ROW_CLASS    = { ok: '',               warn: 'row-warn',  low: 'row-low'      };
const BAR_CLASS    = { ok: 'bar-ok',         warn: 'bar-warn',  low: 'bar-low'      };
const QTY_CLASS    = { ok: 'q-ok',           warn: 'q-warn',    low: 'q-low'        };

function statusIcon(status) {
    if (status === 'low')  return `<i class="fas fa-circle-exclamation"   style="color:#DC2626;font-size:.9rem;animation:blink 1.5s ease infinite"></i>`;
    if (status === 'warn') return `<i class="fas fa-triangle-exclamation" style="color:#D97706;font-size:.9rem"></i>`;
    return `<i class="fas fa-check-circle" style="color:#10B981;font-size:.9rem;opacity:.3"></i>`;
}

function statusBadgeHtml(status) {
    const icons = {
        ok:   '<i class="fas fa-check-circle"         style="font-size:.63rem"></i>',
        warn: '<i class="fas fa-triangle-exclamation" style="font-size:.63rem"></i>',
        low:  '<i class="fas fa-circle-exclamation"   style="font-size:.63rem"></i>',
    };
    return `<span class="ing-sbadge ${STATUS_BADGE[status] || 'sb-ok'}">
                ${icons[status] || ''}
                ${STATUS_LABEL[status] || status}
            </span>`;
}

/* ══════════════════════════════════════════
   UTILITIES
══════════════════════════════════════════ */
function esc(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function setText(id, v) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(v);
}

function fmtNum(v) {
    const n = Number(v);
    if (isNaN(n) || n === 0) return '0';
    return n % 1 === 0
        ? n.toLocaleString('vi-VN')
        : n.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

/* ══════════════════════════════════════════
   TOAST  (no recursion, no duplicate listeners)
══════════════════════════════════════════ */
function showToast(msg, type) {
    type = type || 'success';
    const cfg = {
        success: { ico: 'circle-check',         col: '#10B981' },
        error:   { ico: 'triangle-exclamation', col: '#EF4444' },
        warning: { ico: 'triangle-exclamation', col: '#F59E0B' },
        info:    { ico: 'circle-info',           col: '#3B82F6' },
    };
    const c = cfg[type] || cfg.info;

    if (!document.getElementById('_ing_kf')) {
        const s = document.createElement('style');
        s.id = '_ing_kf';
        s.textContent =
            '@keyframes _t{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:translateX(0)}}' +
            '@keyframes blink{0%,100%{opacity:1}50%{opacity:.45}}';
        document.head.appendChild(s);
    }

    const el = document.createElement('div');
    el.style.cssText = [
        'display:flex;align-items:center;gap:10px',
        'padding:12px 18px;border-radius:12px',
        'background:#fff',
        'box-shadow:0 8px 28px rgba(0,0,0,.13)',
        'border-left:4px solid ' + c.col,
        'font-family:var(--font-primary);font-size:14px',
        'color:var(--color-gray-800);max-width:380px',
        'pointer-events:all;animation:_t .3s ease',
    ].join(';');
    el.innerHTML =
        '<i class="fas fa-' + esc(c.ico) + '" style="color:' + c.col + ';font-size:1rem;flex-shrink:0"></i>' +
        '<span style="flex:1;line-height:1.45">' + esc(msg) + '</span>' +
        '<button onclick="this.parentElement.remove()" ' +
        'style="background:none;border:none;cursor:pointer;color:var(--color-gray-400);font-size:.8rem;padding:0">' +
        '<i class="fas fa-xmark"></i></button>';

    const container = document.getElementById('toastContainer');
    if (container) container.appendChild(el);
    setTimeout(function() { el.remove(); }, 5000);
}

/* ══════════════════════════════════════════
   API FETCH — GoMeal.getAuthHeader()
══════════════════════════════════════════ */
async function apiFetch(url, opts) {
    opts = opts || {};
    const headers = Object.assign(
        { 'Content-Type': 'application/json' },
        GoMeal.getAuthHeader(),
        opts.headers || {}
    );
    const res  = await fetch(url, Object.assign({}, opts, { headers: headers }));
    const data = await res.json().catch(function() { return {}; });
    if (!res.ok) {
        const err = new Error(data.message || 'HTTP ' + res.status);
        err.status = res.status;
        err.data   = data;
        throw err;
    }
    return data;
}

/* ══════════════════════════════════════════
   loadIngredients — main data fetch
══════════════════════════════════════════ */
async function loadIngredients(silent) {
    if (!silent) renderSkeleton();
    try {
        _items = await apiFetch(ING_API) || [];
        updateSummary();
        applyFilter();
    } catch (err) {
        console.error('[Ingredients] load:', err);
        renderEmpty('Lỗi tải dữ liệu', 'Vui lòng thử lại.');
        if (!silent) showToast('Không tải được danh sách nguyên liệu: ' + err.message, 'error');
    } finally {
        const r1 = document.querySelector('#btnRefresh i');
        const r2 = document.querySelector('#btnRefresh2 i');
        if (r1) r1.classList.remove('fa-spin');
        if (r2) r2.classList.remove('fa-spin');
    }
}

/* ══════════════════════════════════════════
   SUMMARY SIDEBAR COUNTS
══════════════════════════════════════════ */
function updateSummary() {
    const c = { all: _items.length, ok: 0, warn: 0, low: 0 };
    _items.forEach(function(ing) {
        const s = stockStatus(ing.stock_quantity, ing.min_stock_level);
        c[s]++;
    });
    setText('fAllN',  c.all);
    setText('fOkN',   c.ok);
    setText('fWarnN', c.warn);
    setText('fLowN',  c.low);
    setText('headCount', c.all ? '(' + c.all + ')' : '');

    // Alert banner
    const banner = document.getElementById('alertBanner');
    const msg    = document.getElementById('alertMsg');
    if (banner) banner.classList.toggle('show', c.low > 0 || c.warn > 0);
    if (msg && (c.low > 0 || c.warn > 0)) {
        const parts = [];
        if (c.low  > 0) parts.push(c.low  + ' nguyên liệu dưới ngưỡng');
        if (c.warn > 0) parts.push(c.warn + ' sắp hết');
        msg.textContent = parts.join(' · ');
    }
}

/* ══════════════════════════════════════════
   FILTER
══════════════════════════════════════════ */
function applyFilter() {
    const q = _search.toLowerCase();
    _filtered = _items.filter(function(ing) {
        if (_stockFilter !== 'all') {
            if (stockStatus(ing.stock_quantity, ing.min_stock_level) !== _stockFilter) return false;
        }
        if (q && !ing.name.toLowerCase().includes(q)) return false;
        return true;
    });
    setText('resultCount', _filtered.length);
    renderTable();
    syncSidebarActive();
}

function syncSidebarActive() {
    document.querySelectorAll('.sb-frow').forEach(function(row) {
        row.classList.toggle('f-on', row.dataset.sf === _stockFilter);
    });
}

/* ══════════════════════════════════════════
   renderTable
══════════════════════════════════════════ */
function renderTable() {
    const tbody = document.getElementById('ingBody');
    if (!tbody) return;

    if (!_filtered.length) {
        const isFiltered = _search || _stockFilter !== 'all';
        renderEmpty(
            isFiltered ? 'Không tìm thấy nguyên liệu' : 'Kho nguyên liệu trống',
            isFiltered ? 'Thử thay đổi bộ lọc hoặc từ khoá.' : 'Nhấn "Thêm nguyên liệu" để bắt đầu.'
        );
        return;
    }

    tbody.innerHTML = _filtered.map(function(ing, idx) {
        const status  = stockStatus(ing.stock_quantity, ing.min_stock_level);
        const qty     = Number(ing.stock_quantity) || 0;
        const minQty  = Number(ing.min_stock_level) || 0;
        const delay   = Math.min(idx * 20, 200);

        // Progress bar: percentage relative to 3× min (or actual qty if larger)
        const barMax = Math.max(minQty * 3, qty, 1);
        const barPct = Math.min(100, Math.round((qty / barMax) * 100));

        return '<tr class="tr-in ' + esc(ROW_CLASS[status] || '') + '" style="animation-delay:' + delay + 'ms">' +
            '<td style="text-align:center;padding-left:var(--space-4)">' +
                statusIcon(status) +
            '</td>' +
            '<td><span class="ing-name">' + esc(ing.name) + '</span></td>' +
            '<td><span class="ing-unit">' + esc(ing.unit) + '</span></td>' +
            '<td class="td-r">' +
                '<div class="ing-qty-cell">' +
                    '<span class="ing-qty ' + esc(QTY_CLASS[status] || 'q-ok') + '">' + fmtNum(ing.stock_quantity) + '</span>' +
                    '<div class="ing-bar"><div class="ing-bar-f ' + esc(BAR_CLASS[status] || 'bar-ok') + '" style="width:' + barPct + '%"></div></div>' +
                '</div>' +
            '</td>' +
            '<td class="td-r">' +
                '<span class="ing-min">' + fmtNum(ing.min_stock_level) + '</span>' +
                '<div class="ing-min-lbl">ngưỡng tối thiểu</div>' +
            '</td>' +
            '<td>' + statusBadgeHtml(status) + '</td>' +
            '<td class="ing-act">' +
                '<button class="ing-abtn abtn-edit" onclick="openEdit(' + ing.id + ')" title="Sửa"><i class="fas fa-pen"></i></button>' +
                '<button class="ing-abtn abtn-del"  onclick="openDelete(' + ing.id + ')" title="Xoá"><i class="fas fa-trash-can"></i></button>' +
            '</td>' +
        '</tr>';
    }).join('');
}

function renderSkeleton() {
    const tbody = document.getElementById('ingBody');
    if (!tbody) return;
    tbody.innerHTML = Array(7).fill('').map(function() {
        return '<tr>' +
            '<td style="padding-left:var(--space-4)"><div class="sk" style="width:20px;height:20px;border-radius:50%"></div></td>' +
            '<td><div class="sk" style="height:14px;width:140px"></div></td>' +
            '<td><div class="sk" style="height:20px;width:50px;border-radius:99px"></div></td>' +
            '<td style="text-align:right"><div class="sk" style="height:14px;width:60px;margin-left:auto"></div></td>' +
            '<td style="text-align:right"><div class="sk" style="height:14px;width:50px;margin-left:auto"></div></td>' +
            '<td><div class="sk" style="height:22px;width:90px;border-radius:99px"></div></td>' +
            '<td></td>' +
        '</tr>';
    }).join('');
}

function renderEmpty(title, desc) {
    const tbody = document.getElementById('ingBody');
    if (!tbody) return;
    tbody.innerHTML =
        '<tr><td colspan="7">' +
            '<div class="ing-empty">' +
                '<div class="ing-empty-ico"><i class="fas fa-box-open"></i></div>' +
                '<div class="ing-empty-t">' + esc(title) + '</div>' +
                '<div class="ing-empty-d">' + esc(desc)  + '</div>' +
            '</div>' +
        '</td></tr>';
}

/* ══════════════════════════════════════════
   ADD / EDIT MODAL
══════════════════════════════════════════ */
function openAdd() {
    _editId = null;
    resetForm();
    setText('modalTitle',  'Thêm nguyên liệu mới');
    setText('submitLabel', 'Thêm nguyên liệu');
    const ico = document.getElementById('modalIcon');
    if (ico) ico.className = 'fas fa-plus-circle';
    openModal('ingModal');
    setTimeout(function() { document.getElementById('mName')?.focus(); }, 280);
}

function openEdit(id) {
    const ing = _items.find(function(x) { return x.id === id; });
    if (!ing) return;
    _editId = id;
    resetForm();

    const setVal = function(elId, v) {
        const el = document.getElementById(elId);
        if (el) el.value = (v != null) ? v : '';
    };
    setVal('mName',     ing.name);
    setVal('mUnit',     ing.unit);
    setVal('mStock',    ing.stock_quantity);
    setVal('mMinStock', ing.min_stock_level);

    setText('modalTitle',  'Cập nhật nguyên liệu');
    setText('submitLabel', 'Lưu thay đổi');
    const ico = document.getElementById('modalIcon');
    if (ico) ico.className = 'fas fa-pen';
    openModal('ingModal');
    setTimeout(function() { document.getElementById('mName')?.focus(); }, 280);
}

function resetForm() {
    ['mName', 'mUnit', 'mStock', 'mMinStock'].forEach(function(id) {
        const el = document.getElementById(id);
        if (el) { el.value = ''; el.classList.remove('inp-err'); }
    });
    ['errName', 'errUnit'].forEach(function(id) {
        const el = document.getElementById(id);
        if (el) el.classList.remove('show');
    });
}

function validateForm() {
    let ok = true;
    const name = (document.getElementById('mName')?.value || '').trim();
    const unit = (document.getElementById('mUnit')?.value || '').trim();
    if (!name) {
        showFieldErr('errName', 'mName', 'Vui lòng nhập tên nguyên liệu.');
        ok = false;
    } else clearFieldErr('errName', 'mName');
    if (!unit) {
        showFieldErr('errUnit', 'mUnit', 'Vui lòng nhập đơn vị.');
        ok = false;
    } else clearFieldErr('errUnit', 'mUnit');
    return ok;
}

function showFieldErr(errId, inpId, msg) {
    const err = document.getElementById(errId);
    const inp = document.getElementById(inpId);
    if (err) { err.textContent = msg; err.classList.add('show'); }
    if (inp) inp.classList.add('inp-err');
}

function clearFieldErr(errId, inpId) {
    const err = document.getElementById(errId);
    const inp = document.getElementById(inpId);
    if (err) err.classList.remove('show');
    if (inp) inp.classList.remove('inp-err');
}

/* ══════════════════════════════════════════
   submitIngredient
══════════════════════════════════════════ */
async function submitIngredient() {
    if (!validateForm()) return;

    const payload = {
        name:            (document.getElementById('mName')?.value     || '').trim(),
        unit:            (document.getElementById('mUnit')?.value     || '').trim(),
        stock_quantity:  parseFloat(document.getElementById('mStock')?.value)    || 0,
        min_stock_level: parseFloat(document.getElementById('mMinStock')?.value) || 0,
    };

    const btn = document.getElementById('btnSubmit');
    setBtn(btn, true, '<i class="fas fa-spinner fa-spin"></i> Đang lưu...');

    try {
        if (_editId === null) {
            await apiFetch(ING_API, { method: 'POST', body: JSON.stringify(payload) });
            showToast('Đã thêm nguyên liệu "' + payload.name + '".', 'success');
        } else {
            await apiFetch(ING_API + '/' + _editId, { method: 'PUT', body: JSON.stringify(payload) });
            showToast('Đã cập nhật "' + payload.name + '".', 'success');
        }
        closeModal('ingModal');
        await loadIngredients(true);
    } catch (err) {
        showToast('Lỗi lưu nguyên liệu: ' + err.message, 'error');
    } finally {
        const lbl = _editId ? 'Lưu thay đổi' : 'Thêm nguyên liệu';
        setBtn(btn, false, '<i class="fas fa-floppy-disk"></i> <span id="submitLabel">' + lbl + '</span>');
    }
}

/* ══════════════════════════════════════════
   DELETE
══════════════════════════════════════════ */
function openDelete(id) {
    const ing = _items.find(function(x) { return x.id === id; });
    if (!ing) return;
    _deleteId = id;
    setText('delIngName', ing.name + '  (' + ing.unit + ')');
    openModal('deleteModal');
}

async function confirmDelete() {
    if (!_deleteId) return;
    const name = (_items.find(function(x) { return x.id === _deleteId; }) || {}).name || '';
    const btn  = document.getElementById('delConfirm');
    setBtn(btn, true, '<i class="fas fa-spinner fa-spin"></i> Đang xoá...');
    try {
        await apiFetch(ING_API + '/' + _deleteId, { method: 'DELETE' });
        showToast('Đã xoá nguyên liệu "' + name + '".', 'success');
        closeModal('deleteModal');
        _deleteId = null;
        await loadIngredients(true);
    } catch (err) {
        showToast('Lỗi xoá: ' + err.message, 'error');
        closeModal('deleteModal');
        _deleteId = null;
    } finally {
        setBtn(btn, false, '<i class="fas fa-trash"></i> Xoá');
    }
}

/* ══════════════════════════════════════════
   MODAL HELPERS
══════════════════════════════════════════ */
function openModal(id) {
    const el = document.getElementById(id);
    if (el) requestAnimationFrame(function() { el.classList.add('active'); });
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
}

function setBtn(btn, disabled, html) {
    if (!btn) return;
    btn.disabled = disabled;
    btn.innerHTML = html;
}

/* ══════════════════════════════════════════
   INIT  (single DOMContentLoaded — no duplicate listeners)
══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function() {

    // Initial load
    loadIngredients(false);

    // Refresh
    function doRefresh() {
        const i1 = document.querySelector('#btnRefresh i');
        const i2 = document.querySelector('#btnRefresh2 i');
        if (i1) i1.classList.add('fa-spin');
        if (i2) i2.classList.add('fa-spin');
        loadIngredients(false);
    }
    document.getElementById('btnRefresh')?.addEventListener('click', doRefresh);
    document.getElementById('btnRefresh2')?.addEventListener('click', doRefresh);

    // Add buttons
    document.getElementById('btnAddTop')?.addEventListener('click',  openAdd);
    document.getElementById('btnAddSide')?.addEventListener('click', openAdd);

    // Submit (add/edit)
    document.getElementById('btnSubmit')?.addEventListener('click', submitIngredient);

    // Enter key inside form fields
    ['mName', 'mUnit', 'mStock', 'mMinStock'].forEach(function(id) {
        document.getElementById(id)?.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') submitIngredient();
        });
    });

    // Clear errors on typing
    document.getElementById('mName')?.addEventListener('input', function() { clearFieldErr('errName', 'mName'); });
    document.getElementById('mUnit')?.addEventListener('input', function() { clearFieldErr('errUnit', 'mUnit'); });

    // Close add/edit modal
    document.getElementById('ingModalClose')?.addEventListener('click',  function() { closeModal('ingModal'); });
    document.getElementById('ingModalCancel')?.addEventListener('click', function() { closeModal('ingModal'); });
    document.getElementById('ingModal')?.addEventListener('click', function(e) {
        if (e.target.id === 'ingModal') closeModal('ingModal');
    });

    // Delete modal
    document.getElementById('delModalClose')?.addEventListener('click', function() { closeModal('deleteModal'); });
    document.getElementById('delCancel')?.addEventListener('click',     function() { closeModal('deleteModal'); });
    document.getElementById('deleteModal')?.addEventListener('click', function(e) {
        if (e.target.id === 'deleteModal') closeModal('deleteModal');
    });
    document.getElementById('delConfirm')?.addEventListener('click', confirmDelete);

    // Sidebar stock filter rows
    document.querySelectorAll('.sb-frow').forEach(function(row) {
        row.addEventListener('click', function() {
            _stockFilter = row.dataset.sf;
            applyFilter();
        });
    });

    // Search — topbar + sidebar, debounced
    function handleSearch(val) {
        _search = val.trim();
        applyFilter();
    }
    ['topbarSearch', 'searchInput'].forEach(function(id) {
        document.getElementById(id)?.addEventListener('input', function(e) {
            clearTimeout(_searchTimer);
            _searchTimer = setTimeout(function() { handleSearch(e.target.value); }, DEBOUNCE);
        });
    });

    // ESC key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeModal('ingModal');
            closeModal('deleteModal');
        }
    });
});

/* ══════════════════════════════════════════
   EXPOSE for inline onclick in template strings
══════════════════════════════════════════ */
window.openEdit   = openEdit;
window.openDelete = openDelete;