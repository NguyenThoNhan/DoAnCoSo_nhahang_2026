/* ================================================================
   GOMEAL — MESSAGES.JS
   File: public/js/user/messages.js

   Trang Tin nhắn toàn màn hình — views/user/messages.html
   Trang PUBLIC — không cần authToken.

   Kiến trúc: File riêng độc lập, KHÔNG phụ thuộc chatbot.js.
   Cùng chia sẻ localStorage key 'theme' với chatbot.js widget.

   ┌─ Chức năng ────────────────────────────────────────────────────┐
   │  1.  init()               — DOMContentLoaded entry point       │
   │  2.  initTheme()          — Đọc + áp dụng dark/light mode      │
   │  3.  toggleTheme()        — Đổi theme → lưu localStorage       │
   │  4.  applyTheme()         — Add/remove class dark-mode vào body │
   │  5.  switchConv()         — Chuyển giữa AI và Admin conv       │
   │  6.  renderAiConv()       — Hiển thị giao diện chat AI         │
   │  7.  renderAdminConv()    — Hiển thị giao diện phản hồi admin  │
   │  8.  sendAiMessage()      — POST /api/user/public/chatbot/ask  │
   │  9.  appendMsg()          — Thêm bubble vào khung chat         │
   │  10. showTyping()         — Hiện "Bot đang gõ..." typing anim  │
   │  11. hideTyping()         — Ẩn typing indicator                 │
   │  12. autoResizeInp()      — Auto-resize textarea               │
   │  13. initQuickReplies()   — Bind quick-chip click events       │
   │  14. initEmojiPicker()    — Tạo + toggle emoji picker          │
   │  15. initFeedbackPanel()  — Panel phản hồi gửi admin (local)   │
   │  16. sendFeedback()       — Giả lập gửi phản hồi admin        │
   │  17. loadHistory()        — Đọc sessionStorage chat history    │
   │  18. saveHistory()        — Lưu sessionStorage chat history    │
   │  19. clearHistory()       — Xoá lịch sử + reset view          │
   │  20. renderDateDivider()  — Dải ngày phân cách messages        │
   │  21. updateConvPreview()  — Cập nhật preview sidebar           │
   │  22. initTopbar()         — Greeting, avatar topbar            │
   │  23. showToast()          — Thông báo inline                   │
   │  24. _esc()               — XSS escape helper                  │
   │  25. _fmtTime()           — Format HH:MM                       │
   │  26. _fmtDate()           — Format ngày tuần                   │
   └────────────────────────────────────────────────────────────────┘

   API dùng:
     POST /api/user/public/chatbot/ask
     Body:     { message: string }
     Response: { response: string }  |  { message: string }(error)

   localStorage keys (đọc + ghi):
     'theme'       → 'dark' | 'light'   (shared với chatbot.js)

   sessionStorage keys:
     'mg_ai_hist'  → JSON array { role, text, ts }  (AI conversation)
     'mg_admin_hist'→ JSON array { role, text, ts } (Admin messages)

   Không tạo route mới. Không phá layout user.
   ================================================================ */

'use strict';

/* ================================================================
   0. CONSTANTS & STATE
   ================================================================ */
var MG_API_URL      = '/api/user/public/chatbot/ask';
var MG_LS_THEME     = 'theme';
var MG_SS_AI_HIST   = 'mg_ai_hist';
var MG_SS_ADM_HIST  = 'mg_admin_hist';
var MG_MAX_HIST     = 60;

/* Emoji set cho picker */
var MG_EMOJIS = [
    '😊','😋','🤤','😍','👍','👋','❤️','🔥',
    '🍽️','🍜','🍗','🍔','🍕','🥗','🍱','🍣',
    '☕','🧋','🥤','🍹','🎉','✅','⭐','💯',
];

/* Trạng thái page */
var _mg = {
    activeConv:  'ai',     /* 'ai' | 'admin' */
    sending:     false,
    typingEl:    null,
    theme:       'light',
    aiHistory:   [],
    adminHistory:[],
    fbCategory:  'Chất lượng món ăn',
    emojiOpen:   false,
    feedbackOpen:false,
};

/* Nội dung intro cho từng conversation */
var CONV_META = {
    ai: {
        name:       'GoMeal Assistant',
        avatarClass:'ai',
        avatarIcon: 'fas fa-robot',
        statusText: 'Đang hoạt động',
        statusOnline:true,
        welcome:    'Xin chào! 👋 Tôi là <strong>GoMeal Assistant</strong> — trợ lý AI của nhà hàng.\n\nBạn có thể hỏi tôi về <strong>thực đơn</strong>, <strong>giờ mở cửa</strong>, <strong>khuyến mãi</strong> hoặc bất kỳ điều gì về nhà hàng. Tôi sẽ cố gắng trả lời chính xác nhất! 🍽️',
    },
    admin: {
        name:       'Hỗ trợ nhà hàng',
        avatarClass:'admin',
        avatarIcon: 'fas fa-headset',
        statusText: 'Phản hồi trong 1–2 giờ',
        statusOnline:false,
        welcome:    '👋 Kênh <strong>Hỗ trợ nhà hàng</strong>.\n\nBạn có thể gửi phản hồi, góp ý hoặc yêu cầu hỗ trợ tại đây. Nhấn nút <strong>📝 Gửi phản hồi</strong> ở góc trên để bắt đầu.',
    },
};


