/* ================================================================
   GOMEAL — PROMOTIONS.JS
   File: public/js/user/promotions.js

   Trang Ưu đãi & Combo — views/user/promotions.html
   Trang PUBLIC — không cần authToken.

   Chức năng:
     1.  loadCombos()           — GET /api/user/public/combos
     2.  renderComboGrid()      — Render combo cards với visual gradient + food_names chips
     3.  checkCoupon()          — POST /api/user/public/promotions/check
     4.  renderCheckerResult()  — Hiện kết quả kiểm tra mã
     5.  renderVoucherCards()   — Render coupon-style cards (static demo vouchers)
     6.  initCheckerEvents()    — Bind input + button events
     7.  initTopbar()           — Table chip, search proxy sync
     8.  copyCode()             — Sao chép mã + visual feedback
     9.  autoFillSubtotal()     — Đọc localCart để gợi ý số tiền
     10. showToast()            — Inline toast notification

   APIs dùng (đúng theo user.routes.js):
     GET  /api/user/public/combos              — public, không cần token
     POST /api/user/public/promotions/check   — body: { code, subtotal }
                                               → { promo_id, discount_amount }
                                               → hoặc { message } khi lỗi

   Combo response shape (Combo.findAll):
     [ { id, name, description, price, is_active, food_names }, ... ]
     food_names: chuỗi GROUP_CONCAT, vd "Gà nướng, Cơm chiên, Trà đào"

   localStorage keys (read-only, không write):
     'localCart' — đọc để tự động điền subtotal
     'guestToken' — kiểm tra trạng thái session (hiển thị link đặt ngay)
     'authToken'  — như trên

   Không tạo route mới. Không phá layout user.
   ================================================================ */

'use strict';

/* ================================================================
   0. STATE & CONSTANTS
   ================================================================ */
const _pr = {
    combos:      [],     // raw từ API
    searchTimer: null,
    searchKw:    '',
};

/* Gradient themes cho combo cards — lặp vòng nếu nhiều combo */
const COMBO_THEMES = [
    {
        gradient: 'linear-gradient(135deg, #1a0800 0%, #8B2500 50%, #FF6B35 100%)',
        emoji:    '🍱',
        badge:    'HOT DEAL',
    },
    {
        gradient: 'linear-gradient(135deg, #064E3B 0%, #065F46 45%, #10B981 100%)',
        emoji:    '🥗',
        badge:    'FRESH',
    },
    {
        gradient: 'linear-gradient(135deg, #1E1B4B 0%, #4C1D95 50%, #8B5CF6 100%)',
        emoji:    '🍜',
        badge:    'SPECIAL',
    },
    {
        gradient: 'linear-gradient(135deg, #7C2D12 0%, #C2410C 50%, #F97316 100%)',
        emoji:    '🍗',
        badge:    'BEST SELLER',
    },
    {
        gradient: 'linear-gradient(135deg, #134E4A 0%, #0F766E 50%, #14B8A6 100%)',
        emoji:    '🦐',
        badge:    'PREMIUM',
    },
    {
        gradient: 'linear-gradient(135deg, #1E3A5F 0%, #1D4ED8 50%, #60A5FA 100%)',
        emoji:    '🍔',
        badge:    'COMBO',
    },
];

/* Static demo vouchers để hiển thị giao diện coupon đẹp
   (Không có API riêng trả về danh sách vouchers public — chỉ có /promotions/check)
   → Hiển thị vouchers mẫu với hướng dẫn "Nhập mã để kiểm tra" */
