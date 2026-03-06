/**
 * combos.js — Admin Combo Management
 * ══════════════════════════════════════════════════════════
 * ROUTES (admin.routes.js — confirmed):
 *
 *   GET  /api/admin/combos
 *     Response: [{id, name, description, price, is_active, food_names}]
 *     food_names = GROUP_CONCAT of food names (comma-separated string)
 *
 *   POST /api/admin/combos
 *     Body:    { name*, price*, description?, food_ids: number[] }
 *     201:     { message }
 *     400:     { message }  — missing name or price
 *
 *   GET  /api/admin/foods
 *     Response: [{id, name, price, category_name, is_available, image_url, ...}]
 *     Used to populate the food picker in the create modal.
 *
 * NOTE: No PUT / DELETE routes exist for combos. Read-only after creation.
 *
 * RULES:
 *   ✓ GoMeal.getAuthHeader() on every fetch
 *   ✓ No recursive showToast
 *   ✓ All event listeners registered once in DOMContentLoaded
 *   ✓ window.removeSelectedFood exposed for fp-chip onclick
 * ══════════════════════════════════════════════════════════
 */

'use strict';

/* ─── API endpoints ─── */
const COMBO_API = '/api/admin/combos';
const FOOD_API  = '/api/admin/foods';
const DEBOUNCE  = 250;

/* ─── State ─── */
let _combos        = [];   // all combos from server
let _filtered      = [];   // after filter + search
let _foods         = [];   // all foods from server (for picker)
let _foodsFiltered = [];   // foods after picker search + category filter
let _selectedIds   = new Set();  // food ids selected in modal
let _statusFilter  = 'all';     // 'all' | 'active' | 'off'
let _search        = '';
let _fpSearch      = '';
let _fpCat         = 'all';
let _searchTimer   = null;
let _fpTimer       = null;
let _foodsLoaded   = false;

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

function fmtCurrency(v) {
    const n = Number(v) || 0;
    return n.toLocaleString('vi-VN') + '₫';
}

/* ══════════════════════════════════════════
   TOAST — no self-recursion, registered once
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

    if (!document.getElementById('_cb_kf')) {
        const s = document.createElement('style');
        s.id = '_cb_kf';
        s.textContent = '@keyframes _t{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:translateX(0)}}' +
                        '@keyframes spin{to{transform:rotate(360deg)}}';
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
    setTimeout(function() { if (el.parentElement) el.remove(); }, 5000);
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
   loadCombos
══════════════════════════════════════════ */
async function loadCombos(silent) {
    if (!silent) renderSkeleton();
    try {
        _combos = await apiFetch(COMBO_API) || [];
        updateSummary();
        applyFilter();
    } catch (err) {
        console.error('[Combos] load:', err);
        renderEmpty('Lỗi tải dữ liệu', 'Vui lòng thử lại.');
        if (!silent) showToast('Không tải được danh sách combo: ' + err.message, 'error');
    } finally {
        const r1 = document.querySelector('#btnRefresh i');
        const r2 = document.querySelector('#btnRefresh2 i');
        if (r1) r1.classList.remove('fa-spin');
        if (r2) r2.classList.remove('fa-spin');
    }
}

/* ══════════════════════════════════════════
   loadFoods (for picker — called once on first modal open)
══════════════════════════════════════════ */
async function loadFoods() {
    if (_foodsLoaded) return;
    try {
        _foods = await apiFetch(FOOD_API) || [];
        _foodsLoaded = true;
        buildCategoryTabs();
        applyFpFilter();
    } catch (err) {
        console.error('[Combos] loadFoods:', err);
        const grid = document.getElementById('fpGrid');
        if (grid) grid.innerHTML =
            '<div style="grid-column:1/-1;font-size:var(--text-sm);color:var(--color-error)">' +
            '<i class="fas fa-triangle-exclamation"></i> Không tải được danh sách món: ' + esc(err.message) + '</div>';
    }
}

/* ══════════════════════════════════════════
   SUMMARY SIDEBAR
══════════════════════════════════════════ */
function updateSummary() {
    const c = { all: _combos.length, active: 0, off: 0 };
    _combos.forEach(function(cb) {
        if (cb.is_active == 1 || cb.is_active === true) c.active++;
        else c.off++;
    });
    setText('fsAllN',    c.all);
    setText('fsActiveN', c.active);
    setText('fsOffN',    c.off);
    setText('headCount', c.all ? '(' + c.all + ')' : '');
}

