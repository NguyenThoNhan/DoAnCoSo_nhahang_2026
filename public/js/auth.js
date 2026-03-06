/* ================================================================
   GOMEAL — AUTH.JS
   File: public/js/auth.js
   Dùng cho: views/auth/login.html  +  views/auth/register.html

   Tự phát hiện trang đang chạy qua DOM element có mặt:
     - loginForm    → chạy initLogin()
     - registerForm → chạy initRegister()

   Cấu trúc module:
     §0  Constants & State
     §1  Safe Helpers (DOM, fetch, localStorage)
     §2  Slideshow Engine
     §3  UI Helpers (alert, field-error, button loading)
     §4  Auth Guard (redirect nếu đã đăng nhập)
     §5  Login logic
     §6  Register logic (bao gồm password strength)
     §7  Counter animation (stats badge — login page)
     §8  DOMContentLoaded — Entry point

   Nguyên tắc an toàn:
     - Mọi DOM query đều null-check trước khi sử dụng
     - Mọi localStorage call đều trong try/catch
     - Không throw ra ngoài — chỉ console.warn
     - Không redirect vòng lặp
================================================================ */

'use strict';

/* ================================================================
   §0  CONSTANTS & STATE
================================================================ */
const API = {
    LOGIN:    '/api/auth/login',
    REGISTER: '/api/auth/register',
};

const SESSION = {
    TOKEN:      'authToken',
    ROLE:       'userRole',
    ADMIN_INFO: 'adminInfo',
    SAVED_EMAIL:'savedEmail',
};

const REDIRECT = {
    ADMIN:    '/views/admin/index.html',
    CUSTOMER: '/views/user/index.html',
    LOGIN:    '/views/auth/login.html',
};

const STRENGTH_LABELS = ['', 'Yếu', 'Trung bình', 'Tốt', 'Mạnh'];

/* Slideshow state */
let _slideIndex = 0;
let _slideTimer = null;


/* ================================================================
   §1  SAFE HELPERS
================================================================ */

/**
 * document.getElementById với null-check.
 * @param {string} id
 * @returns {HTMLElement|null}
 */
function $id(id) {
    try { return document.getElementById(id) || null; }
    catch(_) { return null; }
}

/**
 * querySelector với null-check.
 * @param {string} sel
 * @param {Element|Document} [root=document]
 * @returns {Element|null}
 */
function $q(sel, root) {
    try { return (root || document).querySelector(sel) || null; }
    catch(_) { return null; }
}

/**
 * Đọc từ localStorage an toàn.
 * @param {string} key
 * @returns {string|null}
 */
function lsGet(key) {
    try { return localStorage.getItem(key); }
    catch(_) { return null; }
}

/**
 * Ghi vào localStorage an toàn.
 * @param {string} key
 * @param {string} value
 */
function lsSet(key, value) {
    try { localStorage.setItem(key, value); }
    catch(_) { /* blocked */ }
}

/**
 * Xóa key khỏi localStorage an toàn.
 * @param {string} key
 */
function lsRemove(key) {
    try { localStorage.removeItem(key); }
    catch(_) { /* blocked */ }
}

/**
 * Fetch wrapper: parse response text → JSON an toàn.
 * Không throw, trả về { ok, status, data }.
 * @param {string} url
 * @param {RequestInit} options
 * @returns {Promise<{ok:boolean, status:number, data:any}>}
 */
async function safeFetch(url, options) {
    try {
        const res  = await fetch(url, options);
        let data   = null;
        try {
            const txt = await res.text();
            if (txt && txt.trim()) data = JSON.parse(txt);
        } catch(_) {
            console.warn('[Auth] JSON parse failed for', url);
        }
        return { ok: res.ok, status: res.status, data };
    } catch (netErr) {
        console.warn('[Auth] Network error:', netErr.message);
        return { ok: false, status: 0, data: null };
    }
}