const DEMO_VOUCHERS = [
    {
        code:       'GOMEAL20',
        name:       'Giảm 20% toàn bộ đơn',
        discount:   '20%',
        type:       'percent',
        minOrder:   150000,
        desc:       'Áp dụng cho đơn từ 150.000₫. Không giới hạn món.',
        palette:    'orange',
        icon:       'fa-percent',
        valid:      'Ưu đãi thường xuyên',
    },
    {
        code:       'NEWUSER50',
        name:       'Giảm 50.000₫ cho khách mới',
        discount:   '50K',
        type:       'fixed',
        minOrder:   200000,
        desc:       'Dành cho khách đặt món lần đầu, đơn tối thiểu 200.000₫.',
        palette:    'green',
        icon:       'fa-gift',
        valid:      'Dành cho khách mới',
    },
    {
        code:       'VIP30',
        name:       'Ưu đãi VIP giảm 30%',
        discount:   '30%',
        type:       'percent',
        minOrder:   300000,
        desc:       'Dành riêng cho thành viên VIP, đơn tối thiểu 300.000₫.',
        palette:    'violet',
        icon:       'fa-gem',
        valid:      'Thành viên VIP',
    },
    {
        code:       'LUNCH100K',
        name:       'Giảm 100.000₫ bữa trưa',
        discount:   '100K',
        type:       'fixed',
        minOrder:   500000,
        desc:       'Áp dụng bữa trưa 11h–14h, đơn từ 500.000₫.',
        palette:    'amber',
        icon:       'fa-sun',
        valid:      '11:00 – 14:00 hàng ngày',
    },
];


/* ================================================================
   1. ENTRY POINT
   ================================================================ */
document.addEventListener('DOMContentLoaded', function promoInit() {
    try {
        initTopbar();
        initCheckerEvents();
        initSearchProxy();

        /* Load combo data từ API */
        loadCombos();

        /* Render voucher cards tĩnh */
        renderVoucherCards();

        /* Tự động điền subtotal từ giỏ hàng hiện tại nếu có */
        autoFillSubtotal();

    } catch (err) {
        console.error('[Promotions] Init error:', err.message);
    }
});


/* ================================================================
   2. LOAD COMBOS — GET /api/user/public/combos
   ================================================================ */
async function loadCombos() {
    try {
        const res = await fetch('/api/user/public/combos');

        if (!res.ok) throw new Error('HTTP ' + res.status);

        const data = await res.json();
        if (!Array.isArray(data)) throw new Error('Invalid response');

        /* Chỉ lấy combo is_active (server đã filter, nhưng double-check) */
        _pr.combos = data.filter(function (c) { return c.is_active; });

        renderComboGrid(_pr.combos);

        /* Cập nhật subtitle */
        const sub = document.getElementById('prComboSubtitle');
        if (sub) {
            sub.textContent = _pr.combos.length > 0
                ? _pr.combos.length + ' combo đang có sẵn'
                : 'Hiện chưa có combo';
        }

    } catch (err) {
        console.warn('[Promotions] loadCombos:', err.message);
        _renderComboError();
    }
}


/* ================================================================
   3. RENDER COMBO GRID
   ================================================================ */