/* ══════════════════════════════════════════
   FILTER
══════════════════════════════════════════ */
function applyFilter() {
    const q = _search.toLowerCase();
    _filtered = _combos.filter(function(cb) {
        if (_statusFilter === 'active' && !(cb.is_active == 1 || cb.is_active === true)) return false;
        if (_statusFilter === 'off'    &&  (cb.is_active == 1 || cb.is_active === true)) return false;
        if (q && !cb.name.toLowerCase().includes(q)) return false;
        return true;
    });
    setText('resultCount', _filtered.length);
    renderCards();
    syncSidebarActive();
}

function syncSidebarActive() {
    document.querySelectorAll('[data-sf]').forEach(function(row) {
        row.classList.toggle('f-on', row.dataset.sf === _statusFilter);
    });
}

/* ══════════════════════════════════════════
   renderCards
══════════════════════════════════════════ */
function renderCards() {
    const container = document.getElementById('comboCards');
    if (!container) return;

    if (!_filtered.length) {
        const isFiltered = _search || _statusFilter !== 'all';
        renderEmpty(
            isFiltered ? 'Không tìm thấy combo' : 'Chưa có combo nào',
            isFiltered ? 'Thử thay đổi bộ lọc hoặc từ khoá.' : 'Nhấn "Tạo combo mới" để tạo combo đầu tiên.'
        );
        return;
    }

    const html = '<div class="cb-cards">' +
        _filtered.map(function(cb, idx) {
            const isActive  = cb.is_active == 1 || cb.is_active === true;
            const delay     = Math.min(idx * 40, 300);

            // food_names is GROUP_CONCAT string from DB, e.g. "Cơm chiên, Gà rán, Nước ngọt"
            const foodNames = cb.food_names
                ? cb.food_names.split(',').map(function(n) { return n.trim(); }).filter(Boolean)
                : [];

            const foodTagsHtml = foodNames.length
                ? foodNames.map(function(n) {
                    return '<span class="cb-food-tag"><i class="fas fa-utensils"></i>' + esc(n) + '</span>';
                }).join('')
                : '<span class="cb-no-foods">Chưa có món nào được gán</span>';

            return '<div class="cb-card' + (isActive ? '' : ' card-off') + '" style="animation-delay:' + delay + 'ms">' +
                '<div class="cb-card-bar"></div>' +
                '<div class="cb-card-body">' +

                    '<div class="cb-card-header">' +
                        '<div>' +
                            '<div class="cb-card-name">' + esc(cb.name) + '</div>' +
                            (cb.description
                                ? '<div class="cb-card-desc">' + esc(cb.description) + '</div>'
                                : '') +
                        '</div>' +
                        '<span class="cb-active-badge ' + (isActive ? 'cab-on' : 'cab-off') + '">' +
                            '<i class="fas ' + (isActive ? 'fa-circle-check' : 'fa-circle-xmark') + '" style="font-size:.65rem"></i>' +
                            (isActive ? 'Đang bán' : 'Tạm ẩn') +
                        '</span>' +
                    '</div>' +

                    '<div class="cb-price-row">' +
                        '<span class="cb-price-num">' + (Number(cb.price) || 0).toLocaleString('vi-VN') + '</span>' +
                        '<span class="cb-price-unit">₫</span>' +
                    '</div>' +

                    '<div class="cb-foods-section">' +
                        '<div class="cb-foods-hd"><i class="fas fa-utensils"></i> Món trong combo ' +
                            (foodNames.length ? '(' + foodNames.length + ')' : '') +
                        '</div>' +
                        '<div class="cb-food-tags">' + foodTagsHtml + '</div>' +
                    '</div>' +

                '</div>' +
            '</div>';
        }).join('') +
    '</div>';

    container.innerHTML = html;
}

