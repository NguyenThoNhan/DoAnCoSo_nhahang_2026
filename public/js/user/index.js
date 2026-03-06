/* ================================================================
   GOMEAL — INDEX.JS
   File: public/js/user/index.js

   Chạy sau common.js và layout.js.
   Phụ trách TẤT CẢ logic trang Trang chủ (views/user/index.html):

     1. Hero slideshow     — 4s/slide, dots, swipe
     2. loadCategories()   — GET /api/user/public/categories
     3. loadFeatured()     — GET /api/user/public/menu (filter is_featured)
                             (Không có route /featured riêng → dùng /menu)
     4. loadCombos()       — GET /api/user/public/combos
     5. renderMembership() — authToken → getProfileDetails / guest → login banner
     6. initTopbarSession()— Hiện bàn chip nếu có guestToken
     7. initSearch()       — Filter featured grid theo keyword
     8. updateHeroStats()  — Cập nhật số liệu trên hero cards

   APIs dùng (đúng theo user.routes.js):
     GET /api/user/public/menu
     GET /api/user/public/categories
     GET /api/user/public/combos
     GET /api/user/profile-details   (cần authToken)

   Không tạo route mới. Không phá layout user.
   ================================================================ */

'use strict';

/* ================================================================
   0. CONSTANTS & STATE
   ================================================================ */
const SLIDE_INTERVAL_MS = 4000; // 4 giây / slide

const _state = {
    heroIndex:    0,
    heroTimer:    null,
    heroSlides:   null,
    heroDots:     null,
    allFoods:     [],       // cache từ /menu
    allCombos:    [],       // cache từ /combos
    categories:   [],
    searchTimer:  null,
};

/* Emoji map cho category icons */
const CAT_EMOJI = {
    'burger':    '🍔',
    'pizza':     '🍕',
    'noodle':    '🍜',
    'rice':      '🍚',
    'drink':     '🧋',
    'dessert':   '🍰',
    'salad':     '🥗',
    'chicken':   '🍗',
    'seafood':   '🦐',
    'steak':     '🥩',
    'soup':      '🍲',
    'sandwich':  '🥪',
    'default':   '🍽️',
};

/* Tier config cho membership */
const TIERS = {
    silver:   { label: 'Bạc',     icon: 'fas fa-circle',    color: '#9CA3AF', next: 'Vàng',    threshold: 500  },
    gold:     { label: 'Vàng',    icon: 'fas fa-star',      color: '#F7931E', next: 'Kim cương', threshold: 1500 },
    diamond:  { label: 'Kim cương', icon: 'fas fa-gem',    color: '#6366F1', next: null,        threshold: null },
    none:     { label: 'Vãng lai', icon: 'fas fa-circle',  color: '#D1D5DB', next: 'Bạc',      threshold: 200  },
};


/* ================================================================
   1. ENTRY POINT
   ================================================================ */
document.addEventListener('DOMContentLoaded', function indexInit() {
    try {
        _initHeroSlideshow();
        _initTopbarSession();
        _initSearch();

        // Load data concurrently
        Promise.all([
            _loadCategories(),
            _loadFeatured(),
            _loadCombos(),
        ]).catch(function (err) {
            console.warn('[Index] Lỗi load data:', err.message);
        });

        _renderMembership();

        console.log('[Index] Initialized.');
    } catch (err) {
        console.error('[Index] Init error:', err.message);
    }
});


/* ================================================================
   2. HERO SLIDESHOW
   ================================================================ */