function renderComboGrid(combos) {
    try {
        const grid = document.getElementById('prComboGrid');
        if (!grid) return;

        if (!combos || combos.length === 0) {
            grid.innerHTML = `
                <div class="pr-empty">
                    <div class="pr-empty-icon">🍱</div>
                    <p class="pr-empty-title">Chưa có combo nào</p>
                    <p class="pr-empty-sub">Quay lại sau để xem các gói ưu đãi mới nhất!</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = combos.map(function (combo, idx) {
            return _comboCardHTML(combo, idx);
        }).join('');

        /* Bind events */
        _bindComboCardEvents(grid);

    } catch (err) {
        console.warn('[Promotions] renderComboGrid:', err.message);
    }
}

function _comboCardHTML(combo, idx) {
    const theme    = COMBO_THEMES[idx % COMBO_THEMES.length];
    const price    = Number(combo.price || 0);
    const name     = _esc(combo.name || 'Combo');
    const desc     = _esc(combo.description || 'Gói ưu đãi đặc biệt của nhà hàng');

    /* food_names là chuỗi GROUP_CONCAT: "Món A, Món B, Món C" */
    const foodChips = _renderFoodChips(combo.food_names || '');

    /* Savings estimation (hiển thị ~15% off so với tổng lẻ) */
    const savedPct  = 15 + (idx * 3 % 10);   /* 15–24% tuỳ vị trí */

    return `
        <div class="pr-combo-card" data-combo-id="${combo.id}" tabindex="0"
             role="button" aria-label="Xem combo ${name}">

            <!-- Visual header -->
            <div class="pr-combo-visual" style="background:${theme.gradient}">
                <span class="pr-combo-emoji">${theme.emoji}</span>
                <div class="pr-combo-badge">${theme.badge}</div>
                <div class="pr-combo-price-ribbon">
                    <span class="pr-combo-price-val">${_fmtPrice(price)}</span>
                </div>
            </div>

            <!-- Body -->
            <div class="pr-combo-body">
                <h3 class="pr-combo-name">${name}</h3>
                <p class="pr-combo-desc">${desc}</p>

                <!-- Food items -->
                ${foodChips ? `
                    <div>
                        <p class="pr-combo-items-label">Gồm các món</p>
                        <div class="pr-combo-items">${foodChips}</div>
                    </div>
                ` : ''}

                <!-- Savings badge -->
                <div style="display:flex;align-items:center;gap:7px;margin-top:2px">
                    <span style="font-size:.62rem;font-weight:800;color:#059669;background:#ECFDF5;
                                 padding:3px 9px;border-radius:99px;border:1.5px solid #A7F3D0">
                        <i class="fas fa-circle-check" style="font-size:.55rem"></i>
                        Tiết kiệm ~${savedPct}%
                    </span>
                    <span style="font-size:.62rem;color:#C4BAB3;font-weight:600">so với gọi lẻ</span>
                </div>

                <!-- CTA -->
                <div class="pr-combo-cta">
                    <span class="pr-combo-cta-price">${_fmtPrice(price)}</span>
                    <button class="pr-combo-cta-btn" data-combo-id="${combo.id}"
                            data-combo-name="${name}" data-combo-price="${price}">
                        <i class="fas fa-cart-plus"></i>
                        Chọn combo
                    </button>
                </div>
            </div>
        </div>
    `;
}

function _renderFoodChips(foodNamesStr) {
    if (!foodNamesStr || !foodNamesStr.trim()) return '';

    const foods = foodNamesStr.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (foods.length === 0) return '';

    /* Hiển thị tối đa 5 chip, còn lại ghi "+N" */
    const MAX_SHOW = 5;
    const shown    = foods.slice(0, MAX_SHOW);
    const more     = foods.length - MAX_SHOW;

    const chips = shown.map(function (food) {
        return `<span class="pr-combo-item-chip">
                    <i class="fas fa-utensils"></i>
                    ${_esc(food)}
                </span>`;
    }).join('');

    const moreChip = more > 0
        ? `<span class="pr-combo-item-chip" style="background:#FFF3EE;border-color:#FFD4C2;color:#FF6B35;font-weight:700">
               +${more} món
           </span>`
        : '';

    return chips + moreChip;
}

function _bindComboCardEvents(grid) {
    try {
        grid.querySelectorAll('.pr-combo-cta-btn').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                const name  = this.getAttribute('data-combo-name') || 'Combo';
                const price = Number(this.getAttribute('data-combo-price') || 0);

                /* Ghi vào localCart rồi chuyển sang menu */
                _addComboToCart(
                    parseInt(this.getAttribute('data-combo-id'), 10),
                    name,
                    price
                );
            });
        });

        /* Card click — open detail info (không có modal riêng, chuyển menu) */
        grid.querySelectorAll('.pr-combo-card').forEach(function (card) {
            card.addEventListener('click', function (e) {
                if (e.target.closest('.pr-combo-cta-btn')) return;
                const name  = card.querySelector('.pr-combo-name').textContent;
                showToast('Đặt combo ' + name + ' — vào thực đơn để thêm vào giỏ nhé!', 'info');
            });

            /* Keyboard a11y */
            card.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    card.click();
                }
            });
        });

    } catch (err) {
        console.warn('[Promotions] _bindComboCardEvents:', err.message);
    }
}

function _addComboToCart(comboId, comboName, price) {
    try {
        /* Kiểm tra có session không */
        const hasSession = _lsGet('guestToken') || _lsGet('authToken');

        if (!hasSession) {
            showToast('Chọn bàn trước để thêm vào giỏ nhé! 🪑', 'warning');
            setTimeout(function () {
                window.location.href = '/views/user/table-select.html';
            }, 1400);
            return;
        }

        /* Đọc cart */
        let cart = [];
        try {
            const raw = localStorage.getItem('localCart');
            if (raw) cart = JSON.parse(raw) || [];
            if (!Array.isArray(cart)) cart = [];
        } catch (_) { cart = []; }

        /* Thêm combo vào cart */
        const key      = 'combo_' + comboId;
        const existing = cart.find(function (c) { return c.key === key; });
        if (existing) {
            existing.quantity += 1;
        } else {
            cart.push({
                key:      key,
                foodId:   comboId,
                foodName: comboName,
                price:    price,
                quantity: 1,
                isCombo:  true,
            });
        }

        localStorage.setItem('localCart', JSON.stringify(cart));
        window.dispatchEvent(new CustomEvent('cartUpdated'));

        showToast('Đã thêm ' + comboName + ' vào giỏ! 🛒', 'success');

        /* Chuyển sang menu sau 1.2s */
        setTimeout(function () {
            window.location.href = '/views/user/menu.html';
        }, 1200);

    } catch (err) {
        console.warn('[Promotions] _addComboToCart:', err.message);
        showToast('Không thể thêm vào giỏ. Vui lòng thử lại.', 'error');
    }
}

function _renderComboError() {
    try {
        const grid = document.getElementById('prComboGrid');
        if (grid) {
            grid.innerHTML = `
                <div class="pr-empty">
                    <div class="pr-empty-icon">⚠️</div>
                    <p class="pr-empty-title">Không thể tải combo</p>
                    <p class="pr-empty-sub">Vui lòng tải lại trang để thử lại.</p>
                </div>
            `;
        }
        const sub = document.getElementById('prComboSubtitle');
        if (sub) sub.textContent = 'Lỗi tải dữ liệu';
    } catch (_) {}
}


/* ================================================================
   4. COUPON CHECKER — POST /api/user/public/promotions/check
      Body: { code: string, subtotal: number }
      Success response: { promo_id: number, discount_amount: number }
      Error response:   { message: string }
   ================================================================ */
async function checkCoupon() {
    try {
        const codeInp     = document.getElementById('prCodeInp');
        const subtotalInp = document.getElementById('prSubtotalInp');
        const checkerBtn  = document.getElementById('prCheckerBtn');

        const code     = (codeInp ? codeInp.value : '').trim().toUpperCase();
        const rawSub   = subtotalInp ? Number(subtotalInp.value) : 0;
        /* Dùng 200.000 mặc định nếu không nhập */
        const subtotal = rawSub > 0 ? rawSub : 200000;

        /* Validate */
        if (!code) {
            _showCheckerResult('error', 'Vui lòng nhập mã giảm giá', '', null);
            if (codeInp) codeInp.focus();
            return;
        }

        /* Loading state */
        if (checkerBtn) checkerBtn.classList.add('loading');
        _hideCheckerResult();

        /* API call */
        const res = await fetch('/api/user/public/promotions/check', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ code, subtotal }),
        });

        const data = await res.json().catch(function () { return {}; });

        if (res.ok && data.promo_id) {
            /* SUCCESS */
            const discount = Number(data.discount_amount || 0);
            const saving   = discount > 0
                ? 'Bạn tiết kiệm được ' + _fmtPrice(discount) + ' cho đơn ' + _fmtPrice(subtotal)
                : 'Mã hợp lệ — áp dụng khi đặt món';

            _showCheckerResult(
                'success',
                '✅ Mã hợp lệ! Giảm ' + _fmtPrice(discount),
                saving,
                discount
            );

            showToast('Mã ' + code + ' giảm ' + _fmtPrice(discount) + '! 🎉', 'success');

            /* Tự động điền mã vào checker code để copy */
            _pulseCheckerResult();

        } else {
            /* ERROR */
            const msg = data.message || 'Mã không hợp lệ hoặc đã hết hạn.';
            _showCheckerResult('error', '❌ Mã không áp dụng được', msg, null);
        }

    } catch (err) {
        console.warn('[Promotions] checkCoupon:', err.message);
        _showCheckerResult('error', 'Lỗi kết nối', 'Không thể kết nối máy chủ. Vui lòng thử lại.', null);
    } finally {
        const btn = document.getElementById('prCheckerBtn');
        if (btn) btn.classList.remove('loading');
    }
}

function _showCheckerResult(type, title, sub, discountAmount) {
    try {
        const resultEl   = document.getElementById('prCheckerResult');
        const titleEl    = document.getElementById('prResultTitle');
        const subEl      = document.getElementById('prResultSub');
        const amountEl   = document.getElementById('prResultAmount');
        const iconEl     = document.getElementById('prResultIconInner');

        if (!resultEl) return;

        /* Reset classes */
        resultEl.className = 'pr-checker-result show ' + type;

        if (titleEl) titleEl.textContent = title;
        if (subEl)   subEl.textContent   = sub;

        /* Icon */
        if (iconEl) {
            iconEl.className = type === 'success'
                ? 'fas fa-circle-check'
                : 'fas fa-circle-xmark';
        }

        /* Discount amount display */
        if (amountEl) {
            if (type === 'success' && discountAmount > 0) {
                amountEl.textContent  = '−' + _fmtPrice(discountAmount);
                amountEl.style.display = 'block';
            } else {
                amountEl.style.display = 'none';
            }
        }

    } catch (err) {
        console.warn('[Promotions] _showCheckerResult:', err.message);
    }
}

function _hideCheckerResult() {
    try {
        const el = document.getElementById('prCheckerResult');
        if (el) el.classList.remove('show');
    } catch (_) {}
}

function _pulseCheckerResult() {
    try {
        const el = document.getElementById('prCheckerResult');
        if (!el) return;
        el.style.transform = 'scale(1.01)';
        setTimeout(function () { el.style.transform = ''; }, 250);
    } catch (_) {}
}


/* ================================================================
   5. INIT CHECKER EVENTS
   ================================================================ */
function initCheckerEvents() {
    try {
        const btn      = document.getElementById('prCheckerBtn');
        const codeInp  = document.getElementById('prCodeInp');
        const subInp   = document.getElementById('prSubtotalInp');

        if (btn) {
            btn.addEventListener('click', function () { checkCoupon(); });
        }

        /* Enter key trên cả 2 inputs */
        if (codeInp) {
            codeInp.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { e.preventDefault(); checkCoupon(); }
            });
            /* Auto-uppercase khi gõ */
            codeInp.addEventListener('input', function () {
                const cursor = this.selectionStart;
                this.value   = this.value.toUpperCase();
                this.setSelectionRange(cursor, cursor);
                _hideCheckerResult();
            });
        }

        if (subInp) {
            subInp.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { e.preventDefault(); checkCoupon(); }
            });
        }

    } catch (err) {
        console.warn('[Promotions] initCheckerEvents:', err.message);
    }
}


/* ================================================================
   6. RENDER VOUCHER CARDS (demo — giao diện coupon răng cưa)
      Hiển thị các vouchers mẫu với CSS răng cưa đã định nghĩa trong HTML.
      Người dùng nhấn "Sao chép mã" → copy code → paste vào checker.
   ================================================================ */
function renderVoucherCards() {
    try {
        const section = document.getElementById('prVoucherSection');
        const grid    = document.getElementById('prVoucherGrid');
        if (!section || !grid) return;

        const html = DEMO_VOUCHERS.map(function (voucher, idx) {
            return _voucherCardHTML(voucher, idx);
        }).join('');

        grid.innerHTML = html;
        section.style.display = 'block';

        /* Bind copy buttons */
        _bindCopyButtons(grid);

        /* Bind code display click (cũng copy) */
        grid.querySelectorAll('.pr-coupon-code-display').forEach(function (el) {
            el.addEventListener('click', function () {
                const code = this.getAttribute('data-code');
                if (code) _copyCode(code, this);
            });
        });

    } catch (err) {
        console.warn('[Promotions] renderVoucherCards:', err.message);
    }
}

function _voucherCardHTML(voucher, idx) {
    const minOrderFmt = _fmtPrice(voucher.minOrder);
    const animDelay   = (idx * 80) + 'ms';

    return `
        <div class="pr-coupon-card pr-coupon-palette-${voucher.palette}"
             style="animation: hsCardIn .3s ${animDelay} ease both">

            <!-- Color strip left -->
            <div class="pr-coupon-strip"></div>

            <!-- Left section: vertical code -->
            <div class="pr-coupon-left">
                <span class="pr-coupon-code-vertical">${_esc(voucher.code)}</span>
                <div style="width:28px;height:28px;border-radius:50%;
                            background:rgba(0,0,0,.06);
                            display:flex;align-items:center;justify-content:center;
                            margin-top:8px">
                    <i class="fas ${voucher.icon}" style="font-size:.72rem;opacity:.6"></i>
                </div>
            </div>

            <!-- Dashed divider -->
            <div class="pr-coupon-divider"></div>

            <!-- Right section: details -->
            <div class="pr-coupon-right">
                <p class="pr-coupon-discount-big">${_esc(voucher.discount)}</p>
                <p class="pr-coupon-name">${_esc(voucher.name)}</p>

                <p class="pr-coupon-cond">
                    <i class="fas fa-circle-info"></i>
                    ${_esc(voucher.desc)}
                </p>

                <p class="pr-coupon-cond" style="margin-top:2px">
                    <i class="fas fa-calendar-days"></i>
                    ${_esc(voucher.valid)}
                </p>

                <!-- Footer: code + copy btn -->
                <div class="pr-coupon-footer">
                    <span class="pr-coupon-code-display" data-code="${_esc(voucher.code)}"
                          title="Nhấn để sao chép">
                        ${_esc(voucher.code)}
                    </span>
                    <button class="pr-copy-btn" data-code="${_esc(voucher.code)}" aria-label="Sao chép mã ${_esc(voucher.code)}">
                        <i class="fas fa-copy"></i>
                        Sao chép
                    </button>
                </div>
            </div>
        </div>
    `;
}

function _bindCopyButtons(container) {
    try {
        container.querySelectorAll('.pr-copy-btn').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                const code = this.getAttribute('data-code');
                if (code) _copyCode(code, this);
            });
        });
    } catch (_) {}
}

function _copyCode(code, triggerEl) {
    try {
        /* Copy to clipboard */
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(code).then(function () {
                _showCopiedFeedback(triggerEl, code);
            }).catch(function () {
                _fallbackCopy(code, triggerEl);
            });
        } else {
            _fallbackCopy(code, triggerEl);
        }
    } catch (_) {
        _fallbackCopy(code, triggerEl);
    }
}

function _fallbackCopy(code, triggerEl) {
    try {
        const ta = document.createElement('textarea');
        ta.value = code;
        ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        _showCopiedFeedback(triggerEl, code);
    } catch (_) {
        showToast('Không thể sao chép. Hãy copy thủ công: ' + code, 'error');
    }
}

function _showCopiedFeedback(triggerEl, code) {
    try {
        /* Nếu trigger là copy btn */
        if (triggerEl && triggerEl.classList.contains('pr-copy-btn')) {
            const origHTML = triggerEl.innerHTML;
            triggerEl.classList.add('copied');
            triggerEl.innerHTML = '<i class="fas fa-circle-check"></i> Đã sao chép!';
            setTimeout(function () {
                try {
                    triggerEl.classList.remove('copied');
                    triggerEl.innerHTML = origHTML;
                } catch (_) {}
            }, 2000);
        }

        /* Toast */
        showToast('Đã sao chép mã ' + code + '! Dán vào ô kiểm tra hoặc giỏ hàng.', 'success');

        /* Tự động điền vào checker input */
        const codeInp = document.getElementById('prCodeInp');
        if (codeInp) {
            codeInp.value = code;
            codeInp.focus();
            /* Xoá kết quả cũ */
            _hideCheckerResult();
        }

    } catch (_) {}
}


/* ================================================================
   7. AUTO FILL SUBTOTAL — Đọc localCart để gợi ý số tiền
   ================================================================ */
function autoFillSubtotal() {
    try {
        const subInp = document.getElementById('prSubtotalInp');
        if (!subInp) return;

        const raw = localStorage.getItem('localCart');
        if (!raw) return;

        const cart = JSON.parse(raw);
        if (!Array.isArray(cart) || cart.length === 0) return;

        const subtotal = cart.reduce(function (sum, item) {
            return sum + (Number(item.price || 0) * Number(item.quantity || 1));
        }, 0);

        if (subtotal > 0) {
            subInp.value       = subtotal;
            subInp.placeholder = 'Giỏ hàng: ' + _fmtPrice(subtotal);

            /* Tooltip nhỏ */
            subInp.title = 'Tự động điền từ giỏ hàng hiện tại';
        }

    } catch (_) {
        /* Không crash nếu localCart bị lỗi */
    }
}


/* ================================================================
   8. TOPBAR — Table chip + search proxy
   ================================================================ */
function initTopbar() {
    try {
        const tableName = _lsGet('tableName');

        if (tableName) {
            const chip  = document.getElementById('topbarTableChip');
            const label = document.getElementById('topbarTableName');
            if (chip)  chip.style.display = 'flex';
            if (label) label.textContent  = tableName;
        }
    } catch (_) {}
}

function initSearchProxy() {
    try {
        const proxy = document.getElementById('topbarSearchProxy');
        if (!proxy) return;

        proxy.addEventListener('input', function () {
            const kw = this.value.trim().toLowerCase();
            _pr.searchKw = kw;

            if (_pr.searchTimer) clearTimeout(_pr.searchTimer);
            _pr.searchTimer = setTimeout(function () {
                _filterCombos(kw);
            }, 280);
        });

    } catch (_) {}
}

function _filterCombos(kw) {
    try {
        if (!kw) {
            renderComboGrid(_pr.combos);
            return;
        }

        const filtered = _pr.combos.filter(function (c) {
            return (c.name || '').toLowerCase().includes(kw) ||
                   (c.description || '').toLowerCase().includes(kw) ||
                   (c.food_names || '').toLowerCase().includes(kw);
        });

        renderComboGrid(filtered);

    } catch (_) {}
}


/* ================================================================
   9. TOAST
   ================================================================ */
function showToast(msg, type) {
    try {
        const container = document.getElementById('prToastContainer');
        if (!container) return;

        const iconMap = {
            success: 'fa-circle-check',
            error:   'fa-circle-xmark',
            warning: 'fa-triangle-exclamation',
            info:    'fa-circle-info',
        };
        const icon = iconMap[type] || 'fa-circle-info';

        const toast = document.createElement('div');
        toast.className = 'pr-toast ' + (type || 'info');
        toast.innerHTML = `<i class="fas ${icon}"></i><span style="flex:1">${_esc(msg)}</span>`;

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
   10. UTILITIES
   ================================================================ */
function _fmtPrice(num) {
    try { return Number(num).toLocaleString('vi-VN') + '₫'; }
    catch (_) { return num + '₫'; }
}

function _esc(str) {
    try {
        return String(str || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    } catch (_) { return ''; }
}

function _lsGet(key) {
    try { return localStorage.getItem(key) || null; }
    catch (_) { return null; }
}


/* ================================================================
   11. EXPOSE PUBLIC
   ================================================================ */
window.PromotionsPage = {
    loadCombos:          loadCombos,
    checkCoupon:         checkCoupon,
    renderVoucherCards:  renderVoucherCards,
    renderComboGrid:     renderComboGrid,
    showToast:           showToast,
};