function renderSkeleton() {
    const container = document.getElementById('comboCards');
    if (!container) return;
    const skCards = Array(6).fill('').map(function() {
        return '<div class="cb-card" style="animation:none">' +
            '<div style="height:4px;background:var(--color-gray-100)"></div>' +
            '<div class="cb-card-body" style="gap:var(--space-3)">' +
                '<div style="display:flex;justify-content:space-between">' +
                    '<div class="sk" style="height:16px;width:130px"></div>' +
                    '<div class="sk" style="height:22px;width:70px;border-radius:99px"></div>' +
                '</div>' +
                '<div class="sk" style="height:36px;width:100px"></div>' +
                '<div style="display:flex;flex-wrap:wrap;gap:6px">' +
                    '<div class="sk" style="height:22px;width:70px;border-radius:99px"></div>' +
                    '<div class="sk" style="height:22px;width:90px;border-radius:99px"></div>' +
                    '<div class="sk" style="height:22px;width:60px;border-radius:99px"></div>' +
                '</div>' +
            '</div>' +
        '</div>';
    }).join('');
    container.innerHTML = '<div class="cb-cards">' + skCards + '</div>';
}

function renderEmpty(title, desc) {
    const container = document.getElementById('comboCards');
    if (!container) return;
    container.innerHTML =
        '<div class="cb-empty">' +
            '<div class="cb-empty-ico"><i class="fas fa-boxes-stacked"></i></div>' +
            '<div class="cb-empty-t">' + esc(title) + '</div>' +
            '<div class="cb-empty-d">' + esc(desc) + '</div>' +
        '</div>';
}

/* ══════════════════════════════════════════
   FOOD PICKER — category tabs
══════════════════════════════════════════ */
function buildCategoryTabs() {
    const tabsEl = document.getElementById('fpCatTabs');
    if (!tabsEl) return;

    const cats = [];
    const seen = {};
    _foods.forEach(function(f) {
        if (f.category_name && !seen[f.category_name]) {
            seen[f.category_name] = true;
            cats.push(f.category_name);
        }
    });

    // Keep 'all' button + add category buttons
    const extra = cats.map(function(cat) {
        return '<button type="button" class="fp-cat-btn" data-cat="' + esc(cat) + '">' + esc(cat) + '</button>';
    }).join('');

    tabsEl.innerHTML =
        '<button type="button" class="fp-cat-btn cat-on" data-cat="all">Tất cả</button>' +
        extra;

    // Delegate click once — handler attached after building
    tabsEl.addEventListener('click', function(e) {
        const btn = e.target.closest('.fp-cat-btn');
        if (!btn) return;
        document.querySelectorAll('.fp-cat-btn').forEach(function(b) { b.classList.remove('cat-on'); });
        btn.classList.add('cat-on');
        _fpCat = btn.dataset.cat;
        applyFpFilter();
    });
}

/* ══════════════════════════════════════════
   FOOD PICKER — filter
══════════════════════════════════════════ */
function applyFpFilter() {
    const q = _fpSearch.toLowerCase();
    _foodsFiltered = _foods.filter(function(f) {
        if (_fpCat !== 'all' && f.category_name !== _fpCat) return false;
        if (q && !f.name.toLowerCase().includes(q)) return false;
        return true;
    });
    renderFoodGrid();
}

/* ══════════════════════════════════════════
   FOOD PICKER — render grid
══════════════════════════════════════════ */
function renderFoodGrid() {
    const grid = document.getElementById('fpGrid');
    if (!grid) return;

    if (!_foodsFiltered.length) {
        grid.innerHTML = '<div style="grid-column:1/-1;font-size:var(--text-sm);color:var(--color-gray-400);padding:var(--space-4)">Không tìm thấy món nào.</div>';
        return;
    }

    grid.innerHTML = _foodsFiltered.map(function(f) {
        const isSelected  = _selectedIds.has(f.id);
        const isUnavail   = f.is_available === 0 || f.is_available === false;
        let cls = 'fp-item';
        if (isSelected) cls += ' fp-selected';
        if (isUnavail)  cls += ' fp-unavail';

        return '<div class="' + cls + '" ' +
            'data-fid="' + f.id + '" ' +
            'title="' + esc(f.name) + (isUnavail ? ' (không có sẵn)' : '') + '">' +
            '<div class="fp-check"><i class="fas fa-check" style="font-size:.55rem"></i></div>' +
            '<div class="fp-item-name">' + esc(f.name) + '</div>' +
            '<div class="fp-item-cat">' + esc(f.category_name || '') + '</div>' +
            '<div class="fp-item-price">' + (Number(f.price) || 0).toLocaleString('vi-VN') + '₫</div>' +
        '</div>';
    }).join('');
}

