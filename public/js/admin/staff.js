/**
 * staff.js — Admin Staff Management
 * ══════════════════════════════════════════════════════════
 * ROUTES (admin.routes.js - confirmed):
 *   GET  /api/admin/staff  → getAllStaff
 *     Response: [{id, user_id, role_id, employee_code, hire_date, salary,
 *                 name, email, phone_number, role_name}]
 *
 *   POST /api/admin/staff  → createStaff (2-in-1 transaction)
 *     Body: { name*, email*, password*, phone_number?,
 *             role_id?, employee_code?, hire_date?, salary? }
 *     201 → { message }
 *     409 → duplicate email
 *     400 → missing required fields
 *
 * NOTE: No PUT / DELETE route exists in backend. Delete modal is
 *       present in UI but will show an informative toast if triggered.
 *
 * RULES:
 *   ✓ GoMeal.getAuthHeader()  (NOT getAuthHeaders)
 *   ✓ id="admin-sidebar-container" in HTML
 *   ✓ window.openDeleteModal exposed for inline onclick
 * ══════════════════════════════════════════════════════════
 */

'use strict';

/* ─── Config ─── */
const STAFF_API = '/api/admin/staff';
const DEBOUNCE  = 250;

/* ─── Role master data (mapped from role_name returned by SQL JOIN) ─── */
const ROLE_MAP = {
    // Keys: lowercased role_name values from DB
    'quản lý':     { key:'manager', label:'Quản lý',  icon:'fa-user-tie',      badge:'b-manager', avaBg:'#FEF3C7', avaClr:'#D97706' },
    'manager':     { key:'manager', label:'Quản lý',  icon:'fa-user-tie',      badge:'b-manager', avaBg:'#FEF3C7', avaClr:'#D97706' },
    'thu ngân':    { key:'cashier', label:'Thu ngân', icon:'fa-cash-register', badge:'b-cashier', avaBg:'#D1FAE5', avaClr:'#059669' },
    'cashier':     { key:'cashier', label:'Thu ngân', icon:'fa-cash-register', badge:'b-cashier', avaBg:'#D1FAE5', avaClr:'#059669' },
    'phục vụ':     { key:'waiter',  label:'Phục vụ',  icon:'fa-concierge-bell',badge:'b-waiter',  avaBg:'#DBEAFE', avaClr:'#2563EB' },
    'waiter':      { key:'waiter',  label:'Phục vụ',  icon:'fa-concierge-bell',badge:'b-waiter',  avaBg:'#DBEAFE', avaClr:'#2563EB' },
    'phục vụ bàn': { key:'waiter',  label:'Phục vụ',  icon:'fa-concierge-bell',badge:'b-waiter',  avaBg:'#DBEAFE', avaClr:'#2563EB' },
};
const ROLE_DEFAULT = { key:'default', label:'Chưa phân công', icon:'fa-user', badge:'b-default', avaBg:'#F3F4F6', avaClr:'#6B7280' };

function roleOf(roleName) {
    if (!roleName) return ROLE_DEFAULT;
    return ROLE_MAP[roleName.trim().toLowerCase()] || { ...ROLE_DEFAULT, label: roleName };
}

/* ─── State ─── */
let _staff      = [];
let _filtered   = [];
let _roleFilter = 'all';
let _search     = '';
let _deleteId   = null;
let _searchTimer = null;

/* ═══════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════ */
function esc(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function setText(id, v) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(v);
}

function fmtSalary(v) {
    const n = Number(v);
    return n > 0 ? n.toLocaleString('vi-VN') + '₫' : '--';
}