function _initHeroSlideshow() {
    try {
        _state.heroSlides = document.querySelectorAll('.hero-slide');
        _state.heroDots   = document.querySelectorAll('.hero-dot');

        if (!_state.heroSlides || !_state.heroSlides.length) return;

        // Dot click
        _state.heroDots.forEach(function (dot) {
            dot.addEventListener('click', function () {
                try {
                    const idx = parseInt(this.getAttribute('data-idx'), 10);
                    if (!isNaN(idx)) { _heroGoTo(idx); _heroResetTimer(); }
                } catch (_) {}
            });
        });

        // Touch swipe
        const track = document.getElementById('heroSlideTrack');
        if (track) {
            let _sx = 0;
            track.addEventListener('touchstart', function (e) { _sx = e.touches[0].clientX; }, { passive: true });
            track.addEventListener('touchend', function (e) {
                try {
                    const diff = _sx - e.changedTouches[0].clientX;
                    if (Math.abs(diff) > 44) {
                        diff > 0 ? _heroNext() : _heroGoTo((_state.heroIndex - 1 + _state.heroSlides.length) % _state.heroSlides.length);
                        _heroResetTimer();
                    }
                } catch (_) {}
            }, { passive: true });
        }

        _heroResetTimer();
    } catch (err) {
        console.warn('[Index] _initHeroSlideshow:', err.message);
    }
}

function _heroGoTo(idx) {
    try {
        if (!_state.heroSlides || idx === _state.heroIndex) return;

        _state.heroSlides[_state.heroIndex].classList.remove('active');
        _state.heroSlides[_state.heroIndex].classList.add('leaving');
        if (_state.heroDots[_state.heroIndex]) _state.heroDots[_state.heroIndex].classList.remove('active');

        const prev = _state.heroIndex;
        setTimeout(function () {
            try { if (_state.heroSlides[prev]) _state.heroSlides[prev].classList.remove('leaving'); } catch (_) {}
        }, 1300);

        _state.heroIndex = idx;
        _state.heroSlides[_state.heroIndex].classList.add('active');
        if (_state.heroDots[_state.heroIndex]) _state.heroDots[_state.heroIndex].classList.add('active');
    } catch (_) {}
}

function _heroNext() {
    _heroGoTo((_state.heroIndex + 1) % (_state.heroSlides ? _state.heroSlides.length : 1));
}

function _heroResetTimer() {
    try {
        if (_state.heroTimer) clearInterval(_state.heroTimer);
        _state.heroTimer = setInterval(_heroNext, SLIDE_INTERVAL_MS);
    } catch (_) {}
}


/* ================================================================
   3. TOPBAR SESSION — Hiện table chip nếu có guestToken
   ================================================================ */
function _initTopbarSession() {
    try {
        const guestToken  = localStorage.getItem('guestToken');
        const tableName   = localStorage.getItem('tableName');
        const chip        = document.getElementById('topbarTableChip');
        const chipLabel   = document.getElementById('topbarTableName');

        if (guestToken && tableName && chip) {
            chip.style.display = 'flex';
            if (chipLabel) chipLabel.textContent = tableName;
        }
    } catch (_) {}
}


/* ================================================================
   4. LOAD CATEGORIES — GET /api/user/public/categories
   ================================================================ */
async function _loadCategories() {
    try {
        const res = await fetch('/api/user/public/categories');
        if (!res.ok) throw new Error('HTTP ' + res.status);

        const data = await res.json();
        if (!Array.isArray(data)) return;

        _state.categories = data;
        _renderCategoryStrip(data);

    } catch (err) {
        console.warn('[Index] _loadCategories:', err.message);
        // Categories strip giữ nguyên "Tất cả" — không crash page
    }
}

function _renderCategoryStrip(categories) {
    try {
        const strip = document.getElementById('catStrip');
        if (!strip) return;

        const allBtn = `
            <button class="cat-item active" data-cat="all">
                <i class="fas fa-star"></i> Tất cả
            </button>
        `;
        const catBtns = categories.slice(0, 8).map(function (cat) {
            const emoji = _getCatEmoji(cat.name || '');
            return `
                <button class="cat-item" data-cat="${cat.id}" data-cat-name="${_esc(cat.name)}">
                    ${emoji} ${_esc(cat.name)}
                </button>
            `;
        }).join('');

        strip.innerHTML = allBtn + catBtns;

        // Bind filter
        strip.querySelectorAll('.cat-item').forEach(function (btn) {
            btn.addEventListener('click', function () {
                strip.querySelectorAll('.cat-item').forEach(function (b) { b.classList.remove('active'); });
                this.classList.add('active');
                const catId = this.getAttribute('data-cat');
                _filterFeaturedGrid(catId);
            });
        });

    } catch (err) {
        console.warn('[Index] _renderCategoryStrip:', err.message);
    }
}

