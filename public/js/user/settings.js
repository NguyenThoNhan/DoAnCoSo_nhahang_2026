/* ================================================================
   GOMEAL — SETTINGS.JS
   File: public/js/user/settings.js

   Trang Cài đặt — views/user/settings.html
   ⚠️  KHÔNG GỌI API BACKEND — Xử lý hoàn toàn Client-side
   ⚠️  Mọi cài đặt lưu localStorage → có hiệu lực toàn ứng dụng

   ┌─ localStorage keys (shared across ALL pages) ──────────────────┐
   │  'theme'          → 'light' | 'dark' | 'system'               │
   │  'lang'           → 'vi' | 'en'                               │
   │  'accentColor'    → 'orange'|'teal'|'violet'|'rose'|'amber'   │
   │  'fontSize'       → 'sm' | 'md' | 'lg'                       │
   │  'soundNotify'    → 'on' | 'off'                              │
   │  'orderNotify'    → 'on' | 'off'                              │
   │  'promoNotify'    → 'on' | 'off'                              │
   │  'reduceMotion'   → 'on' | 'off'                              │
   │  'saveSearch'     → 'on' | 'off'                              │
   │  'saveChat'       → 'on' | 'off'                              │
   └────────────────────────────────────────────────────────────────┘

   ┌─ Chức năng ─────────────────────────────────────────────────────┐
   │  0.  DEFAULTS & ACCENT_PALETTES — constants                     │
   │  1.  stScrollTo()         — Smooth scroll + nav active state    │
   │  2.  settingsInit()       — DOMContentLoaded entry point        │
   │  3.  loadAllSettings()    — Đọc localStorage → apply + render  │
   │  4.  setTheme()           — Đổi theme → lưu → apply body class │
   │  5.  applyTheme()         — Inject dark CSS vars vào :root      │
   │  6.  _detectSystemTheme() — Lắng nghe prefers-color-scheme      │
   │  7.  updateThemeUI()      — Cập nhật card selector UI           │
   │  8.  setAccent()          — Đổi màu nhấn → override CSS vars   │
   │  9.  applyAccent()        — Inject style tag với :root overrides│
   │  10. updateAccentUI()     — Cập nhật swatch selected state      │
   │  11. setFontSize()        — Đổi cỡ chữ → apply html font-size  │
   │  12. applyFontSize()      — Set html element font-size scale    │
   │  13. updateFontSizeUI()   — Cập nhật button selected state      │
   │  14. setLang()            — Lưu ngôn ngữ → giả lập apply       │
   │  15. applyLang()          — Swap UI text theo lang (mock)       │
   │  16. updateLangUI()       — Cập nhật lang selector              │
   │  17. setSoundNotify()     — Lưu soundNotify on/off              │
   │  18. setOrderNotify()     — Lưu orderNotify on/off              │
   │  19. setPromoNotify()     — Lưu promoNotify on/off              │
   │  20. setReduceMotion()    — Lưu + apply prefers-reduced-motion  │
   │  21. setSaveSearch()      — Lưu saveSearch on/off               │
   │  22. setSaveChat()        — Lưu saveChat on/off                 │
   │  23. testSound()          — Phát âm thanh thử (Web Audio API)   │
   │  24. resetAll()           — Xoá tất cả keys → reload            │
   │  25. initAboutInfo()      — Điền browser, screen, system theme  │
   │  26. initNavScroll()      — Highlight nav item khi scroll       │
   │  27. _flashSavedBadge()   — Nhấp nháy badge "Đã lưu"           │
   │  28. showToast()          — Notification inline                  │
   │  29. _lsSet() / _lsGet()  — localStorage helpers               │
   │  30. _esc()               — XSS escape                          │
   └────────────────────────────────────────────────────────────────┘
   ================================================================ */

'use strict';

/* ================================================================
   0. CONSTANTS
   ================================================================ */

/** Default settings — applied on first visit or after reset */
var ST_DEFAULTS = {
    theme:        'light',
    lang:         'vi',
    accentColor:  'orange',
    fontSize:     'md',
    soundNotify:  'on',
    orderNotify:  'on',
    promoNotify:  'off',
    reduceMotion: 'off',
    saveSearch:   'on',
    saveChat:     'on',
};

/** localStorage key names */
var ST_KEYS = {
    theme:        'theme',
    lang:         'lang',
    accentColor:  'accentColor',
    fontSize:     'fontSize',
    soundNotify:  'soundNotify',
    orderNotify:  'orderNotify',
    promoNotify:  'promoNotify',
    reduceMotion: 'reduceMotion',
    saveSearch:   'saveSearch',
    saveChat:     'saveChat',
};

