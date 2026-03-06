/**
 * settings.js — Admin Settings Page
 * ══════════════════════════════════════════════════════════
 * ROUTES (admin.routes.js — confirmed):
 *   GET  /api/admin/settings
 *     Response: { id, restaurant_name, address, phone, email, opening_hours }
 *     404 if record doesn't exist yet
 *
 *   PUT  /api/admin/settings
 *     Body:     { restaurant_name, address, phone, email, opening_hours }
 *     Response: { message }        (always updates WHERE id = 1)
 *
 * RULES:
 *   ✓ GoMeal.getAuthHeader() on EVERY fetch — no public API calls
 *   ✓ No new routes created
 *   ✓ Clear function separation: loadSettings, populateForm, saveSettings, resetForm
 *   ✓ All event listeners in single DOMContentLoaded
 *   ✓ No recursive showToast
 *   ✓ Dirty-tracking to show unsaved-bar + enable/disable save buttons
 * ══════════════════════════════════════════════════════════
 */

'use strict';

/* ─── API endpoints ─── */
const SETTINGS_API = '/api/admin/settings';

/* ─── State ─── */
let _original = null;   // snapshot from server (used for reset + dirty-check)
let _isDirty  = false;  // true = form has unsaved changes

/* ── Field IDs ↔ API keys mapping ── */
const FIELDS = [
    { id: 'fName',    key: 'restaurant_name' },
    { id: 'fPhone',   key: 'phone'           },
    { id: 'fEmail',   key: 'email'           },
    { id: 'fAddress', key: 'address'         },
    { id: 'fHours',   key: 'opening_hours'   },
];

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

    // inject keyframes once
    if (!document.getElementById('_st_kf')) {
        const s = document.createElement('style');
        s.id = '_st_kf';
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
        '<i class="fas fa-' + c.ico + '" style="color:' + c.col + ';font-size:1rem;flex-shrink:0"></i>' +
        '<span style="flex:1;line-height:1.45">' + escHtml(msg) + '</span>' +
        '<button onclick="this.parentElement.remove()" ' +
        'style="background:none;border:none;cursor:pointer;color:var(--color-gray-400);font-size:.8rem;padding:0">' +
        '<i class="fas fa-xmark"></i></button>';

    const container = document.getElementById('toastContainer');
    if (container) container.appendChild(el);
    setTimeout(function() { if (el.parentElement) el.remove(); }, 5000);
}

function escHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ══════════════════════════════════════════
   API FETCH — always uses GoMeal.getAuthHeader()
   This is the CRITICAL fix: admin routes require Authorization header.
   Never call /api/user/* or public routes from this page.
══════════════════════════════════════════ */
async function apiFetch(url, opts) {
    opts = opts || {};
    const headers = Object.assign(
        { 'Content-Type': 'application/json' },
        GoMeal.getAuthHeader(),      // ← Authorization: Bearer <token>
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
   SKELETON — while loading
══════════════════════════════════════════ */
function showSkeleton() {
    FIELDS.forEach(function(f) {
        const el = document.getElementById(f.id);
        if (!el) return;
        el.disabled = true;
        el.value    = '';
    });
    setApiStatus('load', 'Đang tải...');
    setSyncBadge(false);
}

/* ══════════════════════════════════════════
   loadSettings — GET /api/admin/settings
   Uses getAuthHeader() — required for admin route
══════════════════════════════════════════ */
async function loadSettings() {
    showSkeleton();
    spinRefresh(true);

    try {
        const data = await apiFetch(SETTINGS_API);
        // data = { id:1, restaurant_name, address, phone, email, opening_hours }
        populateForm(data);
        _original = snapshot();     // save clean state for reset / dirty-check
        setDirty(false);
        setApiStatus('ok', 'Đã kết nối');
        setSyncBadge(true);
        enableForm(true);
    } catch (err) {
        console.error('[Settings] load:', err);

        if (err.status === 404) {
            // Record doesn't exist yet — still enable form so admin can fill and PUT
            _original = { restaurant_name: '', address: '', phone: '', email: '', opening_hours: '' };
            populateForm(_original);
            setDirty(false);
            setApiStatus('ok', 'Bản ghi trống');
            setSyncBadge(false);
            enableForm(true);
            showToast('Chưa có cài đặt — hãy điền thông tin và lưu để tạo mới.', 'warning');
        } else if (err.status === 401 || err.status === 403) {
            setApiStatus('err', '401 Chưa xác thực');
            showToast('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.', 'error');
        } else {
            setApiStatus('err', 'Lỗi ' + (err.status || 'kết nối'));
            showToast('Không tải được cài đặt: ' + err.message, 'error');
        }
    } finally {
        spinRefresh(false);
    }
}

/* ══════════════════════════════════════════
   populateForm — fill all inputs from API data
══════════════════════════════════════════ */
function populateForm(data) {
    FIELDS.forEach(function(f) {
        const el = document.getElementById(f.id);
        if (!el) return;
        el.value = String(data[f.key] || '');
    });
}

/* ══════════════════════════════════════════
   snapshot — read current form values into object
══════════════════════════════════════════ */
function snapshot() {
    const obj = {};
    FIELDS.forEach(function(f) {
        const el = document.getElementById(f.id);
        obj[f.key] = el ? el.value : '';
    });
    return obj;
}

/* ══════════════════════════════════════════
   isDirtyCheck — compare current form vs _original
══════════════════════════════════════════ */
function checkDirty() {
    if (!_original) return;
    const cur = snapshot();
    const dirty = FIELDS.some(function(f) {
        return cur[f.key] !== (_original[f.key] || '');
    });
    setDirty(dirty);
}

/* ══════════════════════════════════════════
   saveSettings — PUT /api/admin/settings
   Uses getAuthHeader() — required for admin route
══════════════════════════════════════════ */
async function saveSettings() {
    const payload = snapshot();

    // Client-side: restaurant_name is required
    if (!payload.restaurant_name.trim()) {
        showToast('Tên nhà hàng là bắt buộc.', 'warning');
        document.getElementById('fName')?.focus();
        return;
    }

    setSavingState(true);
    setSyncBadge(false);

    try {
        await apiFetch(SETTINGS_API, {
            method: 'PUT',
            body: JSON.stringify(payload),
        });

        _original = snapshot();   // update clean snapshot
        setDirty(false);
        setSyncBadge(true);
        showToast('Cài đặt đã được lưu thành công!', 'success');

        // Optionally update .res-name elements live (sidebar brand name)
        const nameEls = document.querySelectorAll('.res-name');
        nameEls.forEach(function(el) {
            if (payload.restaurant_name.trim()) {
                el.textContent = payload.restaurant_name.trim();
            }
        });

    } catch (err) {
        console.error('[Settings] save:', err);
        if (err.status === 401 || err.status === 403) {
            showToast('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.', 'error');
        } else {
            showToast('Lưu thất bại: ' + err.message, 'error');
        }
        setSyncBadge(false);
    } finally {
        setSavingState(false);
    }
}

/* ══════════════════════════════════════════
   resetForm — restore inputs to last loaded state
══════════════════════════════════════════ */
function resetForm() {
    if (!_original) return;
    populateForm(_original);
    setDirty(false);
    showToast('Đã khôi phục về dữ liệu ban đầu.', 'info');
}

/* ══════════════════════════════════════════
   UI STATE HELPERS
══════════════════════════════════════════ */
function enableForm(yes) {
    FIELDS.forEach(function(f) {
        const el = document.getElementById(f.id);
        if (el) el.disabled = !yes;
    });
}

function setDirty(dirty) {
    _isDirty = dirty;

    const bar   = document.getElementById('unsavedBar');
    const btnS  = document.getElementById('btnSave');
    const btnST = document.getElementById('btnSaveTop');
    const btnR  = document.getElementById('btnReset');

    if (bar) bar.classList.toggle('show', dirty);

    // Enable save buttons when dirty, disable when clean
    if (btnS)  btnS.disabled  = !dirty;
    if (btnST) btnST.disabled = !dirty;
    if (btnR)  btnR.disabled  = !dirty;
}

function setSavingState(saving) {
    const btns = [
        document.getElementById('btnSave'),
        document.getElementById('btnSaveTop'),
        document.getElementById('btnSaveMini'),
    ];
    btns.forEach(function(btn) {
        if (!btn) return;
        btn.disabled = saving;
        if (saving) {
            btn.dataset.prev = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner" style="animation:spin .8s linear infinite"></i> Đang lưu...';
        } else if (btn.dataset.prev) {
            btn.innerHTML = btn.dataset.prev;
            delete btn.dataset.prev;
        }
    });
}

function spinRefresh(on) {
    const ico = document.querySelector('#btnRefresh i');
    if (ico) ico.style.animation = on ? 'spin .8s linear infinite' : '';
}

function setApiStatus(state, label) {
    const badge = document.getElementById('apiBadge');
    const text  = document.getElementById('apiBadgeText');
    if (!badge || !text) return;
    badge.className = 'sb-badge ' + ({ ok: 'sb-ok', err: 'sb-err', load: 'sb-load' }[state] || 'sb-load');
    text.textContent = label;
}

function setSyncBadge(synced) {
    const badge = document.getElementById('syncBadge');
    if (!badge) return;
    if (synced) {
        badge.style.background   = '#ECFDF5';
        badge.style.color        = '#065F46';
        badge.style.borderColor  = '#A7F3D0';
        badge.innerHTML          = '<i class="fas fa-circle-check"></i> Đã đồng bộ';
    } else {
        badge.style.background   = '#FFF7ED';
        badge.style.color        = '#92400E';
        badge.style.borderColor  = '#FED7AA';
        badge.innerHTML          = '<i class="fas fa-circle-dot"></i> Chưa lưu';
    }
}

/* ══════════════════════════════════════════
   SIDEBAR HIGHLIGHT — scroll spy
══════════════════════════════════════════ */
function initScrollSpy() {
    const sections = ['sec-info', 'sec-contact', 'sec-hours'];
    const links    = document.querySelectorAll('.sb-link[data-sec]');

    function onScroll() {
        let current = sections[0];
        sections.forEach(function(id) {
            const el = document.getElementById(id);
            if (el && el.getBoundingClientRect().top <= 120) current = id;
        });
        links.forEach(function(a) {
            a.classList.toggle('active', a.dataset.sec === current);
        });
    }

    document.addEventListener('scroll', onScroll, { passive: true });
}

/* ══════════════════════════════════════════
   INIT — single DOMContentLoaded
══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function() {

    // Initial load
    loadSettings();

    // Refresh
    document.getElementById('btnRefresh')?.addEventListener('click', function() {
        if (_isDirty) {
            if (!window.confirm('Bạn có thay đổi chưa lưu. Tải lại sẽ mất các thay đổi này. Tiếp tục?')) return;
        }
        loadSettings();
    });

    // Save buttons (topbar + footer + unsaved mini)
    function handleSave() { saveSettings(); }
    document.getElementById('btnSaveTop')?.addEventListener('click',  handleSave);
    document.getElementById('btnSave')?.addEventListener('click',     handleSave);
    document.getElementById('btnSaveMini')?.addEventListener('click', handleSave);

    // Reset
    document.getElementById('btnReset')?.addEventListener('click', function() {
        if (!_isDirty) return;
        if (window.confirm('Khôi phục về dữ liệu đã tải từ server?')) {
            resetForm();
        }
    });

    // Dirty tracking — listen for input on all form fields
    FIELDS.forEach(function(f) {
        const el = document.getElementById(f.id);
        if (el) el.addEventListener('input', checkDirty);
    });

    // Sidebar nav — smooth scroll + highlight
    document.querySelectorAll('.sb-link[data-sec]').forEach(function(link) {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.getElementById(this.dataset.sec);
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            document.querySelectorAll('.sb-link[data-sec]').forEach(function(l) { l.classList.remove('active'); });
            link.classList.add('active');
        });
    });

    // Scroll spy for sidebar highlight
    initScrollSpy();

    // Warn before leaving with unsaved changes
    window.addEventListener('beforeunload', function(e) {
        if (_isDirty) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    // Keyboard shortcut: Ctrl/Cmd + S
    document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            if (_isDirty) saveSettings();
        }
    });
});