/* ================================================================
   §2  SLIDESHOW ENGINE
   Shared by both pages — detects #slideTrack automatically.
================================================================ */
function initSlideshow() {
    const track = $id('slideTrack');
    if (!track) return;

    const slides = track.querySelectorAll('.slide');
    const dots   = document.querySelectorAll('.dot-btn');

    if (!slides.length) return;

    function goTo(idx) {
        if (idx === _slideIndex) return;

        // Mark current as leaving
        try { slides[_slideIndex].classList.remove('is-active'); } catch(_) {}
        try { slides[_slideIndex].classList.add('is-leaving');   } catch(_) {}
        try { dots[_slideIndex].classList.remove('is-active');    } catch(_) {}

        const prev = _slideIndex;
        setTimeout(function removeLeavingClass() {
            try { slides[prev].classList.remove('is-leaving'); } catch(_) {}
        }, 1400);

        _slideIndex = idx;

        try { slides[_slideIndex].classList.add('is-active'); } catch(_) {}
        try { dots[_slideIndex].classList.add('is-active');   } catch(_) {}
    }

    function next() {
        goTo((_slideIndex + 1) % slides.length);
    }

    function start() {
        if (_slideTimer) clearInterval(_slideTimer);
        _slideTimer = setInterval(next, 5200);
    }

    // Dot click handlers
    dots.forEach(function(dot) {
        if (!dot) return;
        dot.addEventListener('click', function onDotClick() {
            try {
                const idx = parseInt(this.getAttribute('data-idx'), 10);
                if (!isNaN(idx)) { goTo(idx); start(); }
            } catch(_) {}
        });
    });

    // Touch/swipe support
    let _touchStartX = 0;
    track.addEventListener('touchstart', function(e) {
        try { _touchStartX = e.touches[0].clientX; }
        catch(_) {}
    }, { passive: true });

    track.addEventListener('touchend', function(e) {
        try {
            const diff = _touchStartX - e.changedTouches[0].clientX;
            if (Math.abs(diff) > 50) {
                if (diff > 0) next();
                else goTo((_slideIndex - 1 + slides.length) % slides.length);
                start();
            }
        } catch(_) {}
    }, { passive: true });

    start();
}


/* ================================================================
   §3  UI HELPERS — Alert, Field Errors, Button state
================================================================ */

/**
 * Hiển thị alert box phía trên form.
 * @param {string} msg
 * @param {'error'|'success'} type
 */
function showAlert(msg, type) {
    try {
        const box  = $id('formAlert');
        const icon = $id('alertIcon');
        const text = $id('alertMsg');
        if (!box) return;

        const isSuccess = (type === 'success');

        box.className = 'form-alert show ' + (isSuccess ? 'ok' : 'err');

        if (icon) {
            icon.className = isSuccess
                ? 'fas fa-circle-check'
                : 'fas fa-circle-exclamation';
        }

        if (text) text.textContent = String(msg || '');
    } catch(_) {}
}

/**
 * Ẩn alert box.
 */
function hideAlert() {
    try {
        const box = $id('formAlert');
        if (box) box.classList.remove('show');
    } catch(_) {}
}

/**
 * Đánh dấu field lỗi + hiển thị error message.
 * @param {string} fieldId  ID của .field wrapper (vd: 'fEmail')
 * @param {string} [msg]    Nội dung lỗi — nếu có sẽ override text trong DOM
 */
function setFieldError(fieldId, msg) {
    try {
        const field = $id(fieldId);
        if (!field) return;

        field.classList.add('has-err');

        // Update error message text nếu có
        if (msg) {
            const errEl = $q('[id$="ErrMsg"]', field);
            if (errEl) errEl.textContent = msg;
        }

        // Đảm bảo .ferr hoặc ferr (custom element) hiển thị
        const ferr = $q('.ferr, ferr', field);
        if (ferr) ferr.style.display = 'flex';

    } catch(_) {}
}

/**
 * Xóa trạng thái lỗi của một field.
 * @param {string} fieldId
 */
function clearFieldError(fieldId) {
    try {
        const field = $id(fieldId);
        if (!field) return;
        field.classList.remove('has-err');
        // Reset inline display của ferr
        const ferr = $q('.ferr, ferr', field);
        if (ferr) ferr.style.display = '';
    } catch(_) {}
}

/**
 * Xóa lỗi trên một mảng fieldIds.
 * @param {string[]} ids
 */
function clearAllErrors(ids) {
    try {
        (ids || []).forEach(clearFieldError);
    } catch(_) {}
}

/**
 * Set trạng thái loading cho button submit.
 * @param {string}  btnId
 * @param {boolean} on
 */
function setLoading(btnId, on) {
    try {
        const btn = $id(btnId);
        if (!btn) return;
        btn.classList.toggle('loading', on);
        btn.disabled = on;
    } catch(_) {}
}


