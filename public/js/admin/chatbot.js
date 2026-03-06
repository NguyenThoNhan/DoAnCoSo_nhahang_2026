/**
 * chatbot.js — Admin Chatbot Rule Management
 * ══════════════════════════════════════════════════════════
 * ROUTES (admin.routes.js — confirmed):
 *   GET    /api/admin/chatbot/rules        → [{id, keywords, response, is_active}]
 *   POST   /api/admin/chatbot/rules        → body:{keywords*, response*}  → 201 {message}
 *   PUT    /api/admin/chatbot/rules/:id    → body:{keywords*, response*, is_active} → 200 {message}
 *   DELETE /api/admin/chatbot/rules/:id    → 200 {message}
 *
 * ⚠️ CRITICAL — keywords field:
 *   DB stores keywords as a plain STRING (CSV), e.g. "giá, tiền, rẻ, bao nhiêu"
 *   ✅ When DISPLAYING: split by comma → array → .map() to render tags
 *   ✅ When SENDING:    join array back to string OR send raw input string as-is
 *   ❌ NEVER call .map() directly on the raw DB string → "keywords.map is not a function"
 *
 * RULES:
 *   ✓ GoMeal.getAuthHeader() on every fetch
 *   ✓ No recursive showToast
 *   ✓ All event listeners registered once in DOMContentLoaded
 *   ✓ window.openEdit / window.openDelete / window.toggleActive exposed for inline onclick
 * ══════════════════════════════════════════════════════════
 */

'use strict';

/* ─── Constants ─── */
const API = '/api/admin/chatbot/rules';
const DEBOUNCE = 250;

/* ─── State ─── */
let _rules        = [];   // all rules from server
let _filtered     = [];   // after filter + search
let _statusFilter = 'all'; // 'all' | 'active' | 'off'
let _search       = '';
let _editId       = null;  // null = ADD, number = EDIT
let _deleteId     = null;
let _searchTimer  = null;

/* ══════════════════════════════════════════
   KEYWORD HELPERS
   keywords field from DB is always a STRING like "giá, tiền, rẻ"
   ─────────────────────────────────────────
   parseKeywords(v) → string[]   safe to .map()
   formatKeywords(arr) → string  for sending to API
══════════════════════════════════════════ */

/**
 * Always returns a clean string array, regardless of input type.
 * Handles: undefined, null, "", "giá, tiền", ["giá","tiền"]
 */
function parseKeywords(v) {
    if (!v) return [];
    // If somehow already an array (defensive)
    if (Array.isArray(v)) {
        return v.map(function(s) { return String(s).trim(); }).filter(Boolean);
    }
    // Normal case: DB string "giá, tiền, rẻ"
    return String(v).split(',').map(function(s) { return s.trim(); }).filter(Boolean);
}