/** Accent color palettes — each overrides CSS custom properties */
var ACCENT_PALETTES = {
    orange: {
        primary:      '#FF6B35',
        primaryDark:  '#E8551E',
        primaryLight: '#FFF3EE',
        primarySubtle:'#FFF8F5',
        grad:         'linear-gradient(135deg, #FF6B35 0%, #F7931E 100%)',
        borderActive: '#FFD4C2',
    },
    teal: {
        primary:      '#0D9488',
        primaryDark:  '#0F766E',
        primaryLight: '#CCFBF1',
        primarySubtle:'#F0FDFA',
        grad:         'linear-gradient(135deg, #0D9488 0%, #14B8A6 100%)',
        borderActive: '#99F6E4',
    },
    violet: {
        primary:      '#7C3AED',
        primaryDark:  '#6D28D9',
        primaryLight: '#EDE9FE',
        primarySubtle:'#F5F3FF',
        grad:         'linear-gradient(135deg, #7C3AED 0%, #8B5CF6 100%)',
        borderActive: '#C4B5FD',
    },
    rose: {
        primary:      '#E11D48',
        primaryDark:  '#BE123C',
        primaryLight: '#FFE4E6',
        primarySubtle:'#FFF1F2',
        grad:         'linear-gradient(135deg, #E11D48 0%, #F43F5E 100%)',
        borderActive: '#FDA4AF',
    },
    amber: {
        primary:      '#D97706',
        primaryDark:  '#B45309',
        primaryLight: '#FEF3C7',
        primarySubtle:'#FFFBEB',
        grad:         'linear-gradient(135deg, #D97706 0%, #F59E0B 100%)',
        borderActive: '#FCD34D',
    },
};

/** Font size scaling — applied as html { font-size: Xpx } */
var FONT_SIZE_MAP = {
    sm: '14px',
    md: '16px',
    lg: '18px',
};

/** Language strings for mock i18n (minimal set) */
var LANG_STRINGS = {
    vi: {
        greeting:  'Cá nhân hóa trải nghiệm ⚙️',
        pageTitle: 'Cài đặt',
        saved:     '✅ Đã lưu',
    },
    en: {
        greeting:  'Personalize your experience ⚙️',
        pageTitle: 'Settings',
        saved:     '✅ Saved',
    },
};

/** Internal state */
var _st = {
    theme:        'light',
    lang:         'vi',
    accentColor:  'orange',
    fontSize:     'md',
    soundNotify:  true,
    orderNotify:  true,
    promoNotify:  false,
    reduceMotion: false,
    saveSearch:   true,
    saveChat:     true,
    _systemThemeQuery: null,
    _systemThemeListener: null,
};


/* ================================================================
   GLOBAL: stScrollTo — called from HTML onclick (href="...")
   ================================================================ */
window.stScrollTo = function stScrollTo(sectionId) {
    try {
        var el = document.getElementById(sectionId);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        /* Update nav active */
        document.querySelectorAll('.st-nav-item').forEach(function (item) {
            var href = item.getAttribute('href') || '';
            item.classList.toggle('active', href === '#' + sectionId);
        });
    } catch (_) {}
    return false; /* prevent default anchor jump */
};


/* ================================================================
   1. ENTRY POINT
   ================================================================ */
document.addEventListener('DOMContentLoaded', function settingsInit() {
    try {
        loadAllSettings();
        initAboutInfo();
        initNavScroll();
        _applyGlobalCSS();
    } catch (err) {
        console.error('[Settings] init error:', err.message);
    }
});


/* ================================================================
   2. LOAD ALL SETTINGS → apply + render UI
   ================================================================ */