function _getCatEmoji(name) {
    const n = (name || '').toLowerCase();
    for (const key in CAT_EMOJI) {
        if (n.includes(key)) return CAT_EMOJI[key];
    }
    return CAT_EMOJI.default;
}


/* ================================================================
   5. LOAD FEATURED — GET /api/user/public/menu (filter is_featured)
      Dùng /menu vì /featured chưa được mount trong routes
   ================================================================ */
async function _loadFeatured() {
    try {
        const res = await fetch('/api/user/public/menu');
        if (!res.ok) throw new Error('HTTP ' + res.status);

        const data = await res.json();
        if (!Array.isArray(data)) throw new Error('Invalid data');

        _state.allFoods = data;

        // Lấy featured: is_featured = 1, sắp xếp featured trước, giới hạn 6
        const featured = data
            .filter(function (f) { return f.is_featured; })
            .slice(0, 6);

        // Nếu không đủ 6 featured → bổ sung từ all
        const shown = featured.length >= 6
            ? featured
            : featured.concat(
                data.filter(function (f) { return !f.is_featured; })
                    .slice(0, 6 - featured.length)
              );

        _renderFeaturedGrid(shown);
        _updateHeroStats(data);

    } catch (err) {
        console.warn('[Index] _loadFeatured:', err.message);
        _renderFeaturedError();
    }
}