/* ================================================================
   1. ENTRY POINT
   ================================================================ */
document.addEventListener('DOMContentLoaded', function mgInit() {
    try {
        initTheme();
        loadHistory();
        initTopbar();
        initQuickReplies();
        initInputEvents();
        initEmojiPicker();
        initFeedbackPanel();
        initHeaderActions();
        renderAiConv();         /* mặc định mở AI conv */
        _mg.activeConv = 'ai';
    } catch (err) {
        console.error('[Messages] init error:', err.message);
    }
});

/* Expose cho inline onclick trong HTML */
window.MessagesPage = {
    switchConv: switchConv,
};


/* ================================================================
   2. THEME — Dark / Light mode (shared với chatbot.js)
   ================================================================ */
function initTheme() {
    try {
        var saved = localStorage.getItem(MG_LS_THEME);
        _mg.theme = (saved === 'dark') ? 'dark' : 'light';
        applyTheme(_mg.theme);
        _updateThemeIcon();
    } catch (_) {}
}

function toggleTheme() {
    _mg.theme = (_mg.theme === 'dark') ? 'light' : 'dark';
    applyTheme(_mg.theme);
    try { localStorage.setItem(MG_LS_THEME, _mg.theme); } catch (_) {}
    _updateThemeIcon();
    showToast(_mg.theme === 'dark' ? '🌙 Chế độ tối đã bật' : '☀️ Chế độ sáng đã bật', 'info');
}

function applyTheme(theme) {
    if (theme === 'dark') {
        document.body.classList.add('dark-mode');
        _injectDarkCSS();
    } else {
        document.body.classList.remove('dark-mode');
    }
}

function _updateThemeIcon() {
    var icon = document.getElementById('mgThemeIcon');
    var btn  = document.getElementById('mgThemeBtn');
    if (!icon) return;
    if (_mg.theme === 'dark') {
        icon.className = 'fas fa-sun';
        if (btn) btn.classList.add('active');
    } else {
        icon.className = 'fas fa-moon';
        if (btn) btn.classList.remove('active');
    }
}

/* Inject dark-mode CSS một lần cho .mg- elements */
function _injectDarkCSS() {
    if (document.getElementById('mgDarkStyles')) return;
    var s = document.createElement('style');
    s.id  = 'mgDarkStyles';
    s.textContent = [
        'body.dark-mode .mg-sidebar { background:#111827; border-color:#374151; }',
        'body.dark-mode .mg-sb-header { border-color:#374151; }',
        'body.dark-mode .mg-sb-title { color:#F9FAFB; }',
        'body.dark-mode .mg-conv-item:hover { background:#1F2937; }',
        'body.dark-mode .mg-conv-item.active { background:#1F2937; border-color:#FF6B35; }',
        'body.dark-mode .mg-conv-name { color:#F3F4F6; }',
        'body.dark-mode .mg-conv-preview { color:#6B7280; }',
        'body.dark-mode .mg-chat-panel { background:#1a1a2e; }',
        'body.dark-mode .mg-chat-hd { background:#111827; border-color:#374151; }',
        'body.dark-mode .mg-chat-hd-name { color:#F9FAFB; }',
        'body.dark-mode .mg-hd-btn { background:#1F2937; border-color:#374151; color:#9CA3AF; }',
        'body.dark-mode .mg-hd-btn:hover { background:#374151; color:#FF6B35; border-color:#FF6B35; }',
        'body.dark-mode .mg-msgs-wrap { background:linear-gradient(180deg,#111827 0%,#1a1a2e 100%); }',
        'body.dark-mode .mg-msg.bot .mg-bubble { background:#1F2937; color:#F3F4F6; }',
        'body.dark-mode .mg-msg.admin .mg-bubble { background:#1e1b4b; color:#c4b5fd; border-color:#4c1d95; }',
        'body.dark-mode .mg-date-divider { color:#4B5563; }',
        'body.dark-mode .mg-ts { color:#4B5563; }',
        'body.dark-mode .mg-sender-label { color:#4B5563; }',
        'body.dark-mode .mg-quick-strip { background:#111827; border-color:#374151; }',
        'body.dark-mode .mg-quick-label { color:#4B5563; }',
        'body.dark-mode .mg-quick-chip { background:#1F2937; border-color:#374151; color:#D1D5DB; }',
        'body.dark-mode .mg-quick-chip:hover { background:#374151; border-color:#FF6B35; color:#FF6B35; }',
        'body.dark-mode .mg-input-bar { background:#111827; border-color:#374151; }',
        'body.dark-mode .mg-inp-wrap { background:#1F2937; border-color:#374151; }',
        'body.dark-mode .mg-inp-wrap:focus-within { background:#111827; border-color:#FF6B35; }',
        'body.dark-mode .mg-inp { color:#F9FAFB; }',
        'body.dark-mode .mg-typing-bubble { background:#1F2937; }',
        'body.dark-mode .mg-feedback-panel { background:#1F2937; border-color:#374151; }',
        'body.dark-mode .mg-fb-title { color:#F3F4F6; }',
        'body.dark-mode .mg-fb-textarea { background:#111827; border-color:#374151; color:#F3F4F6; }',
        'body.dark-mode .mg-fb-cat { background:#111827; border-color:#374151; color:#9CA3AF; }',
        'body.dark-mode .mg-fb-cat.selected { background:#1a0a00; border-color:#FF6B35; color:#FF6B35; }',
        'body.dark-mode .mg-emoji-picker { background:#1F2937; border-color:#374151; }',
        'body.dark-mode .mg-emoji-item:hover { background:#374151; }',
        'body.dark-mode .mg-msg-avatar.user-av { background:#374151; color:#9CA3AF; }',
    ].join('\n');
    document.head.appendChild(s);
}