/** Join keyword array back to CSV string for API send */
function formatKeywords(arr) {
    return arr.join(', ');
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

/* ══════════════════════════════════════════
   TOAST — no self-recursion
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
        s.textContent = '@keyframes toastIn{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:translateX(0)}}';
        document.head.appendChild(s);
    }

    const el = document.createElement('div');
    el.style.cssText = [
        'display:flex;align-items:center;gap:10px',
        'padding:12px 18px;border-radius:12px',
        'background:#fff;box-shadow:0 8px 28px rgba(0,0,0,.13)',
        'border-left:4px solid ' + c.col,
        'font-family:var(--font-primary);font-size:14px',
        'color:var(--color-gray-800);max-width:380px',
        'pointer-events:all;animation:toastIn .3s ease',
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
   loadRules
══════════════════════════════════════════ */
async function loadRules(silent) {
    if (!silent) renderSkeleton();
    try {
        _rules = await apiFetch(API) || [];
        updateSummary();
        applyFilter();
    } catch (err) {
        console.error('[Chatbot] load:', err);
        renderEmpty('Lỗi tải dữ liệu', 'Vui lòng thử lại.');
        if (!silent) showToast('Không tải được danh sách quy tắc: ' + err.message, 'error');
    } finally {
        const r1 = document.querySelector('#btnRefresh i');
        const r2 = document.querySelector('#btnRefresh2 i');
        if (r1) r1.classList.remove('fa-spin');
        if (r2) r2.classList.remove('fa-spin');
    }
}

/* ══════════════════════════════════════════
   SUMMARY SIDEBAR
══════════════════════════════════════════ */
function updateSummary() {
    const c = { all: _rules.length, active: 0, off: 0 };
    _rules.forEach(function(r) {
        if (r.is_active == 1 || r.is_active === true) c.active++;
        else c.off++;
    });
    setText('fsAllN',    c.all);
    setText('fsActiveN', c.active);
    setText('fsOffN',    c.off);
    setText('headCount', c.all ? '(' + c.all + ')' : '');
    setText('botRuleCount', c.active);
}

/* ══════════════════════════════════════════
   FILTER
══════════════════════════════════════════ */
function applyFilter() {
    const q = _search.toLowerCase();
    _filtered = _rules.filter(function(r) {
        if (_statusFilter === 'active' && !(r.is_active == 1 || r.is_active === true)) return false;
        if (_statusFilter === 'off'    &&  (r.is_active == 1 || r.is_active === true)) return false;
        if (q) {
            const kwStr  = String(r.keywords  || '').toLowerCase();
            const respStr = String(r.response || '').toLowerCase();
            if (!kwStr.includes(q) && !respStr.includes(q)) return false;
        }
        return true;
    });
    setText('resultCount', _filtered.length);
    renderTable();
    syncSidebarActive();
}

function syncSidebarActive() {
    document.querySelectorAll('[data-sf]').forEach(function(row) {
        row.classList.toggle('f-on', row.dataset.sf === _statusFilter);
    });
}

/* ══════════════════════════════════════════
   renderTable
   ⚠️ keywords must go through parseKeywords() before .map()
══════════════════════════════════════════ */
function renderTable() {
    const tbody = document.getElementById('ruleBody');
    if (!tbody) return;

    if (!_filtered.length) {
        const isFiltered = _search || _statusFilter !== 'all';
        renderEmpty(
            isFiltered ? 'Không tìm thấy quy tắc' : 'Chưa có quy tắc nào',
            isFiltered ? 'Thử thay đổi bộ lọc hoặc từ khoá tìm.' : 'Nhấn "Thêm quy tắc" để dạy Bot câu đầu tiên.'
        );
        return;
    }

    tbody.innerHTML = _filtered.map(function(r, idx) {
        const isActive = r.is_active == 1 || r.is_active === true;
        const delay    = Math.min(idx * 25, 300);

        // ── CRITICAL FIX: keywords is a string from DB ──
        // parseKeywords() always returns string[] safe for .map()
        const kwArr = parseKeywords(r.keywords);
        const kwTagsHtml = kwArr.length
            ? kwArr.map(function(kw) {
                return '<span class="kw-tag"><i class="fas fa-hashtag"></i>' + esc(kw) + '</span>';
            }).join('')
            : '<span style="font-size:.65rem;color:var(--color-gray-300);font-style:italic">Chưa có từ khoá</span>';

        const responsePreview = String(r.response || '').replace(/\n/g, ' ');

        return '<tr class="' + (isActive ? '' : 'row-off') + '" style="animation-delay:' + delay + 'ms">' +
            '<td class="id-cell">#' + r.id + '</td>' +
            '<td><div class="kw-tags">' + kwTagsHtml + '</div></td>' +
            '<td><div class="resp-cell">' + esc(responsePreview) + '</div></td>' +
            '<td>' +
                '<span class="status-badge ' + (isActive ? 'sb-on' : 'sb-off') + '">' +
                    '<i class="fas ' + (isActive ? 'fa-circle-check' : 'fa-circle-xmark') + '" style="font-size:.65rem"></i>' +
                    (isActive ? 'Đang bật' : 'Đã tắt') +
                '</span>' +
            '</td>' +
            '<td>' +
                '<div class="act-btns">' +
                    '<button class="act-btn act-btn-edit" onclick="openEdit(' + r.id + ')" title="Sửa quy tắc">' +
                        '<i class="fas fa-pen"></i>' +
                    '</button>' +
                    '<button class="act-btn act-btn-tog" onclick="toggleActive(' + r.id + ')" ' +
                        'title="' + (isActive ? 'Tắt quy tắc' : 'Bật quy tắc') + '">' +
                        '<i class="fas ' + (isActive ? 'fa-toggle-on' : 'fa-toggle-off') + '"></i>' +
                    '</button>' +
                    '<button class="act-btn act-btn-del" onclick="openDelete(' + r.id + ')" title="Xoá quy tắc">' +
                        '<i class="fas fa-trash-can"></i>' +
                    '</button>' +
                '</div>' +
            '</td>' +
        '</tr>';
    }).join('');
}

function renderSkeleton() {
    const tbody = document.getElementById('ruleBody');
    if (!tbody) return;
    tbody.innerHTML = Array(6).fill('').map(function() {
        return '<tr>' +
            '<td><div class="sk" style="height:14px;width:24px"></div></td>' +
            '<td><div style="display:flex;gap:5px">' +
                '<div class="sk" style="height:20px;width:55px;border-radius:99px"></div>' +
                '<div class="sk" style="height:20px;width:45px;border-radius:99px"></div>' +
                '<div class="sk" style="height:20px;width:60px;border-radius:99px"></div>' +
            '</div></td>' +
            '<td><div class="sk" style="height:14px;width:100%;max-width:280px"></div>' +
                '<div class="sk" style="height:14px;width:60%;max-width:180px;margin-top:6px"></div></td>' +
            '<td><div class="sk" style="height:22px;width:80px;border-radius:99px"></div></td>' +
            '<td><div style="display:flex;justify-content:center;gap:6px">' +
                '<div class="sk" style="width:30px;height:30px;border-radius:8px"></div>' +
                '<div class="sk" style="width:30px;height:30px;border-radius:8px"></div>' +
                '<div class="sk" style="width:30px;height:30px;border-radius:8px"></div>' +
            '</div></td>' +
        '</tr>';
    }).join('');
}

function renderEmpty(title, desc) {
    const tbody = document.getElementById('ruleBody');
    if (!tbody) return;
    tbody.innerHTML =
        '<tr><td colspan="5">' +
            '<div class="cb-empty">' +
                '<div class="cb-empty-ico"><i class="fas fa-robot"></i></div>' +
                '<div class="cb-empty-t">' + esc(title) + '</div>' +
                '<div class="cb-empty-d">' + esc(desc)  + '</div>' +
            '</div>' +
        '</td></tr>';
}

/* ══════════════════════════════════════════
   KEYWORD PREVIEW (modal live update)
══════════════════════════════════════════ */
function updateKwPreview(rawValue) {
    const preview = document.getElementById('kwPreview');
    if (!preview) return;
    // parseKeywords handles the split correctly
    const kws = parseKeywords(rawValue);
    if (!kws.length) {
        preview.innerHTML = '<span class="kw-preview-empty">Nhập từ khoá để xem trước...</span>';
        return;
    }
    preview.innerHTML = kws.map(function(kw) {
        return '<span class="kw-preview-chip"><i class="fas fa-hashtag" style="font-size:.5rem"></i>' + esc(kw) + '</span>';
    }).join('');
}

/* ══════════════════════════════════════════
   ADD / EDIT MODAL
══════════════════════════════════════════ */
function openAdd() {
    _editId = null;
    resetForm();
    setText('modalTitle',  'Thêm quy tắc mới');
    setText('submitLabel', 'Thêm quy tắc');
    const ico = document.getElementById('modalIcon');
    if (ico) ico.className = 'fas fa-plus';
    // Hide toggle in ADD mode (is_active defaults to 1 on server)
    const toggleRow = document.getElementById('toggleRow');
    if (toggleRow) toggleRow.style.display = 'none';
    openModal('ruleModal');
    setTimeout(function() { document.getElementById('mKeywords')?.focus(); }, 280);
}

function openEdit(id) {
    const rule = _rules.find(function(r) { return r.id === id; });
    if (!rule) return;
    _editId = id;
    resetForm();

    // Populate keywords — raw string from DB goes straight into input
    const kwInp = document.getElementById('mKeywords');
    if (kwInp) {
        kwInp.value = String(rule.keywords || '');
        updateKwPreview(kwInp.value);
    }

    const respInp = document.getElementById('mResponse');
    if (respInp) respInp.value = String(rule.response || '');

    // Toggle is_active
    const toggleRow = document.getElementById('toggleRow');
    if (toggleRow) toggleRow.style.display = '';
    const chk = document.getElementById('mIsActive');
    if (chk) chk.checked = (rule.is_active == 1 || rule.is_active === true);

    setText('modalTitle',  'Chỉnh sửa quy tắc');
    setText('submitLabel', 'Lưu thay đổi');
    const ico = document.getElementById('modalIcon');
    if (ico) ico.className = 'fas fa-pen';
    openModal('ruleModal');
    setTimeout(function() { document.getElementById('mKeywords')?.focus(); }, 280);
}

function resetForm() {
    ['mKeywords', 'mResponse'].forEach(function(id) {
        const el = document.getElementById(id);
        if (el) { el.value = ''; el.classList.remove('inp-err'); }
    });
    ['errKeywords', 'errResponse'].forEach(function(id) {
        const el = document.getElementById(id);
        if (el) el.classList.remove('show');
    });
    updateKwPreview('');
    const chk = document.getElementById('mIsActive');
    if (chk) chk.checked = true;
}

function validateForm() {
    let ok = true;
    const kw   = (document.getElementById('mKeywords')?.value || '').trim();
    const resp = (document.getElementById('mResponse')?.value || '').trim();
    if (!kw) {
        showFieldErr('errKeywords', 'mKeywords', 'Vui lòng nhập ít nhất 1 từ khoá.'); ok = false;
    } else clearFieldErr('errKeywords', 'mKeywords');
    if (!resp) {
        showFieldErr('errResponse', 'mResponse', 'Vui lòng nhập câu trả lời.'); ok = false;
    } else clearFieldErr('errResponse', 'mResponse');
    return ok;
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

/* ══════════════════════════════════════════
   submitRule — POST (add) or PUT (edit)
══════════════════════════════════════════ */
async function submitRule() {
    if (!validateForm()) return;

    // keywords sent as raw input string — DB stores it as-is (CSV string)
    const keywords  = (document.getElementById('mKeywords')?.value  || '').trim();
    const response  = (document.getElementById('mResponse')?.value  || '').trim();
    const is_active = document.getElementById('mIsActive')?.checked ? 1 : 0;

    const btn = document.getElementById('btnRuleSubmit');
    setBtn(btn, true, '<i class="fas fa-spinner fa-spin"></i> Đang lưu...');

    try {
        if (_editId === null) {
            // ADD — is_active defaults to 1 on server (no need to send)
            await apiFetch(API, {
                method: 'POST',
                body: JSON.stringify({ keywords: keywords, response: response }),
            });
            // Truncate keyword string for toast (show first 30 chars)
            const kwPreview = keywords.length > 30 ? keywords.slice(0, 30) + '...' : keywords;
            showToast('Đã thêm quy tắc "' + kwPreview + '".', 'success');
        } else {
            // EDIT
            await apiFetch(API + '/' + _editId, {
                method: 'PUT',
                body: JSON.stringify({ keywords: keywords, response: response, is_active: is_active }),
            });
            showToast('Đã cập nhật quy tắc.', 'success');
        }
        closeModal('ruleModal');
        await loadRules(true);
    } catch (err) {
        if (err.status === 400) {
            showToast((err.data && err.data.message) || 'Dữ liệu không hợp lệ.', 'error');
        } else {
            showToast('Lỗi lưu quy tắc: ' + err.message, 'error');
        }
    } finally {
        const label = _editId ? 'Lưu thay đổi' : 'Thêm quy tắc';
        setBtn(btn, false,
            '<i class="fas fa-floppy-disk"></i> <span id="submitLabel">' + label + '</span>');
    }
}

/* ══════════════════════════════════════════
   toggleActive — quick toggle via PUT
══════════════════════════════════════════ */
async function toggleActive(id) {
    const rule = _rules.find(function(r) { return r.id === id; });
    if (!rule) return;
    const newActive = (rule.is_active == 1 || rule.is_active === true) ? 0 : 1;
    try {
        await apiFetch(API + '/' + id, {
            method: 'PUT',
            body: JSON.stringify({
                keywords:  String(rule.keywords || ''),
                response:  String(rule.response || ''),
                is_active: newActive,
            }),
        });
        showToast(newActive ? 'Quy tắc đã bật.' : 'Quy tắc đã tắt.', 'success');
        await loadRules(true);
    } catch (err) {
        showToast('Không thể cập nhật trạng thái: ' + err.message, 'error');
    }
}

/* ══════════════════════════════════════════
   DELETE
══════════════════════════════════════════ */
function openDelete(id) {
    const rule = _rules.find(function(r) { return r.id === id; });
    if (!rule) return;
    _deleteId = id;
    // Show first keyword (or first 40 chars of keyword string) in preview
    const kwArr    = parseKeywords(rule.keywords);
    const preview  = kwArr.length ? kwArr[0] + (kwArr.length > 1 ? ' +' + (kwArr.length - 1) : '') : String(rule.keywords || '').slice(0, 40);
    setText('delRulePreview', preview || '(không có từ khoá)');
    openModal('deleteModal');
}

async function confirmDelete() {
    if (!_deleteId) return;
    const btn = document.getElementById('delConfirm');
    setBtn(btn, true, '<i class="fas fa-spinner fa-spin"></i> Đang xoá...');
    try {
        await apiFetch(API + '/' + _deleteId, { method: 'DELETE' });
        showToast('Đã xoá quy tắc.', 'success');
        closeModal('deleteModal');
        _deleteId = null;
        await loadRules(true);
    } catch (err) {
        showToast('Lỗi xoá quy tắc: ' + err.message, 'error');
        closeModal('deleteModal');
        _deleteId = null;
    } finally {
        setBtn(btn, false, '<i class="fas fa-trash"></i> Xoá quy tắc');
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

    // Initial load
    loadRules(false);

    // Refresh
    function doRefresh() {
        const i1 = document.querySelector('#btnRefresh i');
        const i2 = document.querySelector('#btnRefresh2 i');
        if (i1) i1.classList.add('fa-spin');
        if (i2) i2.classList.add('fa-spin');
        loadRules(false);
    }
    document.getElementById('btnRefresh')?.addEventListener('click',  doRefresh);
    document.getElementById('btnRefresh2')?.addEventListener('click', doRefresh);

    // Open add modal
    document.getElementById('btnAddTop')?.addEventListener('click',  openAdd);
    document.getElementById('btnAddSide')?.addEventListener('click', openAdd);

    // Submit
    document.getElementById('btnRuleSubmit')?.addEventListener('click', submitRule);

    // Close add/edit modal
    document.getElementById('ruleModalClose')?.addEventListener('click',  function() { closeModal('ruleModal'); });
    document.getElementById('ruleModalCancel')?.addEventListener('click', function() { closeModal('ruleModal'); });
    document.getElementById('ruleModal')?.addEventListener('click', function(e) {
        if (e.target.id === 'ruleModal') closeModal('ruleModal');
    });

    // Close delete modal
    document.getElementById('delModalClose')?.addEventListener('click', function() { closeModal('deleteModal'); });
    document.getElementById('delCancel')?.addEventListener('click',     function() { closeModal('deleteModal'); });
    document.getElementById('deleteModal')?.addEventListener('click', function(e) {
        if (e.target.id === 'deleteModal') closeModal('deleteModal');
    });

    // Confirm delete
    document.getElementById('delConfirm')?.addEventListener('click', confirmDelete);

    // Live keyword preview in modal
    document.getElementById('mKeywords')?.addEventListener('input', function(e) {
        clearFieldErr('errKeywords', 'mKeywords');
        updateKwPreview(e.target.value);
    });

    // Clear response error on input
    document.getElementById('mResponse')?.addEventListener('input', function() {
        clearFieldErr('errResponse', 'mResponse');
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

    // ESC to close any open modal
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeModal('ruleModal');
            closeModal('deleteModal');
        }
    });

    // Enter in modal inputs → submit
    ['mKeywords', 'mResponse'].forEach(function(id) {
        document.getElementById(id)?.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey && id === 'mKeywords') {
                e.preventDefault();
                document.getElementById('mResponse')?.focus();
            }
        });
    });
});

/* ══════════════════════════════════════════
   EXPOSE for inline onclick in rendered rows
══════════════════════════════════════════ */
window.openEdit    = openEdit;
window.openDelete  = openDelete;
window.toggleActive = toggleActive;