/* ══════════════════════════════════════════
   FOOD PICKER — toggle selection
══════════════════════════════════════════ */
function toggleFoodItem(fid) {
    const food = _foods.find(function(f) { return f.id === fid; });
    if (!food) return;
    if (food.is_available === 0 || food.is_available === false) return;

    if (_selectedIds.has(fid)) {
        _selectedIds.delete(fid);
    } else {
        _selectedIds.add(fid);
    }
    renderFoodGrid();
    renderChips();
    updateFpCount();
    clearFieldErr('errFoods');
}

/* Remove a chip (exposed as window.removeSelectedFood) */
function removeSelectedFood(fid) {
    _selectedIds.delete(fid);
    renderFoodGrid();
    renderChips();
    updateFpCount();
}

function updateFpCount() {
    const el = document.getElementById('fpCount');
    if (el) el.textContent = _selectedIds.size + ' món đã chọn';
}

function renderChips() {
    const chips = document.getElementById('fpChips');
    if (!chips) return;
    if (!_selectedIds.size) {
        chips.innerHTML = '<span class="fp-no-sel">Chưa chọn món nào</span>';
        return;
    }
    chips.innerHTML = Array.from(_selectedIds).map(function(fid) {
        const food = _foods.find(function(f) { return f.id === fid; });
        if (!food) return '';
        return '<span class="fp-chip">' +
            esc(food.name) +
            '<button class="fp-chip-x" onclick="removeSelectedFood(' + fid + ')" title="Bỏ chọn">' +
            '<i class="fas fa-xmark"></i></button>' +
        '</span>';
    }).join('');
}

/* ══════════════════════════════════════════
   FORM HELPERS
══════════════════════════════════════════ */
function resetForm() {
    ['mCbName', 'mCbPrice', 'mCbDesc'].forEach(function(id) {
        const el = document.getElementById(id);
        if (el) { el.value = ''; el.classList.remove('inp-err'); }
    });
    ['errCbName', 'errCbPrice'].forEach(function(id) {
        const el = document.getElementById(id);
        if (el) el.classList.remove('show');
    });
    clearFieldErr('errFoods');
    const pp = document.getElementById('pricePreview');
    if (pp) pp.textContent = '';

    // Reset food picker
    _selectedIds.clear();
    _fpSearch = '';
    _fpCat = 'all';
    const fpInp = document.getElementById('fpSearch');
    if (fpInp) fpInp.value = '';
    document.querySelectorAll('.fp-cat-btn').forEach(function(b) {
        b.classList.toggle('cat-on', b.dataset.cat === 'all');
    });
    updateFpCount();
    renderChips();
    if (_foodsLoaded) {
        applyFpFilter();
    }
}

function showFieldErr(errId, inpId, msg) {
    const err = document.getElementById(errId);
    const inp = inpId ? document.getElementById(inpId) : null;
    if (err) { err.textContent = msg; err.classList.add('show'); }
    if (inp) inp.classList.add('inp-err');
}

function clearFieldErr(errId, inpId) {
    const err = document.getElementById(errId);
    const inp = inpId ? document.getElementById(inpId) : null;
    if (err) err.classList.remove('show');
    if (inp) inp.classList.remove('inp-err');
}

function validateForm() {
    let ok = true;
    const name  = (document.getElementById('mCbName')?.value  || '').trim();
    const price = parseFloat(document.getElementById('mCbPrice')?.value);

    if (!name) {
        showFieldErr('errCbName', 'mCbName', 'Vui lòng nhập tên combo.'); ok = false;
    } else clearFieldErr('errCbName', 'mCbName');

    if (!price || price < 1000) {
        showFieldErr('errCbPrice', 'mCbPrice', 'Vui lòng nhập giá hợp lệ (tối thiểu 1,000₫).'); ok = false;
    } else clearFieldErr('errCbPrice', 'mCbPrice');

    if (_selectedIds.size === 0) {
        showFieldErr('errFoods', null, 'Vui lòng chọn ít nhất 1 món ăn.'); ok = false;
    } else clearFieldErr('errFoods', null);

    return ok;
}