/* ================================================================
   3. SWITCH CONVERSATION
   ================================================================ */
function switchConv(convId) {
    try {
        if (_mg.activeConv === convId) return;
        _mg.activeConv = convId;

        /* Update sidebar active state */
        document.querySelectorAll('.mg-conv-item').forEach(function (item) {
            item.classList.toggle('active', item.getAttribute('data-conv') === convId);
        });

        /* Clear messages */
        var msgs = document.getElementById('mgMsgs');
        if (msgs) msgs.innerHTML = '';
        _mg.typingEl = null;

        /* Close panels */
        _closeFeedbackPanel();
        _closeEmojiPicker();

        if (convId === 'ai') {
            renderAiConv();
        } else {
            renderAdminConv();
        }
    } catch (err) {
        console.warn('[Messages] switchConv:', err.message);
    }
}


/* ================================================================
   4. RENDER AI CONVERSATION
   ================================================================ */
function renderAiConv() {
    try {
        var meta = CONV_META.ai;

        /* Update header */
        _updateHeader(meta);

        /* Show quick replies */
        var qs = document.getElementById('mgQuickStrip');
        if (qs) qs.style.display = '';

        /* Show send input */
        var bar = document.getElementById('mgInputBar');
        if (bar) bar.style.display = '';

        /* Hide admin-only feedback btn when in AI mode */
        var fbBtn = document.getElementById('mgFeedbackBtn');
        if (fbBtn) {
            fbBtn.style.display = '';
            fbBtn.title = 'Gửi phản hồi tới nhà hàng';
        }

        /* Load AI history or show welcome */
        var msgs = document.getElementById('mgMsgs');
        if (!msgs) return;

        if (_mg.aiHistory.length > 0) {
            _restoreHistory(msgs, _mg.aiHistory, 'ai');
        } else {
            _appendDateDivider(msgs, _fmtDate(new Date()));
            appendMsg(meta.welcome, 'bot', true);
            _appendQuickHint(msgs);
        }

    } catch (err) {
        console.warn('[Messages] renderAiConv:', err.message);
    }
}


/* ================================================================
   5. RENDER ADMIN CONVERSATION
   ================================================================ */
function renderAdminConv() {
    try {
        var meta = CONV_META.admin;
        _updateHeader(meta);

        /* Hide quick replies for admin conv */
        var qs = document.getElementById('mgQuickStrip');
        if (qs) qs.style.display = 'none';

        /* Keep input bar but change placeholder */
        var inp = document.getElementById('mgInp');
        if (inp) inp.placeholder = 'Gửi tin nhắn tới hỗ trợ nhà hàng...';

        var msgs = document.getElementById('mgMsgs');
        if (!msgs) return;

        if (_mg.adminHistory.length > 0) {
            _restoreHistory(msgs, _mg.adminHistory, 'admin');
        } else {
            _appendDateDivider(msgs, _fmtDate(new Date()));
            appendMsg(meta.welcome, 'admin', true);
        }

        /* Reset input placeholder for AI when switching back */

    } catch (err) {
        console.warn('[Messages] renderAdminConv:', err.message);
    }
}


/* ================================================================
   6. UPDATE CHAT HEADER
   ================================================================ */
function _updateHeader(meta) {
    try {
        var avatarEl  = document.getElementById('mgHdAvatar');
        var iconEl    = document.getElementById('mgHdAvatarIcon');
        var dotEl     = document.getElementById('mgHdDot');
        var nameEl    = document.getElementById('mgHdName');
        var statusEl  = document.getElementById('mgHdStatus');

        if (avatarEl) avatarEl.className = 'mg-chat-hd-avatar ' + meta.avatarClass;
        if (iconEl)   iconEl.className   = meta.avatarIcon;
        if (dotEl)    dotEl.style.background = meta.statusOnline ? '#4ADE80' : '#F59E0B';
        if (nameEl)   nameEl.textContent  = meta.name;
        if (statusEl) {
            statusEl.textContent = meta.statusText;
            statusEl.className   = 'mg-chat-hd-status' + (meta.statusOnline ? ' online' : '');
        }
    } catch (_) {}
}