function loadAllSettings() {
    try {
        /* Read each key with fallback to default */
        _st.theme        = _lsGet(ST_KEYS.theme)        || ST_DEFAULTS.theme;
        _st.lang         = _lsGet(ST_KEYS.lang)         || ST_DEFAULTS.lang;
        _st.accentColor  = _lsGet(ST_KEYS.accentColor)  || ST_DEFAULTS.accentColor;
        _st.fontSize     = _lsGet(ST_KEYS.fontSize)      || ST_DEFAULTS.fontSize;
        _st.soundNotify  = _lsGet(ST_KEYS.soundNotify)  !== 'off';
        _st.orderNotify  = _lsGet(ST_KEYS.orderNotify)  !== 'off';
        _st.promoNotify  = _lsGet(ST_KEYS.promoNotify)  === 'on';
        _st.reduceMotion = _lsGet(ST_KEYS.reduceMotion) === 'on';
        _st.saveSearch   = _lsGet(ST_KEYS.saveSearch)   !== 'off';
        _st.saveChat     = _lsGet(ST_KEYS.saveChat)     !== 'off';

        /* Apply all */
        applyTheme(_st.theme);
        applyAccent(_st.accentColor);
        applyFontSize(_st.fontSize);
        applyLang(_st.lang);
        applyReduceMotion(_st.reduceMotion);

        /* Render UI controls */
        updateThemeUI(_st.theme);
        updateAccentUI(_st.accentColor);
        updateFontSizeUI(_st.fontSize);
        updateLangUI(_st.lang);
        _updateToggle('stSoundNotify',  _st.soundNotify);
        _updateToggle('stOrderNotify',  _st.orderNotify);
        _updateToggle('stPromoNotify',  _st.promoNotify);
        _updateToggle('stReduceMotion', _st.reduceMotion);
        _updateToggle('stSaveSearch',   _st.saveSearch);
        _updateToggle('stSaveChat',     _st.saveChat);

    } catch (err) {
        console.warn('[Settings] loadAllSettings:', err.message);
    }
}


/* ================================================================
   3. INJECT GLOBAL CSS STYLE TAG
   Injects one <style id="stGlobalOverrides"> into <head>
   Applied on every page via script tag (settings.js loaded on all pages)
   ================================================================ */
function _applyGlobalCSS() {
    /* Already applied by applyAccent / applyTheme / applyFontSize */
}


/* ================================================================
   4. THEME — Light / Dark / System
   ================================================================ */

/** Called from HTML onclick */
function setTheme(theme) {
    _st.theme = theme;
    _lsSet(ST_KEYS.theme, theme);
    applyTheme(theme);
    updateThemeUI(theme);
    _flashSavedBadge();
    showToast(
        theme === 'dark'   ? '🌙 Chế độ tối đã bật' :
        theme === 'system' ? '🖥️ Theo hệ thống' :
                             '☀️ Chế độ sáng đã bật',
        'info'
    );
}

/** Apply theme: inject/remove CSS vars, add/remove class on body */
function applyTheme(theme) {
    try {
        /* Resolve system theme */
        var resolved = theme;
        if (theme === 'system') {
            resolved = _getSystemPref();
            _watchSystemTheme(); /* live update on OS change */
        } else {
            _unwatchSystemTheme();
        }

        _applyResolvedTheme(resolved);

    } catch (err) {
        console.warn('[Settings] applyTheme:', err.message);
    }
}

function _applyResolvedTheme(resolved) {
    var styleId = 'stDarkOverrides';

    if (resolved === 'dark') {
        document.body.classList.add('dark-mode');
        _injectDarkCSS(styleId);
    } else {
        document.body.classList.remove('dark-mode');
        var old = document.getElementById(styleId);
        if (old) old.remove();
    }
}