function fmtDate(d) {
    if (!d) return '';
    try { return new Date(d).toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric' }); }
    catch { return String(d); }
}

/** Lấy chữ viết tắt từ họ tên để hiển thị avatar */
function initials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ═══════════════════════════════════════════
   TOAST
═══════════════════════════════════════════ */
function toast(msg, type = 'success') {
    const cfg = {
        success: { ico:'circle-check',         col:'#10B981' },
        error:   { ico:'triangle-exclamation', col:'#EF4444' },
        warning: { ico:'triangle-exclamation', col:'#F59E0B' },
        info:    { ico:'circle-info',           col:'#3B82F6' },
    };
    const { ico, col } = cfg[type] || cfg.info;

    // Inject keyframe once
    if (!document.getElementById('_sp_toast_kf')) {
        const s = document.createElement('style');
        s.id = '_sp_toast_kf';
        s.textContent = '@keyframes _toastIn{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:translateX(0)}}';
        document.head.appendChild(s);
    }

    const el = document.createElement('div');
    el.style.cssText = [
        'display:flex;align-items:center;gap:10px',
        'padding:12px 18px;border-radius:12px',
        'background:var(--color-white)',
        'box-shadow:0 8px 28px rgba(0,0,0,.13)',
        `border-left:4px solid ${col}`,
        'font-family:var(--font-primary);font-size:14px',
        'color:var(--color-gray-800);max-width:380px',
        'pointer-events:all;animation:_toastIn .3s ease',
    ].join(';');
    el.innerHTML = `
        <i class="fas fa-${esc(ico)}" style="color:${col};font-size:1rem;flex-shrink:0"></i>
        <span style="flex:1;line-height:1.45">${esc(msg)}</span>
        <button onclick="this.parentElement.remove()"
                style="background:none;border:none;cursor:pointer;color:var(--color-gray-400);font-size:.8rem;padding:0">
            <i class="fas fa-xmark"></i></button>`;
    document.getElementById('toastContainer')?.appendChild(el);
    setTimeout(() => el?.remove(), 5000);
}

/* ═══════════════════════════════════════════
   API FETCH  (all requests use GoMeal.getAuthHeader())
═══════════════════════════════════════════ */
async function apiFetch(url, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...GoMeal.getAuthHeader(),
        ...(options.headers || {}),
    };
    const res  = await fetch(url, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.message || `HTTP ${res.status}`), { status: res.status, data });
    return data;
}

/* ═══════════════════════════════════════════
   LOAD  — tách hàm rõ ràng
═══════════════════════════════════════════ */
async function loadStaff(silent = false) {
    if (!silent) renderSkeleton();
    try {
        _staff = await apiFetch(STAFF_API) || [];
        updateStats();
        applyFilter();
    } catch (err) {
        console.error('[Staff] load:', err);
        if (!silent) {
            toast('Không tải được danh sách nhân viên: ' + err.message, 'error');
            renderEmpty('Lỗi tải dữ liệu', 'Vui lòng thử lại.');
        }
    } finally {
        document.querySelector('#btnRefresh i')?.classList.remove('fa-spin');
    }
}

/* ═══════════════════════════════════════════
   STATS
═══════════════════════════════════════════ */
function updateStats() {
    const c = { all: _staff.length, manager: 0, cashier: 0, waiter: 0 };
    _staff.forEach(s => {
        const key = roleOf(s.role_name).key;
        if (key in c) c[key]++;
    });
    setText('scAllN',     c.all);
    setText('scManagerN', c.manager);
    setText('scCashierN', c.cashier);
    setText('scWaiterN',  c.waiter);
    setText('headCount',  c.all ? `(${c.all})` : '');
}