/* ================================================================
   7. SEND AI MESSAGE — POST /api/user/public/chatbot/ask
   ================================================================ */
async function sendAiMessage() {
    if (_mg.sending) return;

    var inp     = document.getElementById('mgInp');
    var sendBtn = document.getElementById('mgSend');
    var text    = inp ? inp.value.trim() : '';

    if (!text) return;

    _mg.sending      = true;
    inp.value        = '';
    inp.style.height = 'auto';
    _updateCharCounter(0);
    if (sendBtn) sendBtn.disabled = true;

    /* Hide quick replies strip after first message */
    var qs = document.getElementById('mgQuickStrip');
    if (qs) qs.style.display = 'none';

    /* Remove quick hint if present */
    var hint = document.getElementById('mgQuickHint');
    if (hint) hint.remove();

    /* Append user message */
    appendMsg(text, 'user');

    /* Update AI conv preview in sidebar */
    updateConvPreview('ai', text);

    /* Show typing indicator */
    showTyping('ai');

    try {
        var res = await fetch(MG_API_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ message: text }),
        });

        /* Delay min 800ms cho typing animation sinh động */
        await _delay(800);
        hideTyping();

        if (res.ok) {
            var data  = await res.json();
            var reply = (data && data.response)
                ? data.response
                : 'Xin lỗi, tôi không hiểu. Thử hỏi về <strong>thực đơn</strong>, <strong>giờ mở cửa</strong> hoặc <strong>khuyến mãi</strong> nhé!';
            appendMsg(reply, 'bot');
            updateConvPreview('ai', reply);
        } else {
            var errData = await res.json().catch(function () { return {}; });
            var errMsg  = (errData && errData.message) ? errData.message : 'Có lỗi xảy ra. Vui lòng thử lại!';
            appendMsg(errMsg, 'bot');
        }

    } catch (err) {
        hideTyping();
        appendMsg('Không thể kết nối máy chủ. Kiểm tra mạng và thử lại! 🌐', 'bot');
        console.warn('[Messages] sendAiMessage:', err.message);
    } finally {
        _mg.sending = false;
        if (sendBtn) sendBtn.disabled = false;
        if (inp)     inp.focus();
    }
}

/* Dispatcher: gửi theo conv đang active */
function sendMessage() {
    if (_mg.activeConv === 'ai') {
        sendAiMessage();
    } else {
        sendAdminMessage();
    }
}

/* Admin message: chỉ append locally, không call API */
function sendAdminMessage() {
    var inp  = document.getElementById('mgInp');
    var text = inp ? inp.value.trim() : '';
    if (!text) return;

    inp.value        = '';
    inp.style.height = 'auto';
    _updateCharCounter(0);

    appendMsg(text, 'user');
    updateConvPreview('admin', text);

    /* Simulated admin auto-reply after 1.5s */
    showTyping('admin');
    setTimeout(function () {
        hideTyping();
        var replies = [
            'Cảm ơn bạn đã liên hệ! Nhà hàng đã nhận được tin nhắn và sẽ phản hồi sớm nhất có thể. 🙏',
            'Cảm ơn bạn! Chúng tôi sẽ xem xét và phản hồi trong vòng 1–2 giờ. Xin vui lòng chờ. 😊',
            'Đã ghi nhận! Bộ phận hỗ trợ sẽ liên hệ với bạn ngay khi có thể. Cảm ơn! ✅',
        ];
        var reply = replies[Math.floor(Math.random() * replies.length)];
        appendMsg(reply, 'admin');
        updateConvPreview('admin', reply);
    }, 1500);
}


/* ================================================================
   8. APPEND MESSAGE BUBBLE
   ================================================================ */