function _injectDarkCSS(id) {
    if (document.getElementById(id)) return; /* already injected */
    var s = document.createElement('style');
    s.id  = id;
    s.textContent = [
        /* Page background */
        'body.dark-mode { background: #111827 !important; color: #F9FAFB !important; }',
        /* Sidebar */
        'body.dark-mode .user-sidebar { background: #1F2937 !important; border-color: #374151 !important; }',
        'body.dark-mode .user-sidebar-brand-name { color: #F9FAFB !important; }',
        'body.dark-mode .user-nav-item { color: #9CA3AF !important; }',
        'body.dark-mode .user-nav-item:hover { background: #374151 !important; color: #F3F4F6 !important; }',
        'body.dark-mode .user-nav-item.active { background: rgba(255,107,53,.15) !important; color: #FF6B35 !important; }',
        /* Topbar */
        'body.dark-mode .user-topbar { background: #1F2937 !important; border-color: #374151 !important; }',
        'body.dark-mode .topbar-title { color: #F9FAFB !important; }',
        'body.dark-mode .topbar-greeting { color: #6B7280 !important; }',
        'body.dark-mode .topbar-action-btn { background: #374151 !important; border-color: #4B5563 !important; color: #9CA3AF !important; }',
        'body.dark-mode .topbar-avatar { background: #374151 !important; color: #9CA3AF !important; }',
        /* Main content */
        'body.dark-mode .user-content { background: #111827 !important; }',
        /* Cards */
        'body.dark-mode .st-card { background: #1F2937 !important; border-color: #374151 !important; }',
        'body.dark-mode .st-card-hd { border-color: #374151 !important; }',
        'body.dark-mode .st-card-hd-title { color: #F9FAFB !important; }',
        'body.dark-mode .st-card-hd-sub { color: #6B7280 !important; }',
        'body.dark-mode .st-row { border-color: #374151 !important; }',
        'body.dark-mode .st-row-label { color: #F3F4F6 !important; }',
        'body.dark-mode .st-row-desc { color: #6B7280 !important; }',
        /* Nav */
        'body.dark-mode .st-nav { background: #1F2937 !important; border-color: #374151 !important; }',
        'body.dark-mode .st-nav-hd { color: #4B5563 !important; border-color: #374151 !important; }',
        'body.dark-mode .st-nav-item { color: #6B7280 !important; }',
        'body.dark-mode .st-nav-item:hover { background: #374151 !important; color: #FF6B35 !important; }',
        'body.dark-mode .st-nav-item.active { background: rgba(255,107,53,.12) !important; color: #FF6B35 !important; }',
        'body.dark-mode .st-nav-divider { background: #374151 !important; }',
        /* Theme preview cards */
        'body.dark-mode .st-theme-opt { border-color: #374151 !important; }',
        'body.dark-mode .st-theme-opt:hover { border-color: #FF6B35 !important; }',
        'body.dark-mode .st-theme-label { color: #9CA3AF !important; }',
        /* Font size buttons */
        'body.dark-mode .st-fontsize-opt { border-color: #374151 !important; color: #9CA3AF !important; }',
        'body.dark-mode .st-fontsize-opt:hover { border-color: #FF6B35 !important; color: #FF6B35 !important; }',
        /* Lang options */
        'body.dark-mode .st-lang-opt { border-color: #374151 !important; color: #9CA3AF !important; background: transparent !important; }',
        'body.dark-mode .st-lang-opt:hover { border-color: #FF6B35 !important; color: #FF6B35 !important; }',
        'body.dark-mode .st-lang-opt.selected { background: rgba(255,107,53,.1) !important; border-color: #FF6B35 !important; color: #FF6B35 !important; }',
        /* Toggle track */
        'body.dark-mode .st-toggle-track { background: #374151 !important; }',
        /* About grid */
        'body.dark-mode .st-about-item { background: #111827 !important; }',
        'body.dark-mode .st-about-val { color: #D1D5DB !important; }',
        'body.dark-mode .st-about-label { color: #4B5563 !important; }',
        /* Sound test btn */
        'body.dark-mode .st-sound-test { background: #111827 !important; border-color: #374151 !important; color: #9CA3AF !important; }',
        'body.dark-mode .st-sound-test:hover { background: rgba(255,107,53,.1) !important; border-color: #FF6B35 !important; color: #FF6B35 !important; }',
        /* Sticky bottom */
        'body.dark-mode .st-bottom-bar { background: rgba(31,41,55,.95) !important; border-color: #374151 !important; }',
    ].join('\n');
    document.head.appendChild(s);
}

/** Detect OS color preference */
function _getSystemPref() {
    try {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
    } catch (_) {}
    return 'light';
}

/** Watch OS theme changes (for system mode) */
function _watchSystemTheme() {
    try {
        if (_st._systemThemeQuery) return; /* already watching */
        _st._systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
        _st._systemThemeListener = function (e) {
            _applyResolvedTheme(e.matches ? 'dark' : 'light');
        };
        _st._systemThemeQuery.addEventListener('change', _st._systemThemeListener);
    } catch (_) {}
}

function _unwatchSystemTheme() {
    try {
        if (_st._systemThemeQuery && _st._systemThemeListener) {
            _st._systemThemeQuery.removeEventListener('change', _st._systemThemeListener);
            _st._systemThemeQuery   = null;
            _st._systemThemeListener = null;
        }
    } catch (_) {}
}

/** Update theme selector card UI */
function updateThemeUI(theme) {
    try {
        ['light', 'dark', 'system'].forEach(function (t) {
            var el = document.getElementById('stTheme' + t.charAt(0).toUpperCase() + t.slice(1));
            if (el) el.classList.toggle('selected', t === theme);
        });
    } catch (_) {}
}


/* ================================================================
   5. ACCENT COLOR
   ================================================================ */

/** Called from HTML onclick */
function setAccent(colorKey) {
    if (!ACCENT_PALETTES[colorKey]) return;
    _st.accentColor = colorKey;
    _lsSet(ST_KEYS.accentColor, colorKey);
    applyAccent(colorKey);
    updateAccentUI(colorKey);
    _flashSavedBadge();
    showToast('🎨 Màu nhấn đã thay đổi', 'success');
}