/* ═══════════════════════════════════════════
   FILTER
═══════════════════════════════════════════ */
function applyFilter() {
    const q = _search.toLowerCase();
    _filtered = _staff.filter(s => {
        if (_roleFilter !== 'all' && roleOf(s.role_name).key !== _roleFilter) return false;
        if (q) {
            const hay = [s.name, s.email, s.employee_code, s.role_name]
                .filter(Boolean).join(' ').toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });
    setText('resultCount', _filtered.length);
    renderStaff();
    syncPills();
    syncStatCards();
}

function syncPills() {
    document.querySelectorAll('.sp-pill').forEach(p => {
        p.classList.toggle('p-on', p.dataset.rf === _roleFilter);
    });
}

function syncStatCards() {
    document.querySelectorAll('.sp-stat').forEach(c => {
        c.classList.toggle('st-on', c.dataset.f === _roleFilter);
    });
}

/* ═══════════════════════════════════════════
   RENDER  — tách hàm rõ ràng
═══════════════════════════════════════════ */
function renderStaff() {
    const tbody = document.getElementById('staffBody');
    if (!tbody) return;

    if (!_filtered.length) {
        renderEmpty(
            _search || _roleFilter !== 'all' ? 'Không tìm thấy nhân viên' : 'Chưa có nhân viên nào',
            _search || _roleFilter !== 'all'
                ? 'Thử thay đổi bộ lọc hoặc từ khoá tìm kiếm.'
                : 'Nhấn "Thêm nhân viên" để bắt đầu xây dựng đội ngũ.'
        );
        return;
    }

    tbody.innerHTML = _filtered.map((s, idx) => {
        const role  = roleOf(s.role_name);
        const inits = initials(s.name);
        const delay = Math.min(idx * 25, 200);

        return `
        <tr class="tr-in" style="animation-delay:${delay}ms">
            <td style="padding-left:var(--space-5)">
                <div class="sp-ava" style="background:${esc(role.avaBg)};color:${esc(role.avaClr)}">
                    ${esc(inits)}
                </div>
            </td>
            <td>
                <span class="sp-name">${esc(s.name)}</span>
                ${s.employee_code
                    ? `<span class="sp-code">${esc(s.employee_code)}</span>`
                    : ''}
            </td>
            <td>
                <span class="sp-email" title="${esc(s.email)}">
                    <i class="fas fa-envelope" style="font-size:.55rem;flex-shrink:0"></i>
                    ${esc(s.email)}
                </span>
            </td>
            <td>
                <span class="sp-badge ${esc(role.badge)}">
                    <i class="fas ${esc(role.icon)}" style="font-size:.65rem"></i>
                    ${esc(role.label)}
                </span>
            </td>
            <td>
                <span class="sp-date">
                    ${s.hire_date
                        ? `<i class="fas fa-calendar-days" style="font-size:.55rem;margin-right:3px"></i>${fmtDate(s.hire_date)}`
                        : '<span style="color:var(--color-gray-300)">--</span>'}
                </span>
            </td>
            <td>
                <span class="sp-sal">${fmtSalary(s.salary)}</span>
                ${Number(s.salary) > 0 ? `<span class="sp-sals">/tháng</span>` : ''}
            </td>
            <td style="text-align:center">
                <button class="sp-delbtn" onclick="openDeleteModal(${s.id})"
                        title="Xoá hồ sơ nhân viên">
                    <i class="fas fa-trash-can"></i>
                </button>
            </td>
        </tr>`;
    }).join('');
}

function renderEmpty(title, desc) {
    const tbody = document.getElementById('staffBody');
    if (!tbody) return;
    tbody.innerHTML = `
        <tr><td colspan="7">
            <div class="sp-empty">
                <div class="sp-empty-ico"><i class="fas fa-users-slash"></i></div>
                <div class="sp-empty-t">${esc(title)}</div>
                <div class="sp-empty-d">${esc(desc)}</div>
            </div>
        </td></tr>`;
}

function renderSkeleton() {
    const tbody = document.getElementById('staffBody');
    if (!tbody) return;
    tbody.innerHTML = Array(5).fill('').map(() => `
        <tr>
            <td style="padding-left:var(--space-5)">
                <div class="sk" style="width:40px;height:40px;border-radius:var(--radius-xl)"></div>
            </td>
            <td><div class="sk" style="height:14px;width:120px"></div>
                <div class="sk" style="height:10px;width:80px;margin-top:5px"></div></td>
            <td><div class="sk" style="height:22px;width:150px;border-radius:99px"></div></td>
            <td><div class="sk" style="height:22px;width:80px;border-radius:99px"></div></td>
            <td><div class="sk" style="height:13px;width:90px"></div></td>
            <td><div class="sk" style="height:14px;width:75px"></div></td>
            <td></td>
        </tr>`).join('');
}

/* ═══════════════════════════════════════════
   SUBMIT  — tách hàm rõ ràng
═══════════════════════════════════════════ */
async function submitStaff() {
    if (!validateForm()) return;

    const payload = {
        name:          document.getElementById('mName').value.trim(),
        email:         document.getElementById('mEmail').value.trim(),
        password:      document.getElementById('mPassword').value,
        role_id:       parseInt(document.getElementById('mRoleId').value, 10) || null,
        employee_code: document.getElementById('mEmpCode').value.trim() || null,
        hire_date:     document.getElementById('mHireDate').value || null,
        salary:        parseInt(document.getElementById('mSalary').value, 10) || null,
    };

    const btn = document.getElementById('btnSubmit');
    setBtn(btn, true, '<i class="fas fa-spinner fa-spin"></i> Đang tạo...');

    try {
        await apiFetch(STAFF_API, { method: 'POST', body: JSON.stringify(payload) });
        toast(`✅ Nhân viên "${payload.name}" đã được tạo thành công!`, 'success');
        closeModal('addModal');
        resetForm();
        await loadStaff(true);
    } catch (err) {
        if (err.status === 409) {
            showErr('errEmail', 'Email này đã được sử dụng bởi tài khoản khác.');
            document.getElementById('mEmail')?.focus();
        } else if (err.status === 400) {
            toast(err.data?.message || 'Dữ liệu không hợp lệ, kiểm tra lại.', 'error');
        } else {
            toast('Lỗi hệ thống: ' + err.message, 'error');
        }
    } finally {
        setBtn(btn, false, '<i class="fas fa-user-plus"></i> Tạo nhân viên');
    }
}

/* ═══════════════════════════════════════════
   DELETE  — tách hàm rõ ràng
   NOTE: Backend chưa có route DELETE /staff/:id
   (chỉ có GET + POST trong admin.routes.js).
   Hàm openDeleteModal() hiện modal để xác nhận,
   confirmDelete() sẽ thử gọi và báo lỗi rõ ràng nếu chưa có route.
═══════════════════════════════════════════ */
function openDeleteModal(id) {
    const s = _staff.find(x => x.id === id);
    if (!s) return;
    _deleteId = id;

    const role  = roleOf(s.role_name);
    const inits = initials(s.name);

    const ava = document.getElementById('delAva');
    if (ava) {
        ava.textContent      = inits;
        ava.style.background = role.avaBg;
        ava.style.color      = role.avaClr;
    }
    setText('delName',  s.name);
    setText('delEmail', s.email);

    const badge = document.getElementById('delBadge');
    if (badge) {
        badge.innerHTML = `<span class="sp-badge ${esc(role.badge)}">
            <i class="fas ${esc(role.icon)}" style="font-size:.65rem"></i>
            ${esc(role.label)}
        </span>`;
    }

    openModal('deleteModal');
}

async function confirmDelete() {
    if (!_deleteId) return;
    const s   = _staff.find(x => x.id === _deleteId);
    const btn = document.getElementById('delConfirm');
    setBtn(btn, true, '<i class="fas fa-spinner fa-spin"></i> Đang xoá...');

    try {
        await apiFetch(`${STAFF_API}/${_deleteId}`, { method: 'DELETE' });
        toast(`🗑️ Đã xoá hồ sơ nhân viên ${s?.name || ''}.`, 'success');
        closeModal('deleteModal');
        _deleteId = null;
        await loadStaff(true);
    } catch (err) {
        if (err.status === 404) {
            toast('Tính năng xoá chưa được kích hoạt trong backend (chưa có route DELETE /staff/:id).', 'warning');
        } else {
            toast('Lỗi xoá nhân viên: ' + err.message, 'error');
        }
        closeModal('deleteModal');
        _deleteId = null;
    } finally {
        setBtn(btn, false, '<i class="fas fa-trash"></i> Xoá nhân viên');
    }
}

/* ═══════════════════════════════════════════
   FORM VALIDATION
═══════════════════════════════════════════ */
function validateForm() {
    let ok = true;

    const name = document.getElementById('mName')?.value.trim();
    if (!name) { showErr('errName', 'Vui lòng nhập họ tên.'); ok = false; }
    else clearErr('errName');

    const email = document.getElementById('mEmail')?.value.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showErr('errEmail', 'Vui lòng nhập địa chỉ email hợp lệ.'); ok = false;
    } else clearErr('errEmail');

    const pw = document.getElementById('mPassword')?.value;
    if (!pw || pw.length < 8) { showErr('errPassword', 'Mật khẩu phải có ít nhất 8 ký tự.'); ok = false; }
    else clearErr('errPassword');

    if (!document.getElementById('mRoleId')?.value) {
        showErr('errRole', 'Vui lòng chọn vai trò.'); ok = false;
    } else clearErr('errRole');

    return ok;
}