function appendMsg(text, role, skipSave) {
    try {
        var msgs = document.getElementById('mgMsgs');
        if (!msgs) return;

        var now     = new Date();
        var ts      = _fmtTime(now);
        var lastMsg = msgs.querySelector('.mg-msg:last-child');
        var isConsecutive = lastMsg && lastMsg.classList.contains(role);

        var div = document.createElement('div');
        div.className = 'mg-msg ' + role + (isConsecutive ? ' consecutive' : '');

        /* Avatar (hidden if consecutive) */
        var avatarHTML = '';
        if (role === 'bot') {
            avatarHTML = '<div class="mg-msg-avatar"><i class="fas fa-robot"></i></div>';
        } else if (role === 'admin') {
            avatarHTML = '<div class="mg-msg-avatar" style="background:linear-gradient(135deg,#6366F1,#8B5CF6)"><i class="fas fa-headset"></i></div>';
        } else {
            avatarHTML = '<div class="mg-msg-avatar" style="background:#E5E7EB;color:#6B7280"><i class="fas fa-user"></i></div>';
        }

        /* Sender label (only for non-consecutive bot/admin) */
        var senderLabel = '';
        if (!isConsecutive) {
            if (role === 'bot')   senderLabel = '<div class="mg-sender-label">GoMeal AI</div>';
            if (role === 'admin') senderLabel = '<div class="mg-sender-label">Hỗ trợ nhà hàng</div>';
        }

        /* Tick for user messages */
        var tick = role === 'user' ? '<i class="fas fa-check-double mg-tick" title="Đã gửi"></i>' : '';

        /* Allow safe bold/strong from bot responses */
        var safeText = _safeBold(text);

        div.innerHTML = [
            avatarHTML,
            '<div class="mg-bubble-group">',
            senderLabel,
            '<div class="mg-bubble">' + safeText + '</div>',
            '<div class="mg-ts">' + ts + tick + '</div>',
            '</div>',
        ].join('');

        msgs.appendChild(div);
        msgs.scrollTop = msgs.scrollHeight;

        /* Save to session history */
        if (!skipSave) {
            var histArr = (role === 'user' || _mg.activeConv === 'ai') ? _mg.aiHistory : _mg.adminHistory;
            if (_mg.activeConv === 'admin') {
                histArr = _mg.adminHistory;
            } else {
                histArr = _mg.aiHistory;
            }
            histArr.push({ role: role, text: text, ts: now.toISOString() });
            if (histArr.length > MG_MAX_HIST) {
                histArr.splice(0, histArr.length - MG_MAX_HIST);
            }
            saveHistory();
        }

    } catch (err) {
        console.warn('[Messages] appendMsg:', err.message);
    }
}


/* ================================================================
   9. TYPING INDICATOR
   ================================================================ */
function showTyping(convType) {
    try {
        var msgs = document.getElementById('mgMsgs');
        if (!msgs || _mg.typingEl) return;

        var isAdmin = (convType === 'admin');
        var avatarStyle = isAdmin
            ? 'background:linear-gradient(135deg,#6366F1,#8B5CF6)'
            : 'background:linear-gradient(135deg,#FF6B35,#F7931E)';
        var avatarIcon = isAdmin ? 'fas fa-headset' : 'fas fa-robot';
        var labelText  = isAdmin ? 'Hỗ trợ đang trả lời...' : 'Bot đang gõ...';

        _mg.typingEl = document.createElement('div');
        _mg.typingEl.className = 'mg-typing-row';
        _mg.typingEl.id        = 'mgTypingRow';
        _mg.typingEl.innerHTML = [
            '<div class="mg-typing-avatar" style="' + avatarStyle + '">',
            '  <i class="' + avatarIcon + '"></i>',
            '</div>',
            '<div class="mg-typing-bubble">',
            '  <span class="mg-typing-label">' + labelText + '</span>',
            '  <div class="mg-dot"></div>',
            '  <div class="mg-dot"></div>',
            '  <div class="mg-dot"></div>',
            '</div>',
        ].join('');

        msgs.appendChild(_mg.typingEl);
        msgs.scrollTop = msgs.scrollHeight;
    } catch (_) {}
}

function hideTyping() {
    try {
        if (_mg.typingEl && _mg.typingEl.parentNode) {
            _mg.typingEl.parentNode.removeChild(_mg.typingEl);
        }
        _mg.typingEl = null;
    } catch (_) {}
}


/* ================================================================
   10. INPUT EVENTS
   ================================================================ */
function initInputEvents() {
    try {
        var inp     = document.getElementById('mgInp');
        var sendBtn = document.getElementById('mgSend');

        if (!inp || !sendBtn) return;

        /* Send on Enter (not Shift+Enter) */
        inp.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        /* Auto-resize textarea */
        inp.addEventListener('input', function () {
            autoResizeInp(this);
            _updateCharCounter(this.value.length);
        });

        sendBtn.addEventListener('click', sendMessage);

    } catch (err) {
        console.warn('[Messages] initInputEvents:', err.message);
    }
}

function autoResizeInp(el) {
    try {
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 100) + 'px';
    } catch (_) {}
}

function _updateCharCounter(count) {
    try {
        var el = document.getElementById('mgCharCounter');
        if (!el) return;
        el.textContent = count + '/500';
        el.classList.toggle('warn', count > 440);
    } catch (_) {}
}


/* ================================================================
   11. QUICK REPLIES
   ================================================================ */
function initQuickReplies() {
    try {
        var strip = document.getElementById('mgQuickStrip');
        if (!strip) return;

        strip.querySelectorAll('.mg-quick-chip').forEach(function (chip) {
            chip.addEventListener('click', function () {
                var text = this.getAttribute('data-text');
                if (!text) return;

                var inp = document.getElementById('mgInp');
                if (inp) {
                    inp.value = text;
                    inp.focus();
                    _updateCharCounter(text.length);
                    autoResizeInp(inp);
                }

                /* Hide quick replies */
                strip.style.display = 'none';
                sendMessage();
            });
        });
    } catch (err) {
        console.warn('[Messages] initQuickReplies:', err.message);
    }
}