/** Inject/replace <style id="stAccentOverrides"> with new CSS var values */
function applyAccent(colorKey) {
    try {
        var palette = ACCENT_PALETTES[colorKey] || ACCENT_PALETTES.orange;
        var id      = 'stAccentOverrides';
        var old     = document.getElementById(id);
        if (old) old.remove();

        var s = document.createElement('style');
        s.id  = id;
        s.textContent = [
            ':root {',
            '  --user-primary:          ' + palette.primary      + ' !important;',
            '  --user-primary-dark:     ' + palette.primaryDark  + ' !important;',
            '  --user-primary-light:    ' + palette.primaryLight  + ' !important;',
            '  --user-primary-subtle:   ' + palette.primarySubtle + ' !important;',
            '  --user-grad-primary:     ' + palette.grad          + ' !important;',
            '  --user-border-active:    ' + palette.borderActive  + ' !important;',
            '}',
            /* Toggle checked state */
            '.st-toggle input:checked ~ .st-toggle-track {',
            '  background: ' + palette.primary + ' !important;',
            '}',
        ].join('\n');
        document.head.appendChild(s);
    } catch (err) {
        console.warn('[Settings] applyAccent:', err.message);
    }
}

/** Update swatch selected state */
function updateAccentUI(colorKey) {
    try {
        document.querySelectorAll('.st-accent-swatch').forEach(function (swatch) {
            var k = swatch.getAttribute('data-accent');
            swatch.classList.toggle('selected', k === colorKey);
        });
    } catch (_) {}
}


/* ================================================================
   6. FONT SIZE
   ================================================================ */

/** Called from HTML onclick */
function setFontSize(size) {
    if (!FONT_SIZE_MAP[size]) return;
    _st.fontSize = size;
    _lsSet(ST_KEYS.fontSize, size);
    applyFontSize(size);
    updateFontSizeUI(size);
    _flashSavedBadge();
    showToast('🔤 Cỡ chữ đã cập nhật', 'info');
}

/** Apply font size by setting html element font-size */
function applyFontSize(size) {
    try {
        var px = FONT_SIZE_MAP[size] || FONT_SIZE_MAP.md;
        document.documentElement.style.fontSize = px;
    } catch (_) {}
}

/** Update button selected state */
function updateFontSizeUI(size) {
    try {
        document.querySelectorAll('.st-fontsize-opt').forEach(function (btn) {
            btn.classList.toggle('selected', btn.getAttribute('data-size') === size);
        });
    } catch (_) {}
}


/* ================================================================
   7. LANGUAGE (mock i18n)
   ================================================================ */

/** Called from HTML onclick */
function setLang(lang) {
    _st.lang = lang;
    _lsSet(ST_KEYS.lang, lang);
    applyLang(lang);
    updateLangUI(lang);
    _flashSavedBadge();
    showToast(lang === 'en' ? '🇺🇸 Language set to English' : '🇻🇳 Đã chuyển sang Tiếng Việt', 'info');
}

/** Apply mock language swap on visible text elements */
function applyLang(lang) {
    try {
        var strings = LANG_STRINGS[lang] || LANG_STRINGS.vi;

        var greetingEl = document.getElementById('topbarGreetingText');
        if (greetingEl) greetingEl.textContent = strings.greeting;

        var titleEl = document.querySelector('[data-page-title]');
        if (titleEl) titleEl.textContent = strings.pageTitle;

        var badgeEl = document.getElementById('stSavedBadge');
        if (badgeEl) badgeEl.textContent = strings.saved;

        /* Set html lang attribute */
        document.documentElement.setAttribute('lang', lang);

    } catch (err) {
        console.warn('[Settings] applyLang:', err.message);
    }
}

/** Update lang option selected state */
function updateLangUI(lang) {
    try {
        document.querySelectorAll('.st-lang-opt').forEach(function (opt) {
            opt.classList.toggle('selected', opt.getAttribute('data-lang') === lang);
        });
    } catch (_) {}
}


/* ================================================================
   8. SOUND NOTIFY
   ================================================================ */

/** Called from HTML onchange */
function setSoundNotify(checked) {
    _st.soundNotify = checked;
    _lsSet(ST_KEYS.soundNotify, checked ? 'on' : 'off');
    _flashSavedBadge();
    showToast(
        checked ? '🔔 Âm thanh thông báo đã bật' : '🔕 Âm thanh thông báo đã tắt',
        'info'
    );
}


/* ================================================================
   9. ORDER NOTIFY
   ================================================================ */