/* ================================================================
   §4  AUTH GUARD
   Redirect ngay nếu user đã đăng nhập.
   Chỉ chạy ở trang login / register — không gây vòng lặp.
================================================================ */
function checkAlreadyLoggedIn() {
    try {
        const token = lsGet(SESSION.TOKEN);
        const role  = lsGet(SESSION.ROLE);

        // Không có token → ở lại trang login/register
        if (!token || !role) return;

        // Đang ở trang đích rồi → không redirect vòng lặp
        const path = window.location.pathname || '';
        if (path.includes('/views/admin/') || path.includes('/views/user/')) return;

        // Verify token với server trước khi redirect
        // Nếu /api/auth/verify trả 200 → token hợp lệ → redirect
        // Nếu 401/403/404 → token hết hạn/không hợp lệ → xóa và ở lại
        fetch('/api/auth/verify', {
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + token }
        })
        .then(function(res) {
            if (res.ok) {
                // Token hợp lệ → redirect về trang phù hợp
                const dest = (role === 'admin') ? REDIRECT.ADMIN : REDIRECT.CUSTOMER;
                window.location.href = dest;
            } else {
                // Token hết hạn hoặc không hợp lệ → xóa session, ở lại login
                lsRemove(SESSION.TOKEN);
                lsRemove(SESSION.ROLE);
                lsRemove(SESSION.ADMIN_INFO);
            }
        })
        .catch(function() {
            // Lỗi mạng hoặc server không phản hồi → ở lại login, không redirect
            // Tránh trường hợp server chưa khởi động mà bị redirect lỗi
        });

    } catch(_) {}
}


/* ================================================================
   §5  LOGIN PAGE
================================================================ */
function initLogin() {
    const form = $id('loginForm');
    if (!form) return;

    /* ── Restore saved email ── */
    (function restoreEmail() {
        try {
            const saved = lsGet(SESSION.SAVED_EMAIL);
            if (!saved) return;
            const emailEl = $id('email');
            const remEl   = $id('rememberMe');
            if (emailEl) emailEl.value = saved;
            if (remEl)   remEl.checked = true;
        } catch(_) {}
    })();

    /* ── Counter animation (stats badge — only on login) ── */
    (function animateCounter() {
        try {
            const el = $id('sfOrders');
            if (!el) return;
            let count        = 1000;
            const target     = 1284;
            const step       = Math.ceil((target - count) / 40);
            const timer      = setInterval(function tick() {
                count = Math.min(count + step, target);
                el.textContent = count.toLocaleString('vi-VN');
                if (count >= target) clearInterval(timer);
            }, 28);
        } catch(_) {}
    })();

    /* ── Role switch ── */
    // Called via onclick="switchRole('...')" in HTML
    window.switchRole = function switchRole(role) {
        try {
            const card    = $q('.form-card');
            const btnGo   = $id('btnSubmit');
            const eyebrow = $id('eyebrowText');
            const title   = $id('formTitle');
            const sub     = $id('formSub');
            const label   = $id('btnLabel');

            // Update tab active state
            document.querySelectorAll('.rtab').forEach(function(t) {
                t.classList.toggle('is-active', t.getAttribute('data-role') === role);
            });

            if (role === 'admin') {
                if (card)   card.classList.add('is-admin');
                if (btnGo)  btnGo.classList.add('admin-go');
                if (eyebrow) eyebrow.textContent = 'Khu vực quản trị';
                if (title)   title.textContent   = 'Đăng nhập Admin';
                if (sub)     sub.textContent     = 'Chỉ dành cho quản trị viên được uỷ quyền';
                if (label)   label.textContent   = 'Truy cập hệ thống';
            } else {
                if (card)   card.classList.remove('is-admin');
                if (btnGo)  btnGo.classList.remove('admin-go');
                if (eyebrow) eyebrow.textContent = 'Chào mừng trở lại';
                if (title)   title.textContent   = 'Đăng nhập';
                if (sub)     sub.textContent     = 'Nhập thông tin tài khoản để tiếp tục';
                if (label)   label.textContent   = 'Đăng nhập';
            }

            hideAlert();
            clearAllErrors(['fEmail', 'fPassword']);
        } catch(_) {}
    };

    /* ── Password toggle ── */
    const pwdToggle = $id('pwdToggle');
    if (pwdToggle) {
        pwdToggle.addEventListener('click', function onPwdToggle() {
            try {
                const inp  = $id('password');
                const icon = $id('pwdEyeIcon');
                if (!inp) return;
                if (inp.type === 'password') {
                    inp.type = 'text';
                    if (icon) icon.className = 'fas fa-eye-slash';
                } else {
                    inp.type = 'password';
                    if (icon) icon.className = 'fas fa-eye';
                }
            } catch(_) {}
        });
    }

    /* ── Live clear errors on input ── */
    const emailEl    = $id('email');
    const passwordEl = $id('password');

    if (emailEl) {
        emailEl.addEventListener('input', function() {
            clearFieldError('fEmail');
            hideAlert();
        });
    }

    if (passwordEl) {
        passwordEl.addEventListener('input', function() {
            clearFieldError('fPassword');
            hideAlert();
        });
    }

    /* ── Form submit ── */
    form.addEventListener('submit', async function onLoginSubmit(e) {
        e.preventDefault();
        hideAlert();
        clearAllErrors(['fEmail', 'fPassword']);

        const email    = ($id('email')    ? $id('email').value    : '').trim();
        const password = ($id('password') ? $id('password').value : '').trim();

        /* Client-side validation */
        let hasError = false;

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setFieldError('fEmail', 'Vui lòng nhập email hợp lệ');
            hasError = true;
        }

        if (!password || password.length < 6) {
            setFieldError('fPassword', 'Mật khẩu phải có ít nhất 6 ký tự');
            hasError = true;
        }

        if (hasError) return;

        /* Call API */
        setLoading('btnSubmit', true);

        const result = await safeFetch(API.LOGIN, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ email, password }),
        });

        setLoading('btnSubmit', false);

        if (result.ok && result.data && result.data.token) {
            /* ── Success ── */
            const user  = result.data.user  || {};
            const token = result.data.token;
            const role  = user.role || 'customer';

            lsSet(SESSION.TOKEN, token);
            lsSet(SESSION.ROLE,  role);
            lsSet(SESSION.ADMIN_INFO, JSON.stringify({
                name:  user.name  || 'Admin',
                role:  role,
                email: user.email || email,
            }));

            const rememberEl = $id('rememberMe');
            if (rememberEl && rememberEl.checked) {
                lsSet(SESSION.SAVED_EMAIL, email);
            } else {
                lsRemove(SESSION.SAVED_EMAIL);
            }

            showAlert('Đăng nhập thành công! Đang chuyển hướng...', 'success');

            setTimeout(function doRedirect() {
                try {
                    window.location.href = (role === 'admin')
                        ? REDIRECT.ADMIN
                        : REDIRECT.CUSTOMER;
                } catch(_) {}
            }, 900);

        } else {
            /* ── API error ── */
            const msg = (result.data && result.data.message)
                ? result.data.message
                : 'Đăng nhập thất bại. Vui lòng thử lại.';

            if (result.status === 0) {
                showAlert('Không thể kết nối đến máy chủ. Kiểm tra kết nối mạng.', 'error');
            } else if (result.status === 401) {
                // Highlight both fields for wrong credentials
                setFieldError('fEmail',    ' ');
                setFieldError('fPassword', msg);
            } else {
                showAlert(msg, 'error');
            }
        }
    });
}