/* ================================================================
   12. EMOJI PICKER
   ================================================================ */
function initEmojiPicker() {
    try {
        var picker  = document.getElementById('mgEmojiPicker');
        var emojiBtn = document.getElementById('mgEmojiBtn');
        var inp     = document.getElementById('mgInp');

        if (!picker || !emojiBtn) return;

        /* Populate emoji grid */
        picker.innerHTML = MG_EMOJIS.map(function (em) {
            return '<div class="mg-emoji-item" data-em="' + em + '">' + em + '</div>';
        }).join('');

        /* Emoji click → insert into input */
        picker.querySelectorAll('.mg-emoji-item').forEach(function (item) {
            item.addEventListener('click', function () {
                var em = this.getAttribute('data-em');
                if (!inp || !em) return;
                var start = inp.selectionStart || inp.value.length;
                var end   = inp.selectionEnd   || inp.value.length;
                inp.value = inp.value.slice(0, start) + em + inp.value.slice(end);
                inp.selectionStart = inp.selectionEnd = start + em.length;
                inp.focus();
                _updateCharCounter(inp.value.length);
                _closeEmojiPicker();
            });
        });

        /* Toggle on emoji btn click */
        emojiBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            _mg.emojiOpen ? _closeEmojiPicker() : _openEmojiPicker();
        });

        /* Close on outside click */
        document.addEventListener('click', function (e) {
            if (_mg.emojiOpen && !picker.contains(e.target) && e.target !== emojiBtn) {
                _closeEmojiPicker();
            }
        });

    } catch (err) {
        console.warn('[Messages] initEmojiPicker:', err.message);
    }
}

function _openEmojiPicker() {
    var picker = document.getElementById('mgEmojiPicker');
    if (picker) picker.classList.add('show');
    _mg.emojiOpen = true;
}

function _closeEmojiPicker() {
    var picker = document.getElementById('mgEmojiPicker');
    if (picker) picker.classList.remove('show');
    _mg.emojiOpen = false;
}


/* ================================================================
   13. FEEDBACK PANEL — Admin phản hồi (local simulation)
   ================================================================ */
function initFeedbackPanel() {
    try {
        var fbBtn   = document.getElementById('mgFeedbackBtn');
        var fbClose = document.getElementById('mgFbClose');
        var fbSend  = document.getElementById('mgFbSend');
        var fbCats  = document.getElementById('mgFbCats');

        if (fbBtn) {
            fbBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                _mg.feedbackOpen ? _closeFeedbackPanel() : _openFeedbackPanel();
            });
        }

        if (fbClose) {
            fbClose.addEventListener('click', _closeFeedbackPanel);
        }

        /* Category selection */
        if (fbCats) {
            fbCats.querySelectorAll('.mg-fb-cat').forEach(function (cat) {
                cat.addEventListener('click', function () {
                    fbCats.querySelectorAll('.mg-fb-cat').forEach(function (c) {
                        c.classList.remove('selected');
                    });
                    this.classList.add('selected');
                    _mg.fbCategory = this.getAttribute('data-cat') || '';
                });
            });
        }

        if (fbSend) {
            fbSend.addEventListener('click', sendFeedback);
        }

        /* Close on outside click */
        document.addEventListener('click', function (e) {
            var panel = document.getElementById('mgFeedbackPanel');
            var btn   = document.getElementById('mgFeedbackBtn');
            if (_mg.feedbackOpen && panel && !panel.contains(e.target) && e.target !== btn) {
                _closeFeedbackPanel();
            }
        });

    } catch (err) {
        console.warn('[Messages] initFeedbackPanel:', err.message);
    }
}

function _openFeedbackPanel() {
    var panel = document.getElementById('mgFeedbackPanel');
    if (panel) panel.classList.add('show');
    _mg.feedbackOpen = true;
}

function _closeFeedbackPanel() {
    var panel = document.getElementById('mgFeedbackPanel');
    if (panel) panel.classList.remove('show');
    _mg.feedbackOpen = false;
}

function sendFeedback() {
    try {
        var textEl = document.getElementById('mgFbText');
        var text   = textEl ? textEl.value.trim() : '';

        if (!text) {
            showToast('Vui lòng nhập nội dung phản hồi!', 'error');
            if (textEl) textEl.focus();
            return;
        }

        var category = _mg.fbCategory || 'Ý kiến khác';

        /* Switch to admin conv and show the feedback there */
        _closeFeedbackPanel();

        /* If not on admin conv, switch to it */
        if (_mg.activeConv !== 'admin') {
            switchConv('admin');
        }

        /* Show feedback as user message in admin conv */
        var fullMsg = '[' + category + '] ' + text;
        appendMsg(fullMsg, 'user');
        updateConvPreview('admin', fullMsg);

        /* Clear textarea */
        if (textEl) textEl.value = '';

        /* Simulate admin acknowledgement */
        showTyping('admin');
        setTimeout(function () {
            hideTyping();
            appendMsg('✅ Cảm ơn bạn đã gửi phản hồi về <strong>' + _esc(category) + '</strong>! Chúng tôi sẽ xem xét và cải thiện trong thời gian sớm nhất. 🙏', 'admin');
            updateConvPreview('admin', 'Đã nhận phản hồi ✅');
        }, 1600);

        showToast('Phản hồi đã được gửi! 🎉', 'success');

    } catch (err) {
        console.warn('[Messages] sendFeedback:', err.message);
        showToast('Lỗi gửi phản hồi. Vui lòng thử lại.', 'error');
    }
}