function setOrderNotify(checked) {
    _st.orderNotify = checked;
    _lsSet(ST_KEYS.orderNotify, checked ? 'on' : 'off');
    _flashSavedBadge();
}


/* ================================================================
   10. PROMO NOTIFY
   ================================================================ */
function setPromoNotify(checked) {
    _st.promoNotify = checked;
    _lsSet(ST_KEYS.promoNotify, checked ? 'on' : 'off');
    _flashSavedBadge();
}


/* ================================================================
   11. REDUCE MOTION
   ================================================================ */

/** Called from HTML onchange */
function setReduceMotion(checked) {
    _st.reduceMotion = checked;
    _lsSet(ST_KEYS.reduceMotion, checked ? 'on' : 'off');
    applyReduceMotion(checked);
    _flashSavedBadge();
    showToast(checked ? '⚡ Đã giảm hiệu ứng chuyển động' : '✨ Hiệu ứng chuyển động đã bật', 'info');
}

/** Inject/remove CSS that disables animations globally */
function applyReduceMotion(on) {
    try {
        var id  = 'stReduceMotionCSS';
        var old = document.getElementById(id);

        if (on) {
            if (old) return; /* already applied */
            var s = document.createElement('style');
            s.id  = id;
            s.textContent = [
                '*, *::before, *::after {',
                '  animation-duration:   0.01ms !important;',
                '  animation-iteration-count: 1 !important;',
                '  transition-duration:  0.01ms !important;',
                '  scroll-behavior:      auto !important;',
                '}',
            ].join('\n');
            document.head.appendChild(s);
        } else {
            if (old) old.remove();
        }
    } catch (_) {}
}


/* ================================================================
   12. SAVE SEARCH
   ================================================================ */
function setSaveSearch(checked) {
    _st.saveSearch = checked;
    _lsSet(ST_KEYS.saveSearch, checked ? 'on' : 'off');
    _flashSavedBadge();
}


/* ================================================================
   13. SAVE CHAT
   ================================================================ */
function setSaveChat(checked) {
    _st.saveChat = checked;
    _lsSet(ST_KEYS.saveChat, checked ? 'on' : 'off');

    /* If user turns off saveChat, clear existing session storage */
    if (!checked) {
        try {
            sessionStorage.removeItem('mg_ai_hist');
            sessionStorage.removeItem('mg_admin_hist');
            sessionStorage.removeItem('chatHistory');
        } catch (_) {}
    }

    _flashSavedBadge();
    showToast(
        checked ? '💬 Lịch sử chat sẽ được lưu' : '🗑️ Lịch sử chat đã xoá và không lưu nữa',
        'info'
    );
}


/* ================================================================
   14. TEST SOUND — Web Audio API (no external file needed)
   ================================================================ */
function testSound() {
    try {
        var btn  = document.getElementById('stSoundTest');
        var icon = document.getElementById('stSoundTestIcon');

        if (!window.AudioContext && !window.webkitAudioContext) {
            showToast('Trình duyệt không hỗ trợ Web Audio API', 'error');
            return;
        }

        /* Visual feedback */
        if (btn)  btn.classList.add('playing');
        if (icon) icon.className = 'fas fa-music';

        /* Create a pleasant notification chime */
        var AudioCtx = window.AudioContext || window.webkitAudioContext;
        var ctx      = new AudioCtx();

        var notes = [
            { freq: 523.25, start: 0.00, dur: 0.18 },   /* C5 */
            { freq: 659.25, start: 0.12, dur: 0.18 },   /* E5 */
            { freq: 783.99, start: 0.24, dur: 0.28 },   /* G5 */
            { freq: 1046.5, start: 0.40, dur: 0.35 },   /* C6 */
        ];

        notes.forEach(function (note) {
            var osc  = ctx.createOscillator();
            var gain = ctx.createGain();

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.type      = 'sine';
            osc.frequency.setValueAtTime(note.freq, ctx.currentTime + note.start);

            gain.gain.setValueAtTime(0, ctx.currentTime + note.start);
            gain.gain.linearRampToValueAtTime(0.28, ctx.currentTime + note.start + 0.04);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + note.start + note.dur);

            osc.start(ctx.currentTime + note.start);
            osc.stop(ctx.currentTime  + note.start + note.dur);
        });

        /* Reset button after sound ends */
        var totalDur = 0.85;
        setTimeout(function () {
            try {
                if (btn)  btn.classList.remove('playing');
                if (icon) icon.className = 'fas fa-play';
                ctx.close();
            } catch (_) {}
        }, totalDur * 1000);

    } catch (err) {
        console.warn('[Settings] testSound:', err.message);
        showToast('Không thể phát âm thanh. Kiểm tra quyền trình duyệt.', 'error');

        var btn  = document.getElementById('stSoundTest');
        var icon = document.getElementById('stSoundTestIcon');
        if (btn)  btn.classList.remove('playing');
        if (icon) icon.className = 'fas fa-play';
    }
}


