/* ================================================================
   GOMEAL — CHATBOT.JS
   File: public/js/user/chatbot.js

   Widget chat nổi độc lập — dành cho tất cả trang User.
   Self-contained: tự inject CSS + HTML vào <body>.

   Tính năng:
     1.  injectCSS()          — Inject toàn bộ CSS chatbot vào <head>
     2.  injectHTML()         — Tạo DOM widget (FAB + cửa sổ chat)
     3.  initEvents()         — Bind open/close, send, ESC, click-outside
     4.  sendMessage()        — POST /api/user/public/chatbot/ask
     5.  appendMsg()          — Thêm bubble tin nhắn (user/bot)
     6.  showTyping()         — Hiện 3-dot typing indicator
     7.  hideTyping()         — Ẩn typing indicator
     8.  renderQuickReplies() — Các chip gợi ý câu hỏi
     9.  initTheme()          — Đọc localStorage 'theme' → apply body class
     10. toggleTheme()        — Đổi dark/light → lưu localStorage
     11. applyTheme()         — Apply class 'dark-mode' vào <body>
     12. initHistory()        — Đọc sessionStorage chat history
     13. saveHistory()        — Lưu sessionStorage chat history
     14. clearHistory()       — Xoá lịch sử chat
     15. showWelcome()        — Tin nhắn chào + quick replies
     16. initUnreadBadge()    — Hiện badge sau 3s nếu chưa mở
     17. initGuard()          — Không tạo widget 2 lần (idempotent)
     18. _esc()               — XSS escape

   API:
     POST /api/user/public/chatbot/ask
     Body: { message: string }
     Response 200: { response: string }
     Error:        { message: string }

   localStorage:
     'theme'  → 'dark' | 'light' | null  (persistent, across sessions)

   sessionStorage:
     'chatHistory' → JSON array of { role, text, ts } (current session only)

   Guard: Nếu layout.js đã inject chatbot widget → chatbot.js ENHANCE thêm
          theme switcher + quick replies, không tạo duplicate.
   ================================================================ */