/* ================================================================
   14. HEADER ACTIONS
   ================================================================ */
function initHeaderActions() {
    try {
        /* Theme toggle */
        var themeBtn = document.getElementById('mgThemeBtn');
        if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

        /* Clear history */
        var clearBtn = document.getElementById('mgClearBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                clearHistory();
            });
        }

    } catch (err) {
        console.warn('[Messages] initHeaderActions:', err.message);
    }
}


/* ================================================================
   15. SESSION HISTORY — sessionStorage
   ================================================================ */
function loadHistory() {
    try {
        var aiRaw  = sessionStorage.getItem(MG_SS_AI_HIST);
        var admRaw = sessionStorage.getItem(MG_SS_ADM_HIST);

        if (aiRaw) {
            var parsed = JSON.parse(aiRaw);
            if (Array.isArray(parsed)) _mg.aiHistory = parsed;
        }
        if (admRaw) {
            var parsedAdm = JSON.parse(admRaw);
            if (Array.isArray(parsedAdm)) _mg.adminHistory = parsedAdm;
        }
    } catch (_) {
        _mg.aiHistory    = [];
        _mg.adminHistory = [];
    }
}

function saveHistory() {
    try {
        sessionStorage.setItem(MG_SS_AI_HIST,  JSON.stringify(_mg.aiHistory));
        sessionStorage.setItem(MG_SS_ADM_HIST, JSON.stringify(_mg.adminHistory));
    } catch (_) {}
}

function clearHistory() {
    try {
        if (_mg.activeConv === 'ai') {
            _mg.aiHistory = [];
            sessionStorage.removeItem(MG_SS_AI_HIST);
        } else {
            _mg.adminHistory = [];
            sessionStorage.removeItem(MG_SS_ADM_HIST);
        }

        /* Re-render */
        var msgs = document.getElementById('mgMsgs');
        if (msgs) msgs.innerHTML = '';
        _mg.typingEl = null;

        if (_mg.activeConv === 'ai') {
            renderAiConv();
        } else {
            renderAdminConv();
        }

        showToast('Đã xoá lịch sử trò chuyện.', 'info');
    } catch (err) {
        console.warn('[Messages] clearHistory:', err.message);
    }
}

function _restoreHistory(msgs, history, convType) {
    try {
        if (!history || history.length === 0) return;

        _appendDateDivider(msgs, 'Lịch sử hôm nay');

        history.slice(-MG_MAX_HIST).forEach(function (item) {
            var isConsecutive = false;
            var lastEl = msgs.querySelector('.mg-msg:last-child');
            if (lastEl) isConsecutive = lastEl.classList.contains(item.role);

            var div = document.createElement('div');
            div.className = 'mg-msg ' + item.role + (isConsecutive ? ' consecutive' : '');

            var avatarHTML = '';
            if (item.role === 'bot') {
                avatarHTML = '<div class="mg-msg-avatar"><i class="fas fa-robot"></i></div>';
            } else if (item.role === 'admin') {
                avatarHTML = '<div class="mg-msg-avatar" style="background:linear-gradient(135deg,#6366F1,#8B5CF6)"><i class="fas fa-headset"></i></div>';
            } else {
                avatarHTML = '<div class="mg-msg-avatar" style="background:#E5E7EB;color:#6B7280"><i class="fas fa-user"></i></div>';
            }

            var ts   = item.ts ? _fmtTime(new Date(item.ts)) : '';
            var tick = item.role === 'user' ? '<i class="fas fa-check-double mg-tick"></i>' : '';

            var senderLabel = '';
            if (!isConsecutive) {
                if (item.role === 'bot')   senderLabel = '<div class="mg-sender-label">GoMeal AI</div>';
                if (item.role === 'admin') senderLabel = '<div class="mg-sender-label">Hỗ trợ nhà hàng</div>';
            }

            div.innerHTML = [
                avatarHTML,
                '<div class="mg-bubble-group">',
                senderLabel,
                '<div class="mg-bubble">' + _safeBold(item.text) + '</div>',
                '<div class="mg-ts">' + ts + tick + '</div>',
                '</div>',
            ].join('');

            msgs.appendChild(div);
        });

        msgs.scrollTop = msgs.scrollHeight;

    } catch (err) {
        console.warn('[Messages] _restoreHistory:', err.message);
    }
}