/* ================================================================
   15. RESET ALL
   ================================================================ */
function resetAll() {
    try {
        /* Confirm dialog */
        if (!window.confirm('Bạn có chắc muốn đặt lại tất cả cài đặt về mặc định?\nHành động này không thể hoàn tác.')) {
            return;
        }

        /* Remove all settings keys */
        Object.values(ST_KEYS).forEach(function (key) {
            try { localStorage.removeItem(key); } catch (_) {}
        });

        /* Reset internal state */
        _st.theme        = ST_DEFAULTS.theme;
        _st.lang         = ST_DEFAULTS.lang;
        _st.accentColor  = ST_DEFAULTS.accentColor;
        _st.fontSize     = ST_DEFAULTS.fontSize;
        _st.soundNotify  = ST_DEFAULTS.soundNotify === 'on';
        _st.orderNotify  = ST_DEFAULTS.orderNotify  === 'on';
        _st.promoNotify  = ST_DEFAULTS.promoNotify  === 'on';
        _st.reduceMotion = ST_DEFAULTS.reduceMotion === 'on';
        _st.saveSearch   = ST_DEFAULTS.saveSearch   === 'on';
        _st.saveChat     = ST_DEFAULTS.saveChat     === 'on';

        /* Remove injected style tags */
        ['stDarkOverrides', 'stAccentOverrides', 'stReduceMotionCSS'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.remove();
        });

        /* Re-apply defaults */
        document.body.classList.remove('dark-mode');
        document.documentElement.style.fontSize = FONT_SIZE_MAP.md;
        document.documentElement.setAttribute('lang', 'vi');
        _unwatchSystemTheme();

        /* Re-render UI */
        loadAllSettings();

        showToast('🔄 Đã đặt lại tất cả cài đặt về mặc định!', 'success');

    } catch (err) {
        console.warn('[Settings] resetAll:', err.message);
        showToast('Lỗi khi đặt lại cài đặt.', 'error');
    }
}


/* ================================================================
   16. ABOUT INFO
   ================================================================ */
function initAboutInfo() {
    try {
        /* Browser detection */
        var ua     = navigator.userAgent || '';
        var browser = 'Unknown';
        if      (ua.includes('Edg'))     browser = 'Microsoft Edge';
        else if (ua.includes('OPR'))     browser = 'Opera';
        else if (ua.includes('Chrome'))  browser = 'Google Chrome';
        else if (ua.includes('Safari'))  browser = 'Safari';
        else if (ua.includes('Firefox')) browser = 'Firefox';

        var bnEl = document.getElementById('stBrowserName');
        if (bnEl) bnEl.textContent = browser;

        /* Screen size */
        var ssEl = document.getElementById('stScreenSize');
        if (ssEl) ssEl.textContent = window.screen.width + ' × ' + window.screen.height;

        /* System theme */
        var stEl  = document.getElementById('stSystemTheme');
        var pref  = _getSystemPref();
        if (stEl) stEl.textContent = pref === 'dark' ? '🌙 Tối' : '☀️ Sáng';

    } catch (err) {
        console.warn('[Settings] initAboutInfo:', err.message);
    }
}


/* ================================================================
   17. NAV SCROLL HIGHLIGHT — highlight nav item on scroll
   ================================================================ */
function initNavScroll() {
    try {
        var sections = [
            'stSecAppearance',
            'stSecLanguage',
            'stSecNotification',
            'stSecPrivacy',
            'stSecAbout',
            'stSecReset',
        ];

        var handler = function () {
            try {
                var scrollY = window.scrollY || window.pageYOffset;
                var active  = sections[0];

                sections.forEach(function (id) {
                    var el = document.getElementById(id);
                    if (!el) return;
                    /* topbar height ~68px + some offset */
                    if (el.offsetTop - 100 <= scrollY) {
                        active = id;
                    }
                });

                document.querySelectorAll('.st-nav-item').forEach(function (item) {
                    var href = (item.getAttribute('href') || '').replace('#', '');
                    item.classList.toggle('active', href === active);
                });
            } catch (_) {}
        };

        window.addEventListener('scroll', handler, { passive: true });

    } catch (err) {
        console.warn('[Settings] initNavScroll:', err.message);
    }
}