/* ══════════════════════════════════════════
   submitCombo
══════════════════════════════════════════ */
async function submitCombo() {
    if (!validateForm()) return;

    // food_ids must be array of integers
    const payload = {
        name:        (document.getElementById('mCbName')?.value  || '').trim(),
        price:       parseFloat(document.getElementById('mCbPrice')?.value) || 0,
        description: (document.getElementById('mCbDesc')?.value  || '').trim() || null,
        food_ids:    Array.from(_selectedIds),   // e.g. [1, 2, 5]
    };

    const btn = document.getElementById('btnComboSubmit');
    setBtn(btn, true, '<i class="fas fa-spinner fa-spin"></i> Đang tạo...');

    try {
        await apiFetch(COMBO_API, { method: 'POST', body: JSON.stringify(payload) });
        showToast('Đã tạo combo "' + payload.name + '" với ' + payload.food_ids.length + ' món!', 'success');
        closeModal('comboModal');
        await loadCombos(true);
    } catch (err) {
        if (err.status === 400) {
            showToast((err.data && err.data.message) || 'Dữ liệu không hợp lệ.', 'error');
        } else {
            showToast('Lỗi tạo combo: ' + err.message, 'error');
        }
    } finally {
        setBtn(btn, false, '<i class="fas fa-boxes-stacked"></i> Tạo combo');
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
   INIT — single DOMContentLoaded
══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function() {

    // Initial data load
    loadCombos(false);

    // Refresh
    function doRefresh() {
        const i1 = document.querySelector('#btnRefresh i');
        const i2 = document.querySelector('#btnRefresh2 i');
        if (i1) i1.classList.add('fa-spin');
        if (i2) i2.classList.add('fa-spin');
        loadCombos(false);
    }
    document.getElementById('btnRefresh')?.addEventListener('click',  doRefresh);
    document.getElementById('btnRefresh2')?.addEventListener('click', doRefresh);

    // Open modal — lazy load foods on first open
    function openAddModal() {
        resetForm();
        openModal('comboModal');
        loadFoods();   // no-op if already loaded
        setTimeout(function() { document.getElementById('mCbName')?.focus(); }, 280);
    }
    document.getElementById('btnAddTop')?.addEventListener('click',  openAddModal);
    document.getElementById('btnAddSide')?.addEventListener('click', openAddModal);

    // Submit
    document.getElementById('btnComboSubmit')?.addEventListener('click', submitCombo);

    // Close modal
    document.getElementById('comboModalClose')?.addEventListener('click',  function() { closeModal('comboModal'); });
    document.getElementById('comboModalCancel')?.addEventListener('click', function() { closeModal('comboModal'); });
    document.getElementById('comboModal')?.addEventListener('click', function(e) {
        if (e.target.id === 'comboModal') closeModal('comboModal');
    });

    // Food picker grid — event delegation (handles dynamic items)
    document.getElementById('fpGrid')?.addEventListener('click', function(e) {
        const item = e.target.closest('.fp-item');
        if (!item) return;
        const fid = parseInt(item.dataset.fid, 10);
        if (!isNaN(fid)) toggleFoodItem(fid);
    });

    // Food picker search
    document.getElementById('fpSearch')?.addEventListener('input', function(e) {
        clearTimeout(_fpTimer);
        const val = e.target.value;
        _fpTimer = setTimeout(function() {
            _fpSearch = val.trim();
            applyFpFilter();
        }, 200);
    });

    // Price preview
    document.getElementById('mCbPrice')?.addEventListener('input', function() {
        clearFieldErr('errCbPrice', 'mCbPrice');
        const n = parseFloat(this.value) || 0;
        const pp = document.getElementById('pricePreview');
        if (pp) pp.textContent = n > 0 ? n.toLocaleString('vi-VN') + ' ₫' : '';
    });

    // Clear name error on input
    document.getElementById('mCbName')?.addEventListener('input', function() {
        clearFieldErr('errCbName', 'mCbName');
    });

    // Sidebar status filter
    document.querySelectorAll('[data-sf]').forEach(function(row) {
        row.addEventListener('click', function() {
            _statusFilter = row.dataset.sf;
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
            const val = e.target.value;
            _searchTimer = setTimeout(function() { handleSearch(val); }, DEBOUNCE);
        });
    });

    // ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeModal('comboModal');
    });
});

/* ══════════════════════════════════════════
   EXPOSE for inline onclick in chips
══════════════════════════════════════════ */
window.removeSelectedFood = removeSelectedFood;