function _renderFeaturedGrid(foods) {
    try {
        const grid = document.getElementById('featuredGrid');
        if (!grid) return;

        if (!foods || foods.length === 0) {
            grid.innerHTML = `
                <div class="empty-feed">
                    <div class="empty-feed-icon">🍽️</div>
                    <p class="empty-feed-text">Chưa có món nào hôm nay</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = foods.map(function (food, idx) {
            return _foodCardHTML(food, idx);
        }).join('');

        // Bind add-to-cart buttons
        grid.querySelectorAll('.f-card-add-btn').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                try {
                    const foodId   = parseInt(this.getAttribute('data-food-id'), 10);
                    const foodName = this.getAttribute('data-food-name');
                    const price    = parseFloat(this.getAttribute('data-price'));
                    _addToCart(foodId, foodName, price, this);
                } catch (_) {}
            });
        });

        // Bind card click → menu page
        grid.querySelectorAll('.f-card').forEach(function (card) {
            card.addEventListener('click', function (e) {
                if (e.target.closest('.f-card-add-btn') || e.target.closest('.f-card-wish')) return;
                window.location.href = '/views/user/menu.html';
            });
        });

    } catch (err) {
        console.warn('[Index] _renderFeaturedGrid:', err.message);
    }
}

function _foodCardHTML(food, idx) {
    const price    = Number(food.price || 0);
    const imgSrc   = food.image_url || '';
    const name     = _esc(food.name || 'Món ăn');
    const catName  = _esc(food.category_name || '');
    const isFeat   = food.is_featured;

    // Random badge cho visual variety
    const badges = ['', 'Nổi bật', 'Hot', 'Mới'];
    const badgeClasses = ['', '', 'badge-hot', 'badge-new'];
    const badgeIdx = isFeat ? 1 : (idx % 4);
    const badgeLabel = badges[badgeIdx] || '';
    const badgeClass = badgeClasses[badgeIdx] || '';

    // Stars (static display — no real rating in model)
    const stars = '★★★★★';

    return `
        <article class="f-card" tabindex="0" role="button" aria-label="${name}">
            <div class="f-card-img-wrap">
                ${imgSrc
                    ? `<img class="f-card-img" src="${imgSrc}" alt="${name}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
                    : ''
                }
                <div class="f-card-img" style="display:${imgSrc ? 'none' : 'flex'};align-items:center;justify-content:center;font-size:3rem;background:#F9F7F5">
                    ${_getCatEmoji(catName)}
                </div>
                ${badgeLabel ? `<span class="f-card-badge ${badgeClass}">${badgeLabel}</span>` : ''}
                <button class="f-card-wish" aria-label="Yêu thích">
                    <i class="fas fa-heart"></i>
                </button>
            </div>
            <div class="f-card-body">
                ${catName ? `<p class="f-card-cat">${catName}</p>` : ''}
                <h3 class="f-card-name">${name}</h3>
                <div class="f-card-stars">
                    ${stars}
                    <span>(${Math.floor(Math.random() * 80) + 20})</span>
                </div>
                <div class="f-card-footer">
                    <div>
                        <span class="f-card-price">${_fmtPrice(price)}</span>
                    </div>
                    <button
                        class="f-card-add-btn"
                        data-food-id="${food.id}"
                        data-food-name="${name}"
                        data-price="${price}"
                        aria-label="Thêm ${name} vào giỏ"
                        title="Thêm vào giỏ"
                    >
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
            </div>
        </article>
    `;
}

function _renderFeaturedError() {
    try {
        const grid = document.getElementById('featuredGrid');
        if (!grid) return;
        grid.innerHTML = `
            <div class="empty-feed">
                <div class="empty-feed-icon">⚠️</div>
                <p class="empty-feed-text">Không thể tải món ăn. <a href="javascript:void(0)" onclick="_loadFeatured()" style="color:#FF6B35">Thử lại</a></p>
            </div>
        `;
    } catch (_) {}
}

/* Filter grid theo category */
function _filterFeaturedGrid(catId) {
    try {
        let foods = _state.allFoods;
        if (catId !== 'all') {
            const id = parseInt(catId, 10);
            foods = foods.filter(function (f) { return f.category_id === id; });
        }

        // Prioritize featured, limit 6
        const sorted = foods
            .sort(function (a, b) { return (b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0); })
            .slice(0, 6);

        _renderFeaturedGrid(sorted);
    } catch (err) {
        console.warn('[Index] _filterFeaturedGrid:', err.message);
    }
}


/* ================================================================
   6. LOAD COMBOS — GET /api/user/public/combos
   ================================================================ */
async function _loadCombos() {
    try {
        const res = await fetch('/api/user/public/combos');
        if (!res.ok) throw new Error('HTTP ' + res.status);

        const data = await res.json();
        if (!Array.isArray(data)) throw new Error('Invalid data');

        _state.allCombos = data;

        // Hiện max 3 combos trên trang chủ
        const shown = data.slice(0, 3);
        _renderCombos(shown);

        // Cập nhật hero stat slide 2
        const heroComboEl = document.getElementById('heroStatCombos');
        if (heroComboEl) heroComboEl.textContent = data.length;

    } catch (err) {
        console.warn('[Index] _loadCombos:', err.message);
        _renderCombosError();
    }
}

function _renderCombos(combos) {
    try {
        const grid = document.getElementById('comboGrid');
        if (!grid) return;

        if (!combos || combos.length === 0) {
            grid.innerHTML = `
                <div class="empty-feed" style="grid-column:1/-1">
                    <div class="empty-feed-icon">🎁</div>
                    <p class="empty-feed-text">Chưa có combo khuyến mãi</p>
                </div>
            `;
            return;
        }

        // Combo emojis array cho variety
        const comboEmojis = ['🎁', '🍱', '🥗', '🍔', '🍕', '☕'];

        grid.innerHTML = combos.map(function (combo, idx) {
            const price    = Number(combo.price || 0);
            const name     = _esc(combo.name || 'Combo');
            const desc     = _esc(combo.description || '');
            const items    = _esc(combo.food_names || '');
            const emoji    = comboEmojis[idx % comboEmojis.length];

            return `
                <article class="combo-card">
                    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
                        <div class="combo-card-icon">${emoji}</div>
                        <span class="combo-card-tag">COMBO</span>
                    </div>
                    <div>
                        <h3 class="combo-card-name">${name}</h3>
                        ${desc ? `<p class="combo-card-items">${desc}</p>` : ''}
                        ${items ? `<p class="combo-card-items" style="margin-top:4px;color:#C4BAB3">Bao gồm: ${items}</p>` : ''}
                    </div>
                    <div class="combo-card-footer">
                        <span class="combo-card-price">${_fmtPrice(price)}</span>
                    </div>
                    <button class="combo-card-cta" data-combo-id="${combo.id}" data-combo-name="${name}" data-price="${price}">
                        <i class="fas fa-cart-plus"></i>
                        Thêm vào giỏ
                    </button>
                </article>
            `;
        }).join('');

        // Bind combo CTA buttons
        grid.querySelectorAll('.combo-card-cta').forEach(function (btn) {
            btn.addEventListener('click', function () {
                try {
                    const name  = this.getAttribute('data-combo-name');
                    const price = parseFloat(this.getAttribute('data-price'));
                    const id    = parseInt(this.getAttribute('data-combo-id'), 10);
                    _addToCart(id, name, price, this, true);
                } catch (_) {}
            });
        });

    } catch (err) {
        console.warn('[Index] _renderCombos:', err.message);
    }
}

function _renderCombosError() {
    try {
        const grid = document.getElementById('comboGrid');
        if (grid) grid.innerHTML = `<div class="empty-feed" style="grid-column:1/-1"><div class="empty-feed-icon">⚠️</div><p class="empty-feed-text">Không thể tải combo</p></div>`;
    } catch (_) {}
}


/* ================================================================
   7. MEMBERSHIP — authToken → profile API / guest → login banner
   ================================================================ */
async function _renderMembership() {
    try {
        const container = document.getElementById('memberCardContainer');
        if (!container) return;

        // Lấy token từ common.js
        const token = (typeof GoMeal !== 'undefined' && GoMeal.getToken)
            ? GoMeal.getToken()
            : localStorage.getItem('authToken');

        if (token) {
            // Có authToken → fetch profile
            await _renderMemberPointsCard(token, container);
        } else {
            // Guest → login banner
            _renderLoginBanner(container);
        }

    } catch (err) {
        console.warn('[Index] _renderMembership:', err.message);
        // Fallback: login banner
        const container = document.getElementById('memberCardContainer');
        if (container) _renderLoginBanner(container);
    }
}

async function _renderMemberPointsCard(token, container) {
    try {
        // GET /api/user/profile-details (yêu cầu authToken)
        const res = await fetch('/api/user/profile-details', {
            headers: { 'Authorization': 'Bearer ' + token }
        });

        if (!res.ok) {
            // Token không hợp lệ → hiện login banner
            _renderLoginBanner(container);
            return;
        }

        const profile = await res.json();
        const name    = profile.name || 'Bạn';
        const points  = Number(profile.total_points || 0);
        const tier    = (profile.membership_level || 'none').toLowerCase();
        const tierCfg = TIERS[tier] || TIERS.none;

        // Tính % progress lên tier tiếp theo
        let progressPct = 0;
        let progressHint = '';
        if (tierCfg.threshold && tier !== 'diamond') {
            progressPct  = Math.min(Math.round((points / tierCfg.threshold) * 100), 100);
            const needed = Math.max(tierCfg.threshold - points, 0);
            progressHint = needed > 0
                ? `Cần thêm ${needed.toLocaleString('vi-VN')} điểm để lên hạng ${tierCfg.next}`
                : `Đã đủ điểm lên hạng ${tierCfg.next}! 🎉`;
        } else if (tier === 'diamond') {
            progressPct  = 100;
            progressHint = 'Bạn đang ở hạng cao nhất — Kim cương! 💎';
        }

        container.innerHTML = `
            <div class="member-points-card">
                <div class="member-pts-left">
                    <div class="member-pts-badge">
                        <i class="${tierCfg.icon}" style="color:${tierCfg.color}"></i>
                        Thành viên ${tierCfg.label}
                    </div>
                    <p class="member-pts-greeting">Xin chào,</p>
                    <p class="member-pts-name">${_esc(name)}</p>

                    <div class="member-pts-bar-wrap">
                        <div class="member-pts-bar-label">
                            <span>Điểm hiện tại</span>
                            <span>${points.toLocaleString('vi-VN')} / ${(tierCfg.threshold || points).toLocaleString('vi-VN')} điểm</span>
                        </div>
                        <div class="member-pts-bar-track">
                            <div class="member-pts-bar-fill" id="memberPtsBarFill" style="width:0%"></div>
                        </div>
                    </div>
                    <p class="member-pts-hint">${progressHint}</p>
                </div>
                <div class="member-pts-right">
                    <div class="member-pts-circle">
                        <span class="member-pts-val">${_formatCompact(points)}</span>
                        <span class="member-pts-unit">Điểm</span>
                    </div>
                </div>
            </div>
        `;

        // Animate progress bar
        setTimeout(function () {
            try {
                const fill = document.getElementById('memberPtsBarFill');
                if (fill) fill.style.width = progressPct + '%';
            } catch (_) {}
        }, 400);

    } catch (err) {
        console.warn('[Index] _renderMemberPointsCard:', err.message);
        _renderLoginBanner(container);
    }
}

function _renderLoginBanner(container) {
    try {
        container.innerHTML = `
            <div class="member-login-banner">
                <div class="member-login-icon">🏅</div>
                <div class="member-login-text">
                    <h3 class="member-login-title">Đăng nhập để nhận ưu đãi</h3>
                    <p class="member-login-sub">Tích điểm mỗi lần đặt món, đổi quà hấp dẫn và nhận voucher độc quyền cho thành viên.</p>
                    <div class="member-login-perks">
                        <span class="perk-chip"><i class="fas fa-gift"></i> Voucher mỗi tuần</span>
                        <span class="perk-chip"><i class="fas fa-star"></i> Tích điểm</span>
                        <span class="perk-chip"><i class="fas fa-crown"></i> Hạng VIP</span>
                        <span class="perk-chip"><i class="fas fa-bolt"></i> Ưu tiên phục vụ</span>
                    </div>
                </div>
                <div class="member-login-cta">
                    <a href="/views/auth/login.html" class="member-btn-login">
                        <i class="fas fa-right-to-bracket"></i>
                        Đăng nhập
                    </a>
                    <a href="/views/auth/register.html" class="member-btn-register">
                        Đăng ký miễn phí
                    </a>
                </div>
            </div>
        `;
    } catch (_) {}
}


/* ================================================================
   8. UPDATE HERO STATS (sau khi data load xong)
   ================================================================ */
function _updateHeroStats(foods) {
    try {
        const dishEl = document.getElementById('heroStatDishes');
        if (dishEl) dishEl.textContent = (foods ? foods.length : 0) + '+';
    } catch (_) {}
}


/* ================================================================
   9. ADD TO CART (simple — ghi vào localStorage)
   ================================================================ */
function _addToCart(id, name, price, btnEl, isCombo) {
    try {
        // Redirect nếu chưa có phiên bàn
        const guestToken = localStorage.getItem('guestToken');
        const authToken  = localStorage.getItem('authToken');

        if (!guestToken && !authToken) {
            // Chưa có phiên → đưa tới table-select
            _showToast('Hãy chọn bàn để bắt đầu đặt món!', 'info');
            setTimeout(function () {
                window.location.href = '/views/user/table-select.html';
            }, 1200);
            return;
        }

        // Đọc cart từ localStorage
        let cart = [];
        try {
            const raw = localStorage.getItem('gomeal_cart');
            cart = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(cart)) cart = [];
        } catch (_) { cart = []; }

        // Thêm / tăng qty
        const key      = (isCombo ? 'combo_' : 'food_') + id;
        const existing = cart.find(function (c) { return c.key === key; });
        if (existing) {
            existing.quantity += 1;
        } else {
            cart.push({ key, id, name, price, quantity: 1, isCombo: !!isCombo });
        }

        localStorage.setItem('gomeal_cart', JSON.stringify(cart));

        // Dispatch event cho layout.js cập nhật cart dot
        window.dispatchEvent(new CustomEvent('cartUpdated'));

        // Visual feedback on button
        if (btnEl) {
            const origHTML = btnEl.innerHTML;
            btnEl.innerHTML = '<i class="fas fa-check"></i>';
            btnEl.style.background = 'linear-gradient(135deg,#10B981,#059669)';
            setTimeout(function () {
                try {
                    btnEl.innerHTML = origHTML;
                    btnEl.style.background = '';
                } catch (_) {}
            }, 900);
        }

        _showToast(_esc(name) + ' đã thêm vào giỏ!', 'success');

    } catch (err) {
        console.warn('[Index] _addToCart:', err.message);
    }
}


/* ================================================================
   10. SEARCH — Filter featured grid theo keyword
   ================================================================ */
function _initSearch() {
    try {
        const inp = document.getElementById('topbarSearchInput');
        if (!inp) return;

        inp.addEventListener('input', function () {
            const val = (this.value || '').trim().toLowerCase();

            // Debounce 300ms
            if (_state.searchTimer) clearTimeout(_state.searchTimer);
            _state.searchTimer = setTimeout(function () {
                try {
                    if (!val) {
                        // Hiện lại featured
                        const featured = _state.allFoods
                            .filter(function (f) { return f.is_featured; })
                            .slice(0, 6);
                        const shown = featured.length >= 6
                            ? featured
                            : featured.concat(_state.allFoods.filter(function (f) { return !f.is_featured; }).slice(0, 6 - featured.length));
                        _renderFeaturedGrid(shown);
                        return;
                    }

                    // Filter by name
                    const results = _state.allFoods
                        .filter(function (f) {
                            return (f.name || '').toLowerCase().includes(val) ||
                                   (f.category_name || '').toLowerCase().includes(val);
                        })
                        .slice(0, 6);

                    _renderFeaturedGrid(results.length > 0 ? results : []);

                    // Update sec title
                    const title = document.querySelector('#featuredSection .sec-title');
                    if (title) {
                        title.textContent = results.length > 0
                            ? `🔍 Kết quả cho "${val}" (${results.length})`
                            : `🔍 Không tìm thấy "${val}"`;
                    }
                } catch (_) {}
            }, 300);
        });

        // Clear search on blur if empty
        inp.addEventListener('blur', function () {
            if (!this.value.trim()) {
                const title = document.querySelector('#featuredSection .sec-title');
                if (title) title.textContent = '🔥 Món nổi bật hôm nay';
            }
        });

    } catch (err) {
        console.warn('[Index] _initSearch:', err.message);
    }
}


/* ================================================================
   11. TOAST (inline — không phụ thuộc common.js toast)
   ================================================================ */
function _showToast(msg, type) {
    try {
        // Thử dùng GoMeal.showToast nếu có
        if (typeof GoMeal !== 'undefined' && typeof GoMeal.showToast === 'function') {
            GoMeal.showToast(msg, type);
            return;
        }

        // Fallback: tự tạo toast
        let container = document.getElementById('userToastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'userToastContainer';
            container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:10px;pointer-events:none';
            document.body.appendChild(container);
        }

        const colors  = { success: '#10B981', error: '#EF4444', info: '#FF6B35', warning: '#F59E0B' };
        const icons   = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info', warning: 'fa-triangle-exclamation' };
        const color   = colors[type] || colors.info;
        const icon    = icons[type]  || icons.info;

        const toast = document.createElement('div');
        toast.style.cssText = `display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:14px;background:#fff;border-left:4px solid ${color};box-shadow:0 8px 28px rgba(0,0,0,.14);font-family:'Outfit',sans-serif;font-size:.82rem;color:#1A1A1A;max-width:320px;pointer-events:all;animation:toastSlide .3s ease`;
        toast.innerHTML = `<i class="fas ${icon}" style="color:${color};flex-shrink:0"></i><span style="flex:1;line-height:1.4">${msg}</span>`;

        container.appendChild(toast);
        setTimeout(function () { try { toast.remove(); } catch (_) {} }, 3200);

    } catch (_) {}
}


/* ================================================================
   12. UTILITIES
   ================================================================ */
function _fmtPrice(num) {
    try {
        return Number(num).toLocaleString('vi-VN') + '₫';
    } catch (_) { return num + '₫'; }
}

function _formatCompact(num) {
    try {
        if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
        return num.toString();
    } catch (_) { return String(num); }
}

function _esc(str) {
    try {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    } catch (_) { return ''; }
}


/* ================================================================
   13. EXPOSE PUBLIC (debug)
   ================================================================ */
window.IndexPage = {
    loadFeatured:    _loadFeatured,
    loadCombos:      _loadCombos,
    loadCategories:  _loadCategories,
    renderMembership: _renderMembership,
};