/* ================================================================
   16. UPDATE CONV PREVIEW (sidebar)
   ================================================================ */
function updateConvPreview(convId, text) {
    try {
        var previewId = convId === 'ai' ? 'mgAiPreview' : 'mgAdminPreview';
        var timeId    = convId === 'ai' ? 'mgAiTime'    : null;

        var previewEl = document.getElementById(previewId);
        if (previewEl) {
            /* Strip HTML tags for preview */
            var plain = text.replace(/<[^>]+>/g, '');
            previewEl.textContent = plain.length > 36 ? plain.slice(0, 36) + '…' : plain;
        }

        if (timeId) {
            var timeEl = document.getElementById(timeId);
            if (timeEl) timeEl.textContent = _fmtTime(new Date());
        }
    } catch (_) {}
}


/* ================================================================
   17. DATE DIVIDER
   ================================================================ */
function _appendDateDivider(msgs, label) {
    try {
        var div = document.createElement('div');
        div.className   = 'mg-date-divider';
        div.textContent = label;
        msgs.appendChild(div);
    } catch (_) {}
}

/* Hint strip inside messages area (below welcome) */
function _appendQuickHint(msgs) {
    try {
        var div = document.createElement('div');
        div.id            = 'mgQuickHint';
        div.style.cssText = [
            'text-align:center;',
            'font-size:.65rem;',
            'color:#C4BAB3;',
            'padding:6px 0 2px;',
            'display:flex;',
            'align-items:center;',
            'justify-content:center;',
            'gap:6px;',
        ].join('');
        div.innerHTML = '<i class="fas fa-lightbulb" style="color:#FF6B35;font-size:.62rem"></i> Dùng các chip gợi ý bên dưới hoặc nhập câu hỏi bất kỳ!';
        msgs.appendChild(div);
    } catch (_) {}
}


/* ================================================================
   18. TOPBAR
   ================================================================ */
function initTopbar() {
    try {
        /* Hiển thị tên user nếu đã đăng nhập */
        var name = '';
        try {
            /* common.js getToken → không có profile ở đây, bỏ qua */
            var raw = sessionStorage.getItem('gomeal_user') || localStorage.getItem('gomeal_user');
            if (raw) {
                var usr = JSON.parse(raw);
                name = usr.name || '';
            }
        } catch (_) {}

        if (name) {
            var nameEl = document.getElementById('topbarUserName');
            if (nameEl) {
                nameEl.textContent   = name;
                nameEl.style.display = 'inline';
            }
        }
    } catch (_) {}
}


/* ================================================================
   19. TOAST
   ================================================================ */
function showToast(msg, type) {
    try {
        var container = document.getElementById('mgToastContainer');
        if (!container) return;

        var iconMap = {
            success: 'fa-circle-check',
            error:   'fa-circle-xmark',
            warning: 'fa-triangle-exclamation',
            info:    'fa-circle-info',
        };
        var icon = iconMap[type] || 'fa-circle-info';

        var toast = document.createElement('div');
        toast.className = 'mg-toast ' + (type || 'info');
        toast.innerHTML = '<i class="fas ' + icon + '"></i><span style="flex:1">' + _esc(msg) + '</span>';

        container.appendChild(toast);

        setTimeout(function () {
            try {
                toast.style.opacity    = '0';
                toast.style.transform  = 'translateX(14px)';
                toast.style.transition = 'all .25s ease';
                setTimeout(function () { try { toast.remove(); } catch (_) {} }, 260);
            } catch (_) {}
        }, 3400);

    } catch (_) {}
}


/* ================================================================
   20. UTILITIES
   ================================================================ */
function _esc(str) {
    return String(str || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/* Allow safe <strong> and <br> from bot responses */
function _safeBold(text) {
    /* Escape all HTML first */
    var escaped = _esc(String(text || ''));
    /* Re-allow &lt;strong&gt; → <strong> and line breaks */
    return escaped
        .replace(/&lt;strong&gt;/g, '<strong>')
        .replace(/&lt;\/strong&gt;/g, '</strong>')
        .replace(/\n/g, '<br>');
}

function _fmtTime(d) {
    try {
        var h = String(d.getHours()).padStart(2, '0');
        var m = String(d.getMinutes()).padStart(2, '0');
        return h + ':' + m;
    } catch (_) { return ''; }
}

function _fmtDate(d) {
    try {
        var days   = ['Chủ nhật','Thứ hai','Thứ ba','Thứ tư','Thứ năm','Thứ sáu','Thứ bảy'];
        var months = d.getMonth() + 1;
        return days[d.getDay()] + ', ' + d.getDate() + '/' + months + '/' + d.getFullYear();
    } catch (_) { return 'Hôm nay'; }
}

function _delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
}


/* ================================================================
   21. PUBLIC API
   ================================================================ */
window.MessagesPage = {
    switchConv:   switchConv,
    sendMessage:  sendMessage,
    clearHistory: clearHistory,
    toggleTheme:  toggleTheme,
    showToast:    showToast,
};