(function (window, document) {
    'use strict';

    /* ================================================================
       0. CONFIG
       ================================================================ */
    var API_URL      = '/api/user/public/chatbot/ask';
    var LS_THEME_KEY = 'theme';
    var SS_HIST_KEY  = 'chatHistory';
    var MAX_HIST     = 40;           /* max messages giữ trong session */
    var WIDGET_ID    = 'cbWidget';   /* root element ID */

    /* Quick reply suggestions */
    var QUICK_REPLIES = [
        { label: '🍽️ Thực đơn có gì?',   text: 'Thực đơn có gì?' },
        { label: '🕐 Giờ mở cửa',         text: 'Giờ mở cửa là mấy giờ?' },
        { label: '🏷️ Khuyến mãi hôm nay', text: 'Có khuyến mãi không?' },
        { label: '📍 Địa chỉ nhà hàng',   text: 'Địa chỉ nhà hàng ở đâu?' },
        { label: '🛵 Giao hàng tận nơi',  text: 'Có giao hàng không?' },
    ];

    /* State */
    var _state = {
        open:    false,
        sending: false,
        theme:   'light',
        history: [],   /* [{ role: 'user'|'bot', text, ts }] */
    };


    /* ================================================================
       1. ENTRY — defer after DOM ready
       ================================================================ */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _boot);
    } else {
        _boot();
    }

    function _boot() {
        try {
            injectCSS();
            initGuard();
            initTheme();
            initHistory();
        } catch (err) {
            console.warn('[Chatbot] boot error:', err.message);
        }
    }


    /* ================================================================
       2. GUARD — idempotent, không tạo widget 2 lần
       ================================================================ */
    function initGuard() {
        /* Nếu layout.js đã tạo widget → chỉ ENHANCE thêm features */
        var existing = document.getElementById('chatbotWindow');
        if (existing) {
            _enhanceExisting();
            return;
        }
        /* Chưa có → tạo mới */
        injectHTML();
        initEvents();
        initUnreadBadge();
        showWelcome();
    }

    function _enhanceExisting() {
        try {
            /* Thêm theme toggle button vào header nếu chưa có */
            var hd = document.querySelector('.chat-hd');
            if (hd && !document.getElementById('cbThemeBtn')) {
                var themeBtn = document.createElement('button');
                themeBtn.id        = 'cbThemeBtn';
                themeBtn.className = 'cb-theme-btn';
                themeBtn.setAttribute('aria-label', 'Đổi giao diện');
                themeBtn.innerHTML = '<i class="fas fa-moon" id="cbThemeIcon"></i>';
                themeBtn.addEventListener('click', toggleTheme);
                /* Insert trước close button */
                var closeBtn = document.getElementById('chatbotClose');
                if (closeBtn) hd.insertBefore(themeBtn, closeBtn);
                else hd.appendChild(themeBtn);
            }

            /* Thêm quick replies nếu chưa có */
            var msgs = document.getElementById('chatbotMessages');
            if (msgs && !document.getElementById('cbQuickWrap')) {
                _appendQuickReplies(msgs);
            }

            /* Update theme icon */
            _updateThemeIcon();

        } catch (err) {
            console.warn('[Chatbot] _enhanceExisting:', err.message);
        }
    }


    /* ================================================================
       3. INJECT CSS — fully self-contained styles
       ================================================================ */
    function injectCSS() {
        if (document.getElementById('cbStyles')) return;

        var style = document.createElement('style');
        style.id  = 'cbStyles';
        style.textContent = [
            '/* ── ChatBot Widget Standalone CSS ── */',

            /* Root variables */
            ':root {',
            '  --cb-primary: #FF6B35;',
            '  --cb-primary-dark: #E85D28;',
            '  --cb-primary-grad: linear-gradient(135deg, #FF6B35, #F7931E);',
            '  --cb-bg: #fff;',
            '  --cb-surface: #F9F7F5;',
            '  --cb-border: #EEE9E4;',
            '  --cb-text: #111827;',
            '  --cb-text-muted: #9CA3AF;',
            '  --cb-bot-bubble: #F3F4F6;',
            '  --cb-bot-text: #111827;',
            '  --cb-user-bubble: linear-gradient(135deg,#FF6B35,#F7931E);',
            '  --cb-shadow: 0 20px 60px rgba(0,0,0,.18);',
            '  --cb-radius: 20px;',
            '  --cb-font: "Outfit", system-ui, sans-serif;',
            '}',

            /* Dark mode vars */
            'body.dark-mode {',
            '  --cb-bg: #1F2937;',
            '  --cb-surface: #111827;',
            '  --cb-border: #374151;',
            '  --cb-text: #F9FAFB;',
            '  --cb-text-muted: #6B7280;',
            '  --cb-bot-bubble: #374151;',
            '  --cb-bot-text: #F3F4F6;',
            '  --cb-shadow: 0 20px 60px rgba(0,0,0,.45);',
            '}',

            /* Widget root — bottom-right FAB */
            '.cb-root {',
            '  position: fixed;',
            '  bottom: 28px;',
            '  right: 28px;',
            '  z-index: 9999;',
            '  font-family: var(--cb-font);',
            '}',

            /* FAB button */
            '.cb-fab {',
            '  width: 58px; height: 58px;',
            '  border-radius: 50%;',
            '  background: var(--cb-primary-grad);',
            '  border: none; cursor: pointer;',
            '  display: flex; align-items: center; justify-content: center;',
            '  font-size: 1.3rem; color: #fff;',
            '  box-shadow: 0 8px 28px rgba(255,107,53,.50);',
            '  position: relative;',
            '  transition: transform .22s cubic-bezier(.34,1.56,.64,1), box-shadow .22s;',
            '  outline: none;',
            '}',
            '.cb-fab:hover { transform: scale(1.1); box-shadow: 0 12px 36px rgba(255,107,53,.65); }',
            '.cb-fab:active { transform: scale(.95); }',

            /* Pulse ring */
            '.cb-fab-pulse {',
            '  position: absolute; inset: -6px;',
            '  border-radius: 50%;',
            '  border: 2px solid rgba(255,107,53,.35);',
            '  animation: cbPulse 2.4s ease infinite;',
            '  pointer-events: none;',
            '}',
            '@keyframes cbPulse {',
            '  0%  { transform: scale(1);   opacity: 1; }',
            '  70% { transform: scale(1.3); opacity: 0; }',
            '  100%{ transform: scale(1.3); opacity: 0; }',
            '}',

            /* Unread badge */
            '.cb-unread {',
            '  position: absolute; top: -3px; right: -3px;',
            '  width: 20px; height: 20px; border-radius: 50%;',
            '  background: #EF4444; color: #fff;',
            '  font-size: .6rem; font-weight: 900;',
            '  display: none; align-items: center; justify-content: center;',
            '  border: 2px solid #fff;',
            '  animation: cbBadgePop .3s cubic-bezier(.34,1.56,.64,1);',
            '}',
            '@keyframes cbBadgePop { from{transform:scale(0)} to{transform:scale(1)} }',

            /* Chat window */
            '.cb-window {',
            '  position: absolute;',
            '  bottom: 72px; right: 0;',
            '  width: 360px;',
            '  max-height: 560px;',
            '  background: var(--cb-bg);',
            '  border-radius: var(--cb-radius);',
            '  border: 1px solid var(--cb-border);',
            '  box-shadow: var(--cb-shadow);',
            '  display: flex; flex-direction: column;',
            '  overflow: hidden;',
            '  opacity: 0;',
            '  transform: translateY(16px) scale(.96);',
            '  pointer-events: none;',
            '  transition: opacity .25s ease, transform .28s cubic-bezier(.34,1.56,.64,1);',
            '}',
            '.cb-window.open {',
            '  opacity: 1;',
            '  transform: translateY(0) scale(1);',
            '  pointer-events: all;',
            '}',

            /* Header */
            '.cb-hd {',
            '  background: var(--cb-primary-grad);',
            '  padding: 14px 16px;',
            '  display: flex; align-items: center; gap: 10px;',
            '  flex-shrink: 0;',
            '  position: relative; overflow: hidden;',
            '}',
            '.cb-hd::before {',
            '  content: ""; position: absolute;',
            '  width: 120px; height: 120px; border-radius: 50%;',
            '  background: rgba(255,255,255,.08);',
            '  right: -20px; top: -30px;',
            '  pointer-events: none;',
            '}',

            '.cb-hd-avatar {',
            '  width: 38px; height: 38px; border-radius: 50%;',
            '  background: rgba(255,255,255,.2);',
            '  display: flex; align-items: center; justify-content: center;',
            '  font-size: .9rem; color: #fff; flex-shrink: 0;',
            '  border: 2px solid rgba(255,255,255,.3);',
            '}',

            '.cb-hd-info { flex: 1; min-width: 0; }',
            '.cb-hd-name {',
            '  font-size: .84rem; font-weight: 800; color: #fff;',
            '  letter-spacing: -.01em; line-height: 1.1;',
            '}',
            '.cb-hd-status {',
            '  font-size: .62rem; color: rgba(255,255,255,.75);',
            '  display: flex; align-items: center; gap: 5px;',
            '  margin-top: 2px;',
            '}',
            '.cb-hd-status::before {',
            '  content: ""; width: 6px; height: 6px; border-radius: 50%;',
            '  background: #4ADE80;',
            '  box-shadow: 0 0 6px #4ADE80;',
            '  animation: cbStatusPulse 2s ease infinite;',
            '}',
            '@keyframes cbStatusPulse { 0%,100%{opacity:1} 50%{opacity:.4} }',

            /* Header action buttons */
            '.cb-hd-btn {',
            '  width: 30px; height: 30px; border-radius: 8px;',
            '  background: rgba(255,255,255,.15);',
            '  border: 1px solid rgba(255,255,255,.2);',
            '  color: #fff; font-size: .7rem;',
            '  display: flex; align-items: center; justify-content: center;',
            '  cursor: pointer; flex-shrink: 0;',
            '  transition: background .17s;',
            '  outline: none;',
            '}',
            '.cb-hd-btn:hover { background: rgba(255,255,255,.28); }',

            /* Messages area */
            '.cb-msgs {',
            '  flex: 1; overflow-y: auto;',
            '  padding: 14px 12px;',
            '  display: flex; flex-direction: column; gap: 10px;',
            '  scroll-behavior: smooth;',
            '  scrollbar-width: thin;',
            '  scrollbar-color: var(--cb-border) transparent;',
            '}',
            '.cb-msgs::-webkit-scrollbar { width: 4px; }',
            '.cb-msgs::-webkit-scrollbar-thumb {',
            '  background: var(--cb-border); border-radius: 4px;',
            '}',

            /* Message row */
            '.cb-msg {',
            '  display: flex; gap: 8px; align-items: flex-end;',
            '  animation: cbMsgIn .22s ease;',
            '}',
            '@keyframes cbMsgIn {',
            '  from { opacity:0; transform: translateY(10px); }',
            '  to   { opacity:1; transform: translateY(0); }',
            '}',
            '.cb-msg.user { flex-direction: row-reverse; }',

            '.cb-msg-avatar {',
            '  width: 28px; height: 28px; border-radius: 50%;',
            '  background: var(--cb-primary-grad);',
            '  display: flex; align-items: center; justify-content: center;',
            '  font-size: .65rem; color: #fff; flex-shrink: 0;',
            '  border: 1.5px solid var(--cb-border);',
            '}',
            '.cb-msg.user .cb-msg-avatar { background: #E5E7EB; color: #6B7280; }',

            '.cb-bubble {',
            '  max-width: 75%;',
            '  padding: 10px 13px;',
            '  border-radius: 16px;',
            '  font-size: .82rem;',
            '  line-height: 1.55;',
            '  word-break: break-word;',
            '  position: relative;',
            '}',

            /* Bot bubble */
            '.cb-msg.bot .cb-bubble {',
            '  background: var(--cb-bot-bubble);',
            '  color: var(--cb-bot-text);',
            '  border-bottom-left-radius: 4px;',
            '}',

            /* User bubble */
            '.cb-msg.user .cb-bubble {',
            '  background: var(--cb-user-bubble);',
            '  color: #fff;',
            '  border-bottom-right-radius: 4px;',
            '}',

            /* Timestamp */
            '.cb-ts {',
            '  font-size: .58rem;',
            '  color: var(--cb-text-muted);',
            '  margin-top: 3px;',
            '  text-align: right;',
            '}',
            '.cb-msg.bot .cb-ts { text-align: left; }',

            /* Typing indicator */
            '.cb-typing-dots {',
            '  display: flex; gap: 5px;',
            '  align-items: center; padding: 4px 2px;',
            '}',
            '.cb-typing-dots span {',
            '  width: 7px; height: 7px; border-radius: 50%;',
            '  background: var(--cb-text-muted);',
            '  animation: cbDot 1.2s ease infinite;',
            '}',
            '.cb-typing-dots span:nth-child(2) { animation-delay: .2s; }',
            '.cb-typing-dots span:nth-child(3) { animation-delay: .4s; }',
            '@keyframes cbDot {',
            '  0%,60%,100% { transform: translateY(0); opacity:.5; }',
            '  30%          { transform: translateY(-5px); opacity:1; }',
            '}',

            /* Quick replies */
            '.cb-quick-wrap {',
            '  display: flex; flex-wrap: wrap; gap: 6px;',
            '  padding: 4px 0 6px;',
            '}',
            '.cb-quick-label {',
            '  font-size: .6rem; font-weight: 700;',
            '  color: var(--cb-text-muted); text-transform: uppercase;',
            '  letter-spacing: .08em; width: 100%; margin-bottom: 2px;',
            '}',
            '.cb-quick-btn {',
            '  display: inline-flex; align-items: center; gap: 5px;',
            '  padding: 6px 12px; border-radius: 99px;',
            '  background: var(--cb-surface);',
            '  border: 1.5px solid var(--cb-border);',
            '  color: var(--cb-text); font-family: var(--cb-font);',
            '  font-size: .7rem; font-weight: 700;',
            '  cursor: pointer; white-space: nowrap;',
            '  transition: all .17s;',
            '  outline: none;',
            '}',
            '.cb-quick-btn:hover {',
            '  border-color: var(--cb-primary);',
            '  color: var(--cb-primary);',
            '  background: rgba(255,107,53,.06);',
            '  transform: translateY(-1px);',
            '}',

            /* Date divider */
            '.cb-date-divider {',
            '  display: flex; align-items: center; gap: 8px;',
            '  font-size: .6rem; color: var(--cb-text-muted);',
            '  font-weight: 600; letter-spacing: .06em;',
            '}',
            '.cb-date-divider::before,.cb-date-divider::after {',
            '  content: ""; flex: 1; height: 1px;',
            '  background: var(--cb-border);',
            '}',

            /* Input area */
            '.cb-input-wrap {',
            '  padding: 10px 12px 12px;',
            '  border-top: 1px solid var(--cb-border);',
            '  display: flex; gap: 8px; align-items: flex-end;',
            '  flex-shrink: 0;',
            '  background: var(--cb-bg);',
            '}',

            '.cb-inp {',
            '  flex: 1; border: 1.5px solid var(--cb-border);',
            '  border-radius: 12px; padding: 9px 13px;',
            '  font-family: var(--cb-font); font-size: .82rem;',
            '  color: var(--cb-text); background: var(--cb-surface);',
            '  outline: none; resize: none;',
            '  transition: border-color .18s, box-shadow .18s;',
            '  line-height: 1.45;',
            '  min-height: 38px; max-height: 90px;',
            '  overflow-y: auto;',
            '}',
            '.cb-inp:focus {',
            '  border-color: var(--cb-primary);',
            '  box-shadow: 0 0 0 3px rgba(255,107,53,.12);',
            '  background: var(--cb-bg);',
            '}',
            '.cb-inp::placeholder { color: var(--cb-text-muted); }',

            '.cb-send-btn {',
            '  width: 38px; height: 38px; border-radius: 12px;',
            '  background: var(--cb-primary-grad);',
            '  border: none; color: #fff;',
            '  font-size: .82rem;',
            '  display: flex; align-items: center; justify-content: center;',
            '  cursor: pointer; flex-shrink: 0;',
            '  box-shadow: 0 4px 14px rgba(255,107,53,.40);',
            '  transition: all .2s cubic-bezier(.34,1.56,.64,1);',
            '  outline: none;',
            '}',
            '.cb-send-btn:hover:not(:disabled) { transform: scale(1.1); box-shadow: 0 6px 20px rgba(255,107,53,.55); }',
            '.cb-send-btn:active:not(:disabled) { transform: scale(.94); }',
            '.cb-send-btn:disabled { opacity: .45; cursor: not-allowed; transform: none; }',

            /* Char counter */
            '.cb-char-count {',
            '  font-size: .58rem; color: var(--cb-text-muted);',
            '  text-align: right; padding: 0 2px 6px;',
            '  flex-basis: 100%;',
            '  order: 10;',
            '}',
            '.cb-char-count.warn { color: #EF4444; }',

            /* Footer powered-by */
            '.cb-footer {',
            '  padding: 6px 12px 8px;',
            '  text-align: center;',
            '  font-size: .58rem;',
            '  color: var(--cb-text-muted);',
            '  border-top: 1px solid var(--cb-border);',
            '  letter-spacing: .04em;',
            '  flex-shrink: 0;',
            '}',

            /* Keyword hint strip */
            '.cb-hint-strip {',
            '  padding: 8px 12px;',
            '  background: rgba(255,107,53,.06);',
            '  border-top: 1px solid rgba(255,107,53,.12);',
            '  font-size: .64rem; color: var(--cb-text-muted);',
            '  display: flex; align-items: center; gap: 6px;',
            '  flex-shrink: 0;',
            '}',
            '.cb-hint-strip i { color: var(--cb-primary); font-size: .6rem; }',

            /* Clear history button */
            '.cb-clear-btn {',
            '  margin-top: 4px;',
            '  width: 100%;',
            '  padding: 5px;',
            '  background: transparent;',
            '  border: 1px dashed var(--cb-border);',
            '  border-radius: 8px;',
            '  color: var(--cb-text-muted);',
            '  font-family: var(--cb-font);',
            '  font-size: .62rem; font-weight: 600;',
            '  cursor: pointer;',
            '  transition: all .17s;',
            '}',
            '.cb-clear-btn:hover { border-color: #EF4444; color: #EF4444; background: #FEF2F2; }',

            /* Dark mode body styles */
            'body.dark-mode .cb-window { border-color: #374151; }',

            /* Responsive */
            '@media (max-width: 480px) {',
            '  .cb-root { bottom: 16px; right: 14px; }',
            '  .cb-window { width: calc(100vw - 28px); right: 0; bottom: 68px; }',
            '  .cb-fab { width: 52px; height: 52px; font-size: 1.15rem; }',
            '}',

        ].join('\n');

        document.head.appendChild(style);
    }


    /* ================================================================
       4. INJECT HTML — Widget DOM
       ================================================================ */
    function injectHTML() {
        /* Layout.js có thể đã inject DIV#chatbotBubble → dùng nó */
        var container = document.getElementById('chatbotBubble');

        /* Nếu DIV đó không có → hoặc widget chúng ta đã mount → bail */
        if (!container) {
            container = document.body;
        }

        var root = document.createElement('div');
        root.id        = WIDGET_ID;
        root.className = 'cb-root';

        root.innerHTML = [
            /* FAB */
            '<button class="cb-fab" id="cbFab" aria-label="Mở hỗ trợ">',
            '  <div class="cb-fab-pulse"></div>',
            '  <i class="fas fa-comment-dots"></i>',
            '  <span class="cb-unread" id="cbUnread">1</span>',
            '</button>',

            /* Window */
            '<div class="cb-window" id="cbWindow" role="dialog" aria-label="Chat hỗ trợ">',

            /* Header */
            '  <div class="cb-hd">',
            '    <div class="cb-hd-avatar"><i class="fas fa-robot"></i></div>',
            '    <div class="cb-hd-info">',
            '      <div class="cb-hd-name">GoMeal Assistant</div>',
            '      <div class="cb-hd-status">Đang hoạt động</div>',
            '    </div>',
            /* Theme toggle */
            '    <button class="cb-hd-btn" id="cbThemeBtn" aria-label="Đổi giao diện" title="Dark / Light">',
            '      <i class="fas fa-moon" id="cbThemeIcon"></i>',
            '    </button>',
            /* Clear button */
            '    <button class="cb-hd-btn" id="cbClearBtn" aria-label="Xoá lịch sử" title="Xoá lịch sử">',
            '      <i class="fas fa-trash-can"></i>',
            '    </button>',
            /* Close */
            '    <button class="cb-hd-btn" id="cbClose" aria-label="Đóng">',
            '      <i class="fas fa-xmark"></i>',
            '    </button>',
            '  </div>',

            /* Keyword hint */
            '  <div class="cb-hint-strip">',
            '    <i class="fas fa-lightbulb"></i>',
            '    Hỏi về: <strong>thực đơn</strong>, <strong>giờ mở cửa</strong>, <strong>khuyến mãi</strong>',
            '  </div>',

            /* Messages */
            '  <div class="cb-msgs" id="cbMsgs"></div>',

            /* Input area */
            '  <div class="cb-input-wrap">',
            '    <input type="text" class="cb-inp" id="cbInp"',
            '           placeholder="Nhập câu hỏi của bạn..." maxlength="200"',
            '           autocomplete="off" spellcheck="false">',
            '    <button class="cb-send-btn" id="cbSend" aria-label="Gửi">',
            '      <i class="fas fa-paper-plane"></i>',
            '    </button>',
            '  </div>',

            /* Footer */
            '  <div class="cb-footer">',
            '    ⚡ Powered by GoMeal AI · Keyword-based',
            '  </div>',

            '</div>', /* /cb-window */
        ].join('');

        container.appendChild(root);
    }


    /* ================================================================
       5. INIT EVENTS
       ================================================================ */
    function initEvents() {
        var fab      = document.getElementById('cbFab');
        var win      = document.getElementById('cbWindow');
        var closeBtn = document.getElementById('cbClose');
        var themeBtn = document.getElementById('cbThemeBtn');
        var clearBtn = document.getElementById('cbClearBtn');
        var inp      = document.getElementById('cbInp');
        var sendBtn  = document.getElementById('cbSend');

        if (!fab || !win) return;

        /* FAB toggle */
        fab.addEventListener('click', function () {
            _state.open ? _closeChat() : _openChat();
        });

        if (closeBtn) closeBtn.addEventListener('click', _closeChat);
        if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
        if (clearBtn) clearBtn.addEventListener('click', clearHistory);

        /* Send */
        if (sendBtn) sendBtn.addEventListener('click', sendMessage);
        if (inp) {
            inp.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });
        }

        /* ESC */
        document.addEventListener('keydown', function (e) {
            try { if (e.key === 'Escape' && _state.open) _closeChat(); } catch (_) {}
        });

        /* Click outside to close */
        document.addEventListener('click', function (e) {
            try {
                var root = document.getElementById(WIDGET_ID);
                if (root && !root.contains(e.target) && _state.open) {
                    /* Don't close on outside click — better UX for typing */
                }
            } catch (_) {}
        });
    }


    /* ================================================================
       6. OPEN / CLOSE
       ================================================================ */
    function _openChat() {
        var win    = document.getElementById('cbWindow');
        var unread = document.getElementById('cbUnread');

        if (!win) return;
        win.classList.add('open');
        _state.open = true;
        if (unread) unread.style.display = 'none';

        var inp = document.getElementById('cbInp');
        if (inp) setTimeout(function () { inp.focus(); }, 120);
    }

    function _closeChat() {
        var win = document.getElementById('cbWindow');
        if (!win) return;
        win.classList.remove('open');
        _state.open = false;
    }


    /* ================================================================
       7. SEND MESSAGE — POST /api/user/public/chatbot/ask
       ================================================================ */
    async function sendMessage() {
        if (_state.sending) return;

        var inp     = document.getElementById('cbInp');
        var sendBtn = document.getElementById('cbSend');
        var text    = inp ? inp.value.trim() : '';

        if (!text) return;

        _state.sending = true;
        if (inp)     inp.value = '';
        if (sendBtn) sendBtn.disabled = true;

        /* Remove quick replies after first message */
        var qw = document.getElementById('cbQuickWrap');
        if (qw) qw.style.display = 'none';

        appendMsg(text, 'user');
        showTyping();

        try {
            var res = await fetch(API_URL, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ message: text }),
            });

            hideTyping();

            if (res.ok) {
                var data = await res.json();
                var reply = (data && data.response) ? data.response : 'Xin lỗi, tôi không hiểu. Thử hỏi về thực đơn, giờ mở cửa hoặc khuyến mãi nhé!';
                appendMsg(reply, 'bot');
            } else {
                appendMsg('Xin lỗi, có lỗi xảy ra. Vui lòng thử lại!', 'bot');
            }

        } catch (err) {
            hideTyping();
            appendMsg('Không thể kết nối máy chủ. Kiểm tra mạng và thử lại nhé! 🌐', 'bot');
            console.warn('[Chatbot] sendMessage error:', err.message);
        } finally {
            _state.sending = false;
            if (sendBtn) sendBtn.disabled = false;
            if (inp)     inp.focus();
        }
    }


    /* ================================================================
       8. APPEND MESSAGE BUBBLE
       ================================================================ */
    function appendMsg(text, role, skipHistory) {
        var msgs = document.getElementById('cbMsgs');
        if (!msgs) return;

        var now = new Date();
        var ts  = _fmtTime(now);

        var div = document.createElement('div');
        div.className = 'cb-msg ' + role;

        if (role === 'bot') {
            div.innerHTML = [
                '<div class="cb-msg-avatar"><i class="fas fa-robot"></i></div>',
                '<div>',
                '  <div class="cb-bubble">' + _esc(text) + '</div>',
                '  <div class="cb-ts">' + ts + '</div>',
                '</div>',
            ].join('');
        } else {
            div.innerHTML = [
                '<div class="cb-msg-avatar"><i class="fas fa-user"></i></div>',
                '<div>',
                '  <div class="cb-bubble">' + _esc(text) + '</div>',
                '  <div class="cb-ts">' + ts + '</div>',
                '</div>',
            ].join('');
        }

        msgs.appendChild(div);
        msgs.scrollTop = msgs.scrollHeight;

        /* Save to history */
        if (!skipHistory) {
            _state.history.push({ role: role, text: text, ts: now.toISOString() });
            if (_state.history.length > MAX_HIST) {
                _state.history = _state.history.slice(-MAX_HIST);
            }
            saveHistory();
        }
    }


    /* ================================================================
       9. TYPING INDICATOR
       ================================================================ */
    var _typingEl = null;

    function showTyping() {
        var msgs = document.getElementById('cbMsgs');
        if (!msgs || _typingEl) return;

        _typingEl = document.createElement('div');
        _typingEl.className = 'cb-msg bot';
        _typingEl.innerHTML = [
            '<div class="cb-msg-avatar"><i class="fas fa-robot"></i></div>',
            '<div class="cb-bubble">',
            '  <div class="cb-typing-dots">',
            '    <span></span><span></span><span></span>',
            '  </div>',
            '</div>',
        ].join('');

        msgs.appendChild(_typingEl);
        msgs.scrollTop = msgs.scrollHeight;
    }

    function hideTyping() {
        if (_typingEl && _typingEl.parentNode) {
            _typingEl.parentNode.removeChild(_typingEl);
        }
        _typingEl = null;
    }


    /* ================================================================
       10. QUICK REPLIES
       ================================================================ */
    function renderQuickReplies() {
        var msgs = document.getElementById('cbMsgs');
        if (!msgs) return;
        _appendQuickReplies(msgs);
    }

    function _appendQuickReplies(msgs) {
        var wrap = document.createElement('div');
        wrap.id        = 'cbQuickWrap';
        wrap.className = 'cb-quick-wrap';

        var label = document.createElement('div');
        label.className   = 'cb-quick-label';
        label.textContent = 'Gợi ý câu hỏi';
        wrap.appendChild(label);

        QUICK_REPLIES.forEach(function (qr) {
            var btn = document.createElement('button');
            btn.className   = 'cb-quick-btn';
            btn.textContent = qr.label;
            btn.addEventListener('click', function () {
                var inp = document.getElementById('cbInp');
                if (inp) {
                    inp.value = qr.text;
                    /* Hide quick replies */
                    wrap.style.display = 'none';
                    sendMessage();
                }
            });
            wrap.appendChild(btn);
        });

        msgs.appendChild(wrap);
        msgs.scrollTop = msgs.scrollHeight;
    }


    /* ================================================================
       11. SHOW WELCOME MESSAGE
       ================================================================ */
    function showWelcome() {
        var msgs = document.getElementById('cbMsgs');
        if (!msgs) return;

        /* If we have history, restore it */
        if (_state.history.length > 0) {
            _restoreHistory(msgs);
            return;
        }

        /* Date divider */
        var divider = document.createElement('div');
        divider.className   = 'cb-date-divider';
        divider.textContent = _fmtDate(new Date());
        msgs.appendChild(divider);

        /* Welcome message */
        appendMsg(
            'Xin chào! 👋 Tôi là GoMeal Assistant. Bạn có thể hỏi tôi về thực đơn, giờ mở cửa, khuyến mãi hoặc bất kỳ điều gì về nhà hàng!',
            'bot',
            true   /* skipHistory — welcome không lưu vào history */
        );

        renderQuickReplies();
    }


    /* ================================================================
       12. THEME — Dark / Light mode
       ================================================================ */
    function initTheme() {
        try {
            var saved = localStorage.getItem(LS_THEME_KEY);
            _state.theme = (saved === 'dark') ? 'dark' : 'light';
            applyTheme(_state.theme);
        } catch (_) {
            _state.theme = 'light';
        }
    }

    function toggleTheme() {
        _state.theme = (_state.theme === 'dark') ? 'light' : 'dark';
        applyTheme(_state.theme);

        try {
            localStorage.setItem(LS_THEME_KEY, _state.theme);
        } catch (_) {}

        _updateThemeIcon();

        /* Toast-style feedback */
        _showThemeFeedback(_state.theme);
    }

    function applyTheme(theme) {
        if (theme === 'dark') {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
        _updateThemeIcon();
    }

    function _updateThemeIcon() {
        var iconEl = document.getElementById('cbThemeIcon');
        if (!iconEl) return;

        if (_state.theme === 'dark') {
            iconEl.className = 'fas fa-sun';
        } else {
            iconEl.className = 'fas fa-moon';
        }
    }

    function _showThemeFeedback(theme) {
        /* Show micro-toast inside chat */
        var msgs = document.getElementById('cbMsgs');
        if (!msgs) return;

        var note = document.createElement('div');
        note.style.cssText = [
            'text-align:center;font-size:.6rem;',
            'color:var(--cb-text-muted);',
            'padding:4px 0;',
            'animation:cbMsgIn .2s ease',
        ].join('');
        note.textContent = theme === 'dark' ? '🌙 Chế độ tối đã bật' : '☀️ Chế độ sáng đã bật';

        msgs.appendChild(note);
        msgs.scrollTop = msgs.scrollHeight;

        /* Auto remove after 2s */
        setTimeout(function () {
            try { msgs.removeChild(note); } catch (_) {}
        }, 2000);
    }


    /* ================================================================
       13. CHAT HISTORY — sessionStorage
       ================================================================ */
    function initHistory() {
        try {
            var raw = sessionStorage.getItem(SS_HIST_KEY);
            if (raw) {
                var parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    _state.history = parsed;
                }
            }
        } catch (_) {
            _state.history = [];
        }
    }

    function saveHistory() {
        try {
            sessionStorage.setItem(SS_HIST_KEY, JSON.stringify(_state.history));
        } catch (_) {}
    }

    function clearHistory() {
        try {
            _state.history = [];
            sessionStorage.removeItem(SS_HIST_KEY);

            var msgs = document.getElementById('cbMsgs');
            if (msgs) msgs.innerHTML = '';

            showWelcome();
        } catch (err) {
            console.warn('[Chatbot] clearHistory:', err.message);
        }
    }

    function _restoreHistory(msgs) {
        /* Date divider */
        var divider = document.createElement('div');
        divider.className   = 'cb-date-divider';
        divider.textContent = 'Lịch sử hôm nay';
        msgs.appendChild(divider);

        /* Render history without re-saving */
        _state.history.slice(-MAX_HIST).forEach(function (item) {
            appendMsg(item.text, item.role, true);
        });

        msgs.scrollTop = msgs.scrollHeight;
    }


    /* ================================================================
       14. UNREAD BADGE — hiện sau 3s nếu chưa mở
       ================================================================ */
    function initUnreadBadge() {
        /* Chỉ hiện nếu chưa có history (lần đầu vào trang) */
        if (_state.history.length > 0) return;

        setTimeout(function () {
            try {
                var unread = document.getElementById('cbUnread');
                if (unread && !_state.open) {
                    unread.style.display = 'flex';
                }
            } catch (_) {}
        }, 3000);
    }


    /* ================================================================
       15. UTILITIES
       ================================================================ */
    function _esc(str) {
        return String(str || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _fmtTime(d) {
        var h  = String(d.getHours()).padStart(2, '0');
        var m  = String(d.getMinutes()).padStart(2, '0');
        return h + ':' + m;
    }

    function _fmtDate(d) {
        var days   = ['Chủ nhật','Thứ hai','Thứ ba','Thứ tư','Thứ năm','Thứ sáu','Thứ bảy'];
        var months = d.getMonth() + 1;
        return days[d.getDay()] + ', ' + d.getDate() + '/' + months + '/' + d.getFullYear();
    }


    /* ================================================================
       16. PUBLIC API (window.Chatbot)
       ================================================================ */
    window.Chatbot = {
        open:        _openChat,
        close:       _closeChat,
        send:        sendMessage,
        toggleTheme: toggleTheme,
        applyTheme:  applyTheme,
        clearHistory:clearHistory,
        getTheme:    function () { return _state.theme; },
        getHistory:  function () { return _state.history.slice(); },
    };

}(window, document));