/* ================================================================
   §6  REGISTER PAGE
================================================================ */

/* ── Password strength calculator ── */
function calcPasswordStrength(pwd) {
    if (!pwd || pwd.length < 1)  return 0;
    if (pwd.length < 6)          return 0;  // not enough for even level 1
    let score = 1;
    if (pwd.length >= 10) score++;
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd) && /[^a-zA-Z0-9]/.test(pwd)) score++;
    return Math.min(score, 4);
}

/* ── Single password-reveal toggle factory ── */
function makePasswordToggle(btnId, inputId, eyeIconId) {
    const btn = $id(btnId);
    if (!btn) return;

    btn.addEventListener('click', function onToggle() {
        try {
            const inp  = $id(inputId);
            const icon = $id(eyeIconId);
            if (!inp) return;
            if (inp.type === 'password') {
                inp.type = 'text';
                if (icon) icon.className = 'fas fa-eye-slash';
            } else {
                inp.type = 'password';
                if (icon) icon.className = 'fas fa-eye';
            }
        } catch(_) {}
    });
}

function initRegister() {
    const form = $id('registerForm');
    if (!form) return;

    /* ── Password toggles ── */
    makePasswordToggle('pwdToggle1', 'password',   'eye1');
    makePasswordToggle('pwdToggle2', 'confirmPwd', 'eye2');

    /* ── Password strength meter ── */
    const pwdInput = $id('password');
    if (pwdInput) {
        pwdInput.addEventListener('input', function onPwdInput() {
            clearFieldError('fPassword');
            hideAlert();

            const pwd   = this.value || '';
            const meter = $id('strengthMeter');
            const lbl   = $id('strengthLbl');

            if (!meter) return;

            if (pwd.length === 0) {
                meter.style.display = 'none';
                return;
            }

            const score = calcPasswordStrength(pwd);
            meter.style.display = '';
            meter.className     = 'strength-meter sm-' + score;
            if (lbl) lbl.textContent = STRENGTH_LABELS[score] || 'Quá ngắn';
        });
    }

    /* ── Live clear errors on input ── */
    function bindClear(inputId, fieldId) {
        const el = $id(inputId);
        if (el) {
            el.addEventListener('input', function() {
                clearFieldError(fieldId);
                hideAlert();
            });
        }
    }

    bindClear('fullname',   'fName');
    bindClear('email',      'fEmail');
    bindClear('confirmPwd', 'fConfirm');

    /* ── Form submit ── */
    form.addEventListener('submit', async function onRegisterSubmit(e) {
        e.preventDefault();
        hideAlert();
        clearAllErrors(['fName', 'fEmail', 'fPassword', 'fConfirm']);

        const name     = ($id('fullname')   ? $id('fullname').value   : '').trim();
        const email    = ($id('email')      ? $id('email').value      : '').trim();
        const password = ($id('password')   ? $id('password').value   : '').trim();
        const confirm  = ($id('confirmPwd') ? $id('confirmPwd').value : '').trim();

        /* Client-side validation */
        let hasError = false;

        if (!name || name.length < 2) {
            setFieldError('fName', 'Vui lòng nhập họ tên (ít nhất 2 ký tự)');
            hasError = true;
        }

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setFieldError('fEmail', 'Email không đúng định dạng');
            hasError = true;
        }

        if (!password || password.length < 6) {
            setFieldError('fPassword', 'Mật khẩu phải có ít nhất 6 ký tự');
            // Force-show ferr which uses <ferr> custom tag in register.html
            const ferrEl = $q('#fPassword ferr, #fPassword .ferr');
            if (ferrEl) ferrEl.style.display = 'flex';
            hasError = true;
        }

        if (!confirm) {
            setFieldError('fConfirm', 'Vui lòng nhập lại mật khẩu');
            hasError = true;
        } else if (confirm !== password) {
            setFieldError('fConfirm', 'Mật khẩu xác nhận không khớp');
            hasError = true;
        }

        if (hasError) return;

        /* Call API */
        setLoading('btnSubmit', true);

        const result = await safeFetch(API.REGISTER, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ name, email, password }),
        });

        setLoading('btnSubmit', false);

        if (result.status === 201 || result.ok) {
            /* ── Success ── */
            showAlert('Đăng ký thành công! Đang chuyển sang trang đăng nhập...', 'success');
            setTimeout(function doRedirect() {
                try { window.location.href = REDIRECT.LOGIN; } catch(_) {}
            }, 1600);

        } else if (result.status === 409) {
            /* ── Email đã tồn tại ── */
            const msg = (result.data && result.data.message)
                ? result.data.message
                : 'Email này đã được sử dụng';
            setFieldError('fEmail', msg);

        } else if (result.status === 400) {
            const msg = (result.data && result.data.message)
                ? result.data.message
                : 'Vui lòng kiểm tra lại thông tin';
            showAlert(msg, 'error');

        } else if (result.status === 0) {
            showAlert('Không thể kết nối máy chủ. Kiểm tra lại kết nối mạng.', 'error');

        } else {
            const msg = (result.data && result.data.message)
                ? result.data.message
                : 'Đăng ký thất bại. Vui lòng thử lại.';
            showAlert(msg, 'error');
        }
    });
}


/* ================================================================
   §7  SOCIAL BUTTON PLACEHOLDER
   Gọi từ onclick inline trong cả 2 trang HTML.
================================================================ */
window.handleSocial = function handleSocial(provider) {
    try {
        const label = String(provider || '');
        showAlert(`Đăng nhập qua ${label} đang được phát triển.`, 'error');
    } catch(_) {}
};


/* ================================================================
   §8  DOMContentLoaded — ENTRY POINT
================================================================ */
document.addEventListener('DOMContentLoaded', function onReady() {

    /* 1. Redirect nếu đã đăng nhập */
    try { checkAlreadyLoggedIn(); } catch(_) {}

    /* 2. Khởi tạo slideshow (cả 2 trang) */
    try { initSlideshow(); } catch(_) {}

    /* 3. Phát hiện trang và khởi tạo form tương ứng */
    try {
        if ($id('loginForm')) {
            initLogin();
        } else if ($id('registerForm')) {
            initRegister();
        }
    } catch(e) {
        console.warn('[Auth] Form init error (bỏ qua):', e.message);
    }
});