function showErr(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    const inp = el.previousElementSibling;
    if (inp?.classList?.contains('m-inp') || inp?.tagName === 'INPUT') inp.classList.add('inp-err');
}

function clearErr(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('show');
    const inp = el.previousElementSibling;
    if (inp) inp.classList?.remove('inp-err');
}

/* ═══════════════════════════════════════════
   RESET FORM
═══════════════════════════════════════════ */
function resetForm() {
    ['mName','mEmail','mPassword','mEmpCode','mSalary'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const hd = document.getElementById('mHireDate');
    if (hd) hd.value = '';
    const rid = document.getElementById('mRoleId');
    if (rid) rid.value = '';

    document.querySelectorAll('.sp-rc').forEach(c => c.classList.remove('rc-on'));
    ['errName','errEmail','errPassword','errRole'].forEach(clearErr);

    // Reset pw bar
    const bar = document.getElementById('pwBar');
    if (bar) { bar.style.width = '0'; bar.style.background = ''; }
    const hint = document.getElementById('pwHint');
    if (hint) hint.textContent = 'Nhập mật khẩu để kiểm tra độ mạnh';

    // Reset eye icon
    const pw  = document.getElementById('mPassword');
    const ico = document.getElementById('pwEyeIco');
    if (pw)  pw.type      = 'password';
    if (ico) ico.className = 'fas fa-eye';

    setText('salPreview', '');
}

/* ═══════════════════════════════════════════
   PASSWORD STRENGTH
═══════════════════════════════════════════ */
function checkPwStrength(pw) {
    if (!pw) return { pct: 0, label: '', color: '' };
    let score = 0;
    if (pw.length >= 8)       score++;
    if (pw.length >= 12)      score++;
    if (/[A-Z]/.test(pw))     score++;
    if (/[0-9]/.test(pw))     score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    const levels = [
        null,
        { label:'Rất yếu',    color:'#EF4444' },
        { label:'Yếu',        color:'#F97316' },
        { label:'Trung bình', color:'#F59E0B' },
        { label:'Mạnh',       color:'#22C55E' },
        { label:'Rất mạnh 🔒',color:'#10B981' },
    ];
    const l = levels[Math.min(score, 5)] || { label:'', color:'' };
    return { pct: (score / 5) * 100, label: l.label, color: l.color };
}

/* ═══════════════════════════════════════════
   MODAL HELPERS
═══════════════════════════════════════════ */
function openModal(id) {
    const el = document.getElementById(id);
    if (el) requestAnimationFrame(() => el.classList.add('active'));
}

function closeModal(id) {
    document.getElementById(id)?.classList.remove('active');
}

function setBtn(btn, disabled, html) {
    if (!btn) return;
    btn.disabled = disabled;
    btn.innerHTML = html;
}

/* ═══════════════════════════════════════════
   INIT
═══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

    /* Initial load */
    loadStaff();

    /* Refresh */
    document.getElementById('btnRefresh')?.addEventListener('click', () => {
        document.querySelector('#btnRefresh i')?.classList.add('fa-spin');
        loadStaff();
    });

    /* Open add modal */
    document.getElementById('btnAddStaff')?.addEventListener('click', () => {
        resetForm();
        openModal('addModal');
        setTimeout(() => document.getElementById('mName')?.focus(), 300);
    });

    /* Close add modal */
    document.getElementById('addModalClose')?.addEventListener('click',  () => closeModal('addModal'));
    document.getElementById('addModalCancel')?.addEventListener('click', () => closeModal('addModal'));
    document.getElementById('addModal')?.addEventListener('click', e => {
        if (e.target.id === 'addModal') closeModal('addModal');
    });

    /* Submit */
    document.getElementById('btnSubmit')?.addEventListener('click', submitStaff);

    /* Enter key in text inputs */
    ['mName','mEmail','mEmpCode','mSalary'].forEach(id => {
        document.getElementById(id)?.addEventListener('keydown', e => {
            if (e.key === 'Enter') submitStaff();
        });
    });

    /* Role picker cards */
    document.getElementById('rolePicker')?.addEventListener('click', e => {
        const card = e.target.closest('.sp-rc');
        if (!card) return;
        document.querySelectorAll('.sp-rc').forEach(c => c.classList.remove('rc-on'));
        card.classList.add('rc-on');
        const rid = document.getElementById('mRoleId');
        if (rid) rid.value = card.dataset.rid;
        clearErr('errRole');
    });

    /* Password eye toggle */
    document.getElementById('pwEyeBtn')?.addEventListener('click', () => {
        const inp = document.getElementById('mPassword');
        const ico = document.getElementById('pwEyeIco');
        if (!inp) return;
        const show = inp.type === 'password';
        inp.type      = show ? 'text' : 'password';
        if (ico) ico.className = show ? 'fas fa-eye-slash' : 'fas fa-eye';
    });

    /* Password strength meter */
    document.getElementById('mPassword')?.addEventListener('input', e => {
        const r    = checkPwStrength(e.target.value);
        const bar  = document.getElementById('pwBar');
        const hint = document.getElementById('pwHint');
        if (bar)  { bar.style.width = (r.pct || 0) + '%'; bar.style.background = r.color || '#E5E7EB'; }
        if (hint) hint.textContent = r.label || 'Nhập mật khẩu để kiểm tra độ mạnh';
        if (e.target.value.length >= 8) clearErr('errPassword');
    });

    /* Salary preview */
    document.getElementById('mSalary')?.addEventListener('input', e => {
        const n  = parseInt(e.target.value, 10);
        const pv = document.getElementById('salPreview');
        if (pv) pv.textContent = n > 0 ? n.toLocaleString('vi-VN') + ' ₫/tháng' : '';
    });

    /* Search — both topbar + toolbar inputs, debounced */
    function handleSearch(val) {
        _search = val.trim();
        applyFilter();
    }
    ['topbarSearch', 'searchInput'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', e => {
            clearTimeout(_searchTimer);
            _searchTimer = setTimeout(() => handleSearch(e.target.value), DEBOUNCE);
        });
    });

    /* Role pills */
    document.getElementById('pillsGroup')?.addEventListener('click', e => {
        const pill = e.target.closest('.sp-pill');
        if (!pill) return;
        _roleFilter = pill.dataset.rf;
        applyFilter();
    });

    /* Stat card click → filter */
    document.querySelectorAll('.sp-stat').forEach(card => {
        card.addEventListener('click', () => {
            _roleFilter = card.dataset.f;
            applyFilter();
        });
    });

    /* Delete modal */
    document.getElementById('delClose')?.addEventListener('click',  () => closeModal('deleteModal'));
    document.getElementById('delCancel')?.addEventListener('click', () => closeModal('deleteModal'));
    document.getElementById('deleteModal')?.addEventListener('click', e => {
        if (e.target.id === 'deleteModal') closeModal('deleteModal');
    });
    document.getElementById('delConfirm')?.addEventListener('click', confirmDelete);

    /* ESC key */
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            closeModal('addModal');
            closeModal('deleteModal');
        }
    });
});

/* ═══════════════════════════════════════════
   EXPOSE for inline onclick in template literals
═══════════════════════════════════════════ */
window.openDeleteModal = openDeleteModal;