/* ================================================================
   18. SAVED BADGE FLASH
   ================================================================ */
function _flashSavedBadge() {
    try {
        var badge = document.getElementById('stSavedBadge');
        if (!badge) return;

        badge.textContent = LANG_STRINGS[_st.lang] ? LANG_STRINGS[_st.lang].saved : '✅ Đã lưu';
        badge.style.transition = 'opacity .2s';
        badge.style.opacity    = '1';

        /* Quick pulse: dim → bright */
        badge.style.transform  = 'scale(1.12)';
        setTimeout(function () {
            try { badge.style.transform = 'scale(1)'; } catch (_) {}
        }, 160);

    } catch (_) {}
}


/* ================================================================
   19. TOAST
   ================================================================ */
function showToast(msg, type) {
    try {
        var container = document.getElementById('stToastContainer');
        if (!container) return;

        var iconMap = {
            success: 'fa-circle-check',
            error:   'fa-circle-xmark',
            warning: 'fa-triangle-exclamation',
            info:    'fa-circle-info',
        };
        var icon = iconMap[type] || 'fa-circle-info';

        var toast = document.createElement('div');
        toast.className = 'st-toast ' + (type || 'info');
        toast.innerHTML = '<i class="fas ' + icon + '"></i><span style="flex:1">' + _esc(msg) + '</span>';

        container.appendChild(toast);

        setTimeout(function () {
            try {
                toast.style.opacity    = '0';
                toast.style.transform  = 'translateX(14px)';
                toast.style.transition = 'all .25s ease';
                setTimeout(function () { try { toast.remove(); } catch (_) {} }, 260);
            } catch (_) {}
        }, 3200);

    } catch (_) {}
}


/* ================================================================
   20. HELPERS
   ================================================================ */

/** Toggle checkbox UI to match boolean value */
function _updateToggle(id, checked) {
    try {
        var el = document.getElementById(id);
        if (el) el.checked = !!checked;
    } catch (_) {}
}

/** localStorage safe get */
function _lsGet(key) {
    try { return localStorage.getItem(key); }
    catch (_) { return null; }
}

/** localStorage safe set */
function _lsSet(key, value) {
    try { localStorage.setItem(key, value); }
    catch (_) {}
}

/** XSS escape */
function _esc(str) {
    return String(str || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}


/* ================================================================
   21. PUBLIC API  — window.SettingsPage
       All functions called from HTML onclick/onchange must be here
   ================================================================ */
window.SettingsPage = {
    /* Theme */
    setTheme:        setTheme,
    /* Accent color */
    setAccent:       setAccent,
    /* Font size */
    setFontSize:     setFontSize,
    /* Language */
    setLang:         setLang,
    /* Notifications */
    setSoundNotify:  setSoundNotify,
    setOrderNotify:  setOrderNotify,
    setPromoNotify:  setPromoNotify,
    /* Reduce motion */
    setReduceMotion: setReduceMotion,
    /* Privacy */
    setSaveSearch:   setSaveSearch,
    setSaveChat:     setSaveChat,
    /* Actions */
    testSound:       testSound,
    resetAll:        resetAll,
    /* Expose apply functions for other pages */
    applyTheme:      applyTheme,
    applyAccent:     applyAccent,
    applyFontSize:   applyFontSize,
    applyLang:       applyLang,
    /* Expose showToast for external use */
    showToast:       showToast,
};


/* ================================================================
   22. GLOBAL APPLY ON ANY PAGE
       This block runs on EVERY page that includes settings.js.
       It reads localStorage and applies theme/accent/fontSize/lang
       so settings are persistent across the entire app.
   ================================================================ */
(function _applyOnAllPages() {
    try {
        /* Run immediately (before DOMContentLoaded) for fastest paint */
        var savedTheme   = _lsGet(ST_KEYS.theme)       || ST_DEFAULTS.theme;
        var savedAccent  = _lsGet(ST_KEYS.accentColor) || ST_DEFAULTS.accentColor;
        var savedSize    = _lsGet(ST_KEYS.fontSize)     || ST_DEFAULTS.fontSize;
        var savedMotion  = _lsGet(ST_KEYS.reduceMotion);

        /* Theme — must run ASAP to avoid flash */
        applyTheme(savedTheme);

        /* Accent */
        applyAccent(savedAccent);

        /* Font size */
        applyFontSize(savedSize);

        /* Reduce motion */
        if (savedMotion === 'on') applyReduceMotion(true);

    } catch (_) {
        /* Silent — never break the page */
    }
}());