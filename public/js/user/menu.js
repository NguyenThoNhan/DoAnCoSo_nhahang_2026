/* ================================================================
   GOMEAL — MENU.JS
   File: public/js/user/menu.js

   Phụ trách MỌI logic trang Đặt món (views/user/menu.html):

     1.  guardSession()        — Kiểm tra guestToken / redirect table-select
     2.  initTopbar()          — Hiện table chip, sync search proxy
     3.  loadCategories()      — GET /api/user/public/categories
     4.  loadMenu()            — GET /api/user/public/menu
     5.  renderFoodGrid()      — Render cards với qty badge, add btn state
     6.  filterAndSort()       — Filter by cat + search + sort, re-render
     7.  openFoodModal()       — Detail modal với stepper
     8.  Cart CRUD             — addToCart / removeFromCart / updateQty
     9.  renderCart()          — Render items, summary, enable/disable checkout
     10. applyCoupon()         — POST /api/user/public/promotions/check
     11. submitOrder()         — POST /api/user/order/create + Bearer token
     12. requestCheckout()     — PUT /api/user/order/request-checkout
     13. showToast()           — Inline toast
     14. loadMore()            — Phân trang cục bộ (12 items/page)

   API endpoints dùng (đúng theo user.routes.js):
     GET  /api/user/public/categories
     GET  /api/user/public/menu
     POST /api/user/public/promotions/check
     POST /api/user/order/create          ← cần Bearer guestToken/authToken
     PUT  /api/user/order/request-checkout ← cần Bearer guestToken

   Request body createOrder:
     { items: [{foodId, priceAtOrder, quantity, itemName}], promo_id? }
     Header: Authorization: Bearer <token>
     tableId được lấy từ decoded token (req.guest.tableId)

   localStorage keys:
     'guestToken'  — JWT guest token từ table-select
     'authToken'   — JWT auth token khi đăng nhập
     'tableName'   — tên bàn hiển thị "Bàn X"
     'localCart'   — giỏ hàng (theo yêu cầu)

   Không tạo route mới. Không phá layout user.
   ================================================================ */

'use strict';

/* ================================================================
   0. CONSTANTS & STATE
   ================================================================ */
const CART_KEY      = 'localCart';       // key theo yêu cầu
const PAGE_SIZE     = 12;                // items mỗi trang

const CAT_EMOJI_MAP = {
    'burger': '🍔', 'pizza': '🍕', 'noodle': '🍜', 'mì': '🍜',
    'rice': '🍚', 'cơm': '🍚', 'drink': '🧋', 'đồ uống': '🧋',
    'dessert': '🍰', 'tráng': '🍰', 'salad': '🥗', 'chicken': '🍗',
    'gà': '🍗', 'seafood': '🦐', 'hải sản': '🦐', 'steak': '🥩',
    'bò': '🥩', 'soup': '🍲', 'lẩu': '🍲', 'sandwich': '🥪',
    'bánh': '🥐', 'snack': '🍟', 'ăn vặt': '🍟',
};

const _s = {
    // Data
    allFoods:       [],   // toàn bộ từ API /menu
    categories:     [],   // từ API /categories
    filteredFoods:  [],   // sau khi filter
    displayedCount: 0,    // số items đang hiển thị

    // Filter state
    activeCatId:    'all',
    searchKeyword:  '',
    sortMode:       'default',

    // Cart
    cart:           [],   // [{foodId, foodName, price, quantity, imageUrl}]

    // Coupon
    promoId:        null,
    discountAmount: 0,

    // Modal
    modalFood:      null,
    modalQty:       1,

    // Guard
    guardTimer:     null,
    guardSec:       5,

    // Token
    token:          null,   // guestToken or authToken
    isGuest:        false,
};


/* ================================================================
   1. ENTRY POINT
   ================================================================ */
document.addEventListener('DOMContentLoaded', function menuInit() {
    try {
        // 1. Guard — PHẢI có trước mọi thứ
        if (!guardSession()) return;   // nếu false → đang redirect, dừng

        // 2. Load cart từ localStorage
        _loadCartFromStorage();

        // 3. Init topbar
        initTopbar();

        // 4. Init event listeners (UI elements luôn có sẵn trong HTML)
        initEvents();

        // 5. Fetch data song song
        Promise.all([
            loadCategories(),
            loadMenu(),
        ]).catch(function (err) {
            console.warn('[Menu] Init load error:', err.message);
        });

        // 6. Render cart lần đầu (có thể có items từ session trước)
        renderCart();

        console.log('[Menu] Initialized. Token:', _s.isGuest ? 'guest' : 'auth');
    } catch (err) {
        console.error('[Menu] Init error:', err.message);
    }
});


/* ================================================================
   2. GUARD — Bắt buộc có guestToken HOẶC authToken
      Nếu không có → countdown 5s → redirect table-select
   ================================================================ */
function guardSession() {
    try {
        const guestToken = _lsGet('guestToken');
        const authToken  = _lsGet('authToken');

        // Ưu tiên dùng authToken nếu có (khách hàng đã đăng nhập)
        // để đơn hàng gắn với tài khoản → hiển thị trong lịch sử.
        if (authToken) {
            _s.token   = authToken;
            _s.isGuest = false;
            return true;
        }

        // Nếu không có authToken thì fallback sang guestToken (khách vãng lai tại bàn)
        if (guestToken) {
            _s.token   = guestToken;
            _s.isGuest = true;
            return true;
        }

        // Không có token → hiện guard overlay + countdown
        _showGuardOverlay();
        return false;   // caller dừng init

    } catch (err) {
        console.warn('[Menu] guardSession error:', err.message);
        _showGuardOverlay();
        return false;
    }
}

function _showGuardOverlay() {
    try {
        const overlay = document.getElementById('mpGuardOverlay');
        if (overlay) overlay.classList.add('show');

        // Countdown 5s → auto redirect
        _s.guardSec   = 5;
        _s.guardTimer = setInterval(function () {
            try {
                _s.guardSec -= 1;
                const secEl = document.getElementById('mpGuardSec');
                if (secEl) secEl.textContent = _s.guardSec;

                if (_s.guardSec <= 0) {
                    clearInterval(_s.guardTimer);
                    window.location.href = '/views/user/table-select.html';
                }
            } catch (_) {}
        }, 1000);
    } catch (_) {}
}


/* ================================================================
   3. TOPBAR — Table chip + search proxy sync
   ================================================================ */
function initTopbar() {
    try {
        const tableName = _lsGet('tableName');

        // Topbar table chip
        if (tableName) {
            const chip  = document.getElementById('topbarTableChip');
            const label = document.getElementById('topbarTableName');
            if (chip)  chip.style.display  = 'flex';
            if (label) label.textContent   = tableName;

            // Hiện nút hủy bàn khi đang ngồi tại bàn (có guestToken)
            const cancelBtn = document.getElementById('btnCancelTable');
            if (cancelBtn && _lsGet('guestToken')) {
                cancelBtn.style.display = 'flex';
            }
        }

        // Cart panel table chip
        const mpChip  = document.getElementById('mpTableChip');
        const mpLabel = document.getElementById('mpTableChipName');
        if (tableName && mpChip) {
            mpChip.style.display = 'flex';
            if (mpLabel) mpLabel.textContent = tableName;
        }

        // Search proxy (topbar) → sync vào mp-search
        const proxy = document.getElementById('topbarSearchProxy');
        const main  = document.getElementById('mpSearchInp');
        if (proxy && main) {
            proxy.addEventListener('input', function () {
                main.value = this.value;
                _triggerSearch(this.value);
            });
        }
    } catch (err) {
        console.warn('[Menu] initTopbar:', err.message);
    }
}


/* ================================================================
   4. INIT EVENTS — Bind tất cả UI handlers
   ================================================================ */
function initEvents() {
    try {
        // Search input
        const searchInp   = document.getElementById('mpSearchInp');
        const searchClear = document.getElementById('mpSearchClear');
        if (searchInp) {
            searchInp.addEventListener('input', function () {
                const val = this.value.trim();
                // Hiện/ẩn clear button
                if (searchClear) searchClear.classList.toggle('show', val.length > 0);
                _triggerSearch(val);
            });
        }
        if (searchClear) {
            searchClear.addEventListener('click', function () {
                const inp = document.getElementById('mpSearchInp');
                if (inp) { inp.value = ''; }
                const proxy = document.getElementById('topbarSearchProxy');
                if (proxy) { proxy.value = ''; }
                this.classList.remove('show');
                _triggerSearch('');
            });
        }

        // Sort select
        const sortSel = document.getElementById('mpSortSelect');
        if (sortSel) {
            sortSel.addEventListener('change', function () {
                _s.sortMode = this.value;
                filterAndSort();
            });
        }

        // Load more
        const loadMoreBtn = document.getElementById('mpLoadMoreBtn');
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', function () {
                _loadMoreItems();
            });
        }

        // Cart clear
        const clearBtn = document.getElementById('mpCartClearBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                _clearCart();
            });
        }

        // Coupon
        const couponBtn = document.getElementById('mpCouponBtn');
        if (couponBtn) {
            couponBtn.addEventListener('click', function () {
                applyCoupon();
            });
        }
        const couponInp = document.getElementById('mpCouponInp');
        if (couponInp) {
            couponInp.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') applyCoupon();
            });
        }

        // Checkout button
        const checkoutBtn = document.getElementById('mpCheckoutBtn');
        if (checkoutBtn) {
            checkoutBtn.addEventListener('click', function () {
                submitOrder();
            });
        }

        // ── Confirm modal buttons ──
        const confirmCancel = document.getElementById('mpConfirmCancel');
        if (confirmCancel) {
            confirmCancel.addEventListener('click', function () {
                var overlay = document.getElementById('mpConfirmOverlay');
                if (overlay) overlay.classList.remove('show');
            });
        }
        const confirmSubmit = document.getElementById('mpConfirmSubmit');
        if (confirmSubmit) {
            confirmSubmit.addEventListener('click', function () {
                _doSubmitOrder();
            });
        }
        // Đóng khi click ngoài modal
        var confirmOverlay = document.getElementById('mpConfirmOverlay');
        if (confirmOverlay) {
            confirmOverlay.addEventListener('click', function (e) {
                if (e.target === confirmOverlay) confirmOverlay.classList.remove('show');
            });
        }

        // ── Cancel Table button & modal ──
        var cancelTableBtn = document.getElementById('btnCancelTable');
        if (cancelTableBtn) {
            cancelTableBtn.addEventListener('click', function () {
                openCancelTableModal();
            });
        }
        var cancelBack = document.getElementById('mpCancelBack');
        if (cancelBack) {
            cancelBack.addEventListener('click', function () {
                var ov = document.getElementById('mpCancelOverlay');
                if (ov) ov.classList.remove('show');
            });
        }
        var cancelConfirm = document.getElementById('mpCancelConfirm');
        if (cancelConfirm) {
            cancelConfirm.addEventListener('click', function () {
                _doCancelTable();
            });
        }
        var cancelOverlay = document.getElementById('mpCancelOverlay');
        if (cancelOverlay) {
            cancelOverlay.addEventListener('click', function (e) {
                if (e.target === cancelOverlay) cancelOverlay.classList.remove('show');
            });
        }

        // Request checkout button
        const reqBtn = document.getElementById('mpReqCheckoutBtn');
        if (reqBtn) {
            reqBtn.addEventListener('click', function () {
                requestCheckout();
            });
        }

        // Modal close
        const modalClose   = document.getElementById('mpModalClose');
        const modalOverlay = document.getElementById('mpModalOverlay');
        if (modalClose)   modalClose.addEventListener('click', closeModal);
        if (modalOverlay) {
            modalOverlay.addEventListener('click', function (e) {
                if (e.target === modalOverlay) closeModal();
            });
        }

        // Modal stepper
        const modalMinus = document.getElementById('mpModalMinus');
        const modalPlus  = document.getElementById('mpModalPlus');
        if (modalMinus) {
            modalMinus.addEventListener('click', function () {
                if (_s.modalQty > 1) {
                    _s.modalQty -= 1;
                    _updateModalQty();
                }
            });
        }
        if (modalPlus) {
            modalPlus.addEventListener('click', function () {
                _s.modalQty += 1;
                _updateModalQty();
            });
        }

        // Modal add btn
        const modalAddBtn = document.getElementById('mpModalAddBtn');
        if (modalAddBtn) {
            modalAddBtn.addEventListener('click', function () {
                if (_s.modalFood) {
                    addToCart(_s.modalFood, _s.modalQty);
                    closeModal();
                    showToast('Đã thêm ' + _s.modalFood.name + ' vào giỏ! 🛒', 'success');
                }
            });
        }

        // Cart toggle (mobile)
        const cartToggle = document.getElementById('cartToggleBtn');
        const cartCol    = document.getElementById('mpCartCol');
        if (cartToggle && cartCol) {
            cartToggle.addEventListener('click', function () {
                cartCol.classList.toggle('open');
            });
        }

        // ESC key
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeModal();
        });

    } catch (err) {
        console.warn('[Menu] initEvents:', err.message);
    }
}


/* ================================================================
   5. LOAD CATEGORIES — GET /api/user/public/categories
   ================================================================ */
async function loadCategories() {
    try {
        const res = await fetch('/api/user/public/categories');
        if (!res.ok) throw new Error('HTTP ' + res.status);

        const data = await res.json();
        if (!Array.isArray(data)) return;

        _s.categories = data;
        _renderCategoryList(data);

    } catch (err) {
        console.warn('[Menu] loadCategories:', err.message);
        // Hiện "Tất cả" mặc định, không crash
        _renderCategoryList([]);
    }
}

function _renderCategoryList(categories) {
    try {
        const list = document.getElementById('catList');
        if (!list) return;

        const allBtn = `
            <button class="mp-cat-btn active" data-cat="all">
                <div class="mp-cat-icon">⭐</div>
                <span class="mp-cat-label">Tất cả</span>
                <span class="mp-cat-count" id="mpCatCountAll">${_s.allFoods.length || '...'}</span>
            </button>
        `;

        const catBtns = categories.map(function (cat) {
            const emoji = _getCatEmoji(cat.name || '');
            const count = _s.allFoods.filter(function (f) { return f.category_id === cat.id; }).length;
            return `
                <button class="mp-cat-btn" data-cat="${cat.id}">
                    <div class="mp-cat-icon">${emoji}</div>
                    <span class="mp-cat-label">${_esc(cat.name)}</span>
                    <span class="mp-cat-count">${count || ''}</span>
                </button>
            `;
        }).join('');

        list.innerHTML = allBtn + catBtns;

        // Bind clicks
        list.querySelectorAll('.mp-cat-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                list.querySelectorAll('.mp-cat-btn').forEach(function (b) { b.classList.remove('active'); });
                this.classList.add('active');
                _s.activeCatId = this.getAttribute('data-cat');
                _s.searchKeyword = '';
                const inp = document.getElementById('mpSearchInp');
                const clr = document.getElementById('mpSearchClear');
                const prx = document.getElementById('topbarSearchProxy');
                if (inp) inp.value = '';
                if (prx) prx.value = '';
                if (clr) clr.classList.remove('show');
                filterAndSort();
            });
        });

    } catch (err) {
        console.warn('[Menu] _renderCategoryList:', err.message);
    }
}


/* ================================================================
   6. LOAD MENU — GET /api/user/public/menu
   ================================================================ */
async function loadMenu() {
    try {
        const res = await fetch('/api/user/public/menu');
        if (!res.ok) throw new Error('HTTP ' + res.status);

        const data = await res.json();
        if (!Array.isArray(data)) throw new Error('Invalid response');

        _s.allFoods = data;

        // Update category counts nếu categories đã render
        _updateCategoryCounts();

        // Filter + sort + render
        filterAndSort();

    } catch (err) {
        console.warn('[Menu] loadMenu:', err.message);
        _renderFoodError();
    }
}

function _updateCategoryCounts() {
    try {
        const list = document.getElementById('catList');
        if (!list) return;

        // Update "Tất cả" count
        const allCountEl = document.getElementById('mpCatCountAll');
        if (allCountEl) allCountEl.textContent = _s.allFoods.length;

        // Update each cat count
        list.querySelectorAll('.mp-cat-btn[data-cat]').forEach(function (btn) {
            const catId = btn.getAttribute('data-cat');
            if (catId === 'all') return;
            const id    = parseInt(catId, 10);
            const count = _s.allFoods.filter(function (f) { return f.category_id === id; }).length;
            const el    = btn.querySelector('.mp-cat-count');
            if (el) el.textContent = count;
        });
    } catch (_) {}
}


/* ================================================================
   7. FILTER + SORT — Apply tất cả filter state, re-render
   ================================================================ */
function filterAndSort() {
    try {
        let foods = _s.allFoods.slice();

        // 7a. Category filter
        if (_s.activeCatId !== 'all') {
            const catId = parseInt(_s.activeCatId, 10);
            foods = foods.filter(function (f) { return f.category_id === catId; });
        }

        // 7b. Search filter
        if (_s.searchKeyword) {
            const kw = _s.searchKeyword.toLowerCase();
            foods = foods.filter(function (f) {
                return (f.name || '').toLowerCase().includes(kw) ||
                       (f.description || '').toLowerCase().includes(kw) ||
                       (f.category_name || '').toLowerCase().includes(kw);
            });
        }

        // 7c. Sort
        switch (_s.sortMode) {
            case 'price-asc':
                foods.sort(function (a, b) { return Number(a.price) - Number(b.price); });
                break;
            case 'price-desc':
                foods.sort(function (a, b) { return Number(b.price) - Number(a.price); });
                break;
            case 'featured':
                foods.sort(function (a, b) { return (b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0); });
                break;
            case 'name':
                foods.sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'vi'); });
                break;
            default:
                // featured first, then rest
                foods.sort(function (a, b) { return (b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0); });
        }

        _s.filteredFoods  = foods;
        _s.displayedCount = 0;

        // Update result header
        _updateResultHeader();

        // Render first page
        _renderFoodGrid(foods.slice(0, PAGE_SIZE));
        _s.displayedCount = Math.min(PAGE_SIZE, foods.length);

        // Load more button
        _updateLoadMore();

    } catch (err) {
        console.warn('[Menu] filterAndSort:', err.message);
    }
}

function _triggerSearch(keyword) {
    _s.searchKeyword = keyword;
    _s.activeCatId   = 'all';

    // Clear active cat
    try {
        document.querySelectorAll('.mp-cat-btn').forEach(function (b) { b.classList.remove('active'); });
        const allBtn = document.querySelector('.mp-cat-btn[data-cat="all"]');
        if (allBtn) allBtn.classList.add('active');
    } catch (_) {}

    filterAndSort();
}

function _updateResultHeader() {
    try {
        const total = _s.filteredFoods.length;
        const titleEl = document.getElementById('mpResultTitle');
        const countEl = document.getElementById('mpResultCount');

        if (_s.searchKeyword) {
            if (titleEl) titleEl.textContent = `Kết quả cho "${_s.searchKeyword}"`;
            if (countEl) countEl.textContent = `${total} món tìm thấy`;
        } else if (_s.activeCatId !== 'all') {
            const cat = _s.categories.find(function (c) { return String(c.id) === String(_s.activeCatId); });
            if (titleEl) titleEl.textContent = cat ? cat.name : 'Danh mục';
            if (countEl) countEl.textContent = `${total} món`;
        } else {
            if (titleEl) titleEl.textContent = 'Tất cả món ăn';
            if (countEl) countEl.textContent = `${total} món`;
        }
    } catch (_) {}
}


/* ================================================================
   8. RENDER FOOD GRID
   ================================================================ */
function _renderFoodGrid(foods) {
    try {
        const grid = document.getElementById('mpFoodGrid');
        if (!grid) return;

        if (!foods || foods.length === 0) {
            grid.innerHTML = `
                <div class="mp-empty">
                    <div class="mp-empty-icon"><i class="fas fa-bowl-food"></i></div>
                    <p class="mp-empty-title">Không tìm thấy món nào</p>
                    <p class="mp-empty-sub">Thử tìm kiếm khác hoặc chọn danh mục khác</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = foods.map(function (food) {
            return _foodCardHTML(food);
        }).join('');

        // Bind card events
        _bindFoodCardEvents(grid);

    } catch (err) {
        console.warn('[Menu] _renderFoodGrid:', err.message);
    }
}

function _foodCardHTML(food) {
    const id       = food.id;
    const name     = _esc(food.name || 'Món ăn');
    const desc     = _esc(food.description || '');
    const price    = Number(food.price || 0);
    const imgSrc   = food.image_url || '';
    const catName  = _esc(food.category_name || '');
    const isFeat   = food.is_featured;

    // Cart qty
    const cartItem = _s.cart.find(function (c) { return c.foodId === id; });
    const inCart   = !!cartItem;
    const qty      = cartItem ? cartItem.quantity : 0;

    // Image
    const imgHTML = imgSrc
        ? `<img class="mp-food-img" src="${imgSrc}" alt="${name}" loading="lazy"
               onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
        : '';
    const placeholderDisplay = imgSrc ? 'display:none' : '';
    const placeholderHTML = `
        <div class="mp-food-img-placeholder" style="${placeholderDisplay}">
            ${_getCatEmoji(food.category_name || food.name || '')}
        </div>
    `;

    return `
        <article class="mp-food-card" data-food-id="${id}" tabindex="0" role="button" aria-label="Xem chi tiết ${name}">
            <div class="mp-food-img-wrap">
                ${imgHTML}
                ${placeholderHTML}
                <div class="mp-food-img-overlay"></div>
                ${isFeat ? '<span class="mp-badge featured"><i class="fas fa-fire-flame-curved"></i> Nổi bật</span>' : ''}
                <button class="mp-food-wish" data-id="${id}" aria-label="Yêu thích ${name}">
                    <i class="fas fa-heart"></i>
                </button>
                ${qty > 0 ? `<span class="mp-food-qty-badge show">${qty}</span>` : '<span class="mp-food-qty-badge"></span>'}
            </div>
            <div class="mp-food-body">
                ${catName ? `<p class="mp-food-cat">${catName}</p>` : ''}
                <h3 class="mp-food-name">${name}</h3>
                ${desc ? `<p class="mp-food-desc">${desc}</p>` : ''}
                <div class="mp-food-footer">
                    <span class="mp-food-price">${_fmtPrice(price)}</span>
                    <button
                        class="mp-food-add ${inCart ? 'in-cart' : ''}"
                        data-food-id="${id}"
                        aria-label="Thêm ${name} vào giỏ"
                        title="${inCart ? 'Thêm thêm' : 'Thêm vào giỏ'}"
                    >
                        <i class="fas ${inCart ? 'fa-check' : 'fa-plus'}"></i>
                    </button>
                </div>
            </div>
        </article>
    `;
}

function _bindFoodCardEvents(grid) {
    try {
        // Card click → open modal
        grid.querySelectorAll('.mp-food-card').forEach(function (card) {
            card.addEventListener('click', function (e) {
                // Chỉ open modal nếu không click vào btn/wish
                if (e.target.closest('.mp-food-add') || e.target.closest('.mp-food-wish')) return;
                const foodId = parseInt(this.getAttribute('data-food-id'), 10);
                const food   = _s.allFoods.find(function (f) { return f.id === foodId; });
                if (food) openFoodModal(food);
            });

            // Keyboard a11y
            card.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const foodId = parseInt(this.getAttribute('data-food-id'), 10);
                    const food   = _s.allFoods.find(function (f) { return f.id === foodId; });
                    if (food) openFoodModal(food);
                }
            });
        });

        // Add btn click
        grid.querySelectorAll('.mp-food-add').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                const foodId = parseInt(this.getAttribute('data-food-id'), 10);
                const food   = _s.allFoods.find(function (f) { return f.id === foodId; });
                if (food) {
                    addToCart(food, 1);
                    // Visual feedback
                    _btnAddFeedback(this);
                }
            });
        });

        // Wish btn
        grid.querySelectorAll('.mp-food-wish').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                this.classList.toggle('active');
            });
        });

    } catch (err) {
        console.warn('[Menu] _bindFoodCardEvents:', err.message);
    }
}

function _btnAddFeedback(btn) {
    try {
        const orig = btn.innerHTML;
        btn.classList.add('in-cart');
        btn.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(function () {
            try {
                // Sync lại state từ cart
                const foodId = parseInt(btn.getAttribute('data-food-id'), 10);
                const exists = _s.cart.find(function (c) { return c.foodId === foodId; });
                btn.innerHTML = `<i class="fas ${exists ? 'fa-check' : 'fa-plus'}"></i>`;
            } catch (_) {}
        }, 800);
    } catch (_) {}
}

function _renderFoodError() {
    try {
        const grid = document.getElementById('mpFoodGrid');
        if (grid) {
            grid.innerHTML = `
                <div class="mp-empty">
                    <div class="mp-empty-icon"><i class="fas fa-triangle-exclamation"></i></div>
                    <p class="mp-empty-title">Không thể tải thực đơn</p>
                    <p class="mp-empty-sub">Vui lòng tải lại trang</p>
                </div>
            `;
        }
    } catch (_) {}
}


/* ================================================================
   9. LOAD MORE (phân trang cục bộ)
   ================================================================ */
function _loadMoreItems() {
    try {
        const start   = _s.displayedCount;
        const newBatch = _s.filteredFoods.slice(start, start + PAGE_SIZE);
        if (!newBatch.length) return;

        const grid = document.getElementById('mpFoodGrid');
        if (!grid) return;

        // Tạo wrapper tạm để render rồi append
        const frag = document.createDocumentFragment();
        const tmpDiv = document.createElement('div');
        tmpDiv.innerHTML = newBatch.map(_foodCardHTML).join('');
        while (tmpDiv.firstChild) frag.appendChild(tmpDiv.firstChild);

        grid.appendChild(frag);
        _bindFoodCardEvents(grid);

        _s.displayedCount += newBatch.length;
        _updateLoadMore();

    } catch (err) {
        console.warn('[Menu] _loadMoreItems:', err.message);
    }
}

function _updateLoadMore() {
    try {
        const wrap = document.getElementById('mpLoadMoreWrap');
        const btn  = document.getElementById('mpLoadMoreBtn');
        if (!wrap) return;

        const remaining = _s.filteredFoods.length - _s.displayedCount;
        if (remaining > 0) {
            wrap.style.display = 'block';
            if (btn) btn.innerHTML = `<i class="fas fa-chevron-down"></i> Xem thêm ${remaining} món`;
        } else {
            wrap.style.display = 'none';
        }
    } catch (_) {}
}


/* ================================================================
   10. FOOD MODAL
   ================================================================ */
function openFoodModal(food) {
    try {
        _s.modalFood = food;
        _s.modalQty  = 1;

        // Image
        const imgWrap = document.getElementById('mpModalImgWrap');
        if (imgWrap) {
            if (food.image_url) {
                imgWrap.innerHTML = `
                    <img class="mp-modal-img" src="${food.image_url}" alt="${_esc(food.name)}"
                        onerror="this.parentElement.innerHTML='<div class=mp-modal-img-placeholder style=height:120px>${_getCatEmoji(food.category_name || '')}</div>'">
                `;
            } else {
                imgWrap.innerHTML = `
                    <div class="mp-modal-img-placeholder">${_getCatEmoji(food.category_name || food.name || '')}</div>
                `;
            }
        }

        // Text
        _setText('mpModalCat',   food.category_name || '');
        _setText('mpModalName',  food.name || '');
        _setText('mpModalDesc',  food.description || 'Món ăn đặc biệt của nhà hàng.');
        _setText('mpModalPrice', _fmtPrice(food.price));

        // Qty
        _updateModalQty();

        // Show overlay
        const overlay = document.getElementById('mpModalOverlay');
        if (overlay) {
            overlay.classList.add('show');
            document.body.style.overflow = 'hidden';
        }

    } catch (err) {
        console.warn('[Menu] openFoodModal:', err.message);
    }
}

function closeModal() {
    try {
        const overlay = document.getElementById('mpModalOverlay');
        if (overlay) overlay.classList.remove('show');
        document.body.style.overflow = '';
        _s.modalFood = null;
        _s.modalQty  = 1;
    } catch (_) {}
}

function _updateModalQty() {
    try {
        const el = document.getElementById('mpModalQty');
        if (el) el.textContent = _s.modalQty;

        // Disable minus nếu qty = 1
        const minusBtn = document.getElementById('mpModalMinus');
        if (minusBtn) minusBtn.disabled = _s.modalQty <= 1;

        // Update add btn text
        const addBtn = document.getElementById('mpModalAddBtn');
        const price  = _s.modalFood ? Number(_s.modalFood.price) : 0;
        if (addBtn) {
            addBtn.innerHTML = `
                <i class="fas fa-cart-plus"></i>
                Thêm ${_s.modalQty} — ${_fmtPrice(price * _s.modalQty)}
            `;
        }
    } catch (_) {}
}


/* ================================================================
   11. CART CRUD
   ================================================================ */
function addToCart(food, qty) {
    try {
        qty = Math.max(1, parseInt(qty, 10) || 1);

        const existing = _s.cart.find(function (c) { return c.foodId === food.id; });
        if (existing) {
            existing.quantity += qty;
        } else {
            _s.cart.push({
                foodId:    food.id,
                foodName:  food.name,
                price:     Number(food.price),
                quantity:  qty,
                imageUrl:  food.image_url || '',
            });
        }

        _saveCartToStorage();
        renderCart();
        _syncFoodCardUI(food.id);

        // Dispatch event cho layout.js cart dot
        window.dispatchEvent(new CustomEvent('cartUpdated'));

    } catch (err) {
        console.warn('[Menu] addToCart:', err.message);
    }
}

function updateQty(foodId, delta) {
    try {
        const item = _s.cart.find(function (c) { return c.foodId === foodId; });
        if (!item) return;

        item.quantity += delta;
        if (item.quantity <= 0) {
            _removeItemById(foodId);
            return;
        }

        _saveCartToStorage();
        renderCart();
        _syncFoodCardUI(foodId);
        window.dispatchEvent(new CustomEvent('cartUpdated'));

    } catch (err) {
        console.warn('[Menu] updateQty:', err.message);
    }
}

function _removeItemById(foodId) {
    try {
        _s.cart = _s.cart.filter(function (c) { return c.foodId !== foodId; });
        _saveCartToStorage();
        renderCart();
        _syncFoodCardUI(foodId);
        window.dispatchEvent(new CustomEvent('cartUpdated'));

        // Reset coupon nếu cart empty
        if (_s.cart.length === 0) _resetCoupon();

    } catch (err) {
        console.warn('[Menu] _removeItemById:', err.message);
    }
}

function _clearCart() {
    try {
        if (_s.cart.length === 0) return;
        if (!confirm('Xoá toàn bộ giỏ hàng?')) return;

        _s.cart = [];
        _saveCartToStorage();
        renderCart();
        _resetCoupon();

        // Sync all food card UI
        document.querySelectorAll('.mp-food-add').forEach(function (btn) {
            btn.classList.remove('in-cart');
            btn.innerHTML = '<i class="fas fa-plus"></i>';
        });
        document.querySelectorAll('.mp-food-qty-badge').forEach(function (badge) {
            badge.classList.remove('show');
            badge.textContent = '';
        });

        window.dispatchEvent(new CustomEvent('cartUpdated'));
        showToast('Đã xoá giỏ hàng', 'info');

    } catch (err) {
        console.warn('[Menu] _clearCart:', err.message);
    }
}

function _loadCartFromStorage() {
    try {
        const raw = localStorage.getItem(CART_KEY);
        if (!raw) { _s.cart = []; return; }
        const parsed = JSON.parse(raw);
        _s.cart = Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        _s.cart = [];
    }
}

function _saveCartToStorage() {
    try {
        localStorage.setItem(CART_KEY, JSON.stringify(_s.cart));
    } catch (_) {}
}

/* Sync food card badge + add btn state sau thay đổi */
function _syncFoodCardUI(foodId) {
    try {
        const cards = document.querySelectorAll(`.mp-food-card[data-food-id="${foodId}"]`);
        const item  = _s.cart.find(function (c) { return c.foodId === foodId; });
        const qty   = item ? item.quantity : 0;
        const inCart = qty > 0;

        cards.forEach(function (card) {
            const addBtn  = card.querySelector('.mp-food-add');
            const badge   = card.querySelector('.mp-food-qty-badge');

            if (addBtn) {
                addBtn.classList.toggle('in-cart', inCart);
                addBtn.innerHTML = `<i class="fas ${inCart ? 'fa-check' : 'fa-plus'}"></i>`;
            }
            if (badge) {
                badge.classList.toggle('show', inCart);
                badge.textContent = inCart ? qty : '';
            }
        });
    } catch (_) {}
}


/* ================================================================
   12. RENDER CART
   ================================================================ */
function renderCart() {
    try {
        const itemsEl      = document.getElementById('mpCartItems');
        const countEl      = document.getElementById('mpCartCount');
        const topBadgeEl   = document.getElementById('cartCountBadge');
        const checkoutBtn  = document.getElementById('mpCheckoutBtn');
        const reqBtn       = document.getElementById('mpReqCheckoutBtn');

        const totalItems   = _s.cart.reduce(function (s, c) { return s + c.quantity; }, 0);
        const subtotal     = _calcSubtotal();
        const total        = Math.max(0, subtotal - _s.discountAmount);

        // Count badges
        if (countEl)    countEl.textContent  = totalItems;
        if (topBadgeEl) {
            topBadgeEl.textContent = totalItems > 9 ? '9+' : totalItems;
            topBadgeEl.style.display = totalItems > 0 ? 'flex' : 'none';
        }

        // Cart items
        if (itemsEl) {
            if (_s.cart.length === 0) {
                itemsEl.innerHTML = `
                    <div class="mp-cart-empty">
                        <div class="mp-cart-empty-emoji">🛒</div>
                        <p class="mp-cart-empty-title">Giỏ hàng trống</p>
                        <p class="mp-cart-empty-sub">Thêm món yêu thích vào giỏ để đặt</p>
                    </div>
                `;
            } else {
                itemsEl.innerHTML = _s.cart.map(function (item) {
                    return _cartItemHTML(item);
                }).join('');
                _bindCartItemEvents(itemsEl);
            }
        }

        // Summary
        _setText('mpSumSubtotal', _fmtPrice(subtotal));
        _setText('mpSumTotal',    _fmtPrice(total));

        const discRow = document.getElementById('mpSumDiscountRow');
        if (discRow) {
            discRow.style.display = _s.discountAmount > 0 ? 'flex' : 'none';
            _setText('mpSumDiscount', '−' + _fmtPrice(_s.discountAmount));
        }

        // Checkout button
        if (checkoutBtn) {
            checkoutBtn.disabled = _s.cart.length === 0;
        }

        // Request checkout button — chỉ hiện khi guest và có items
        if (reqBtn) {
            reqBtn.style.display = (_s.isGuest && _s.cart.length > 0) ? 'flex' : 'none';
        }

    } catch (err) {
        console.warn('[Menu] renderCart:', err.message);
    }
}

function _cartItemHTML(item) {
    const name = _esc(item.foodName || 'Món ăn');
    const emoji = _getCatEmoji(name);

    return `
        <div class="mp-cart-item" data-food-id="${item.foodId}">
            ${item.imageUrl
                ? `<img class="mp-ci-img" src="${item.imageUrl}" alt="${name}"
                      onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
                : ''
            }
            <div class="mp-ci-img-placeholder" style="${item.imageUrl ? 'display:none' : ''}">${emoji}</div>
            <div class="mp-ci-info">
                <p class="mp-ci-name">${name}</p>
                <p class="mp-ci-price">${_fmtPrice(item.price)}</p>
            </div>
            <div class="mp-ci-stepper">
                <button class="mp-ci-step-btn mp-ci-minus" data-id="${item.foodId}" aria-label="Giảm">
                    <i class="fas fa-minus"></i>
                </button>
                <span class="mp-ci-qty">${item.quantity}</span>
                <button class="mp-ci-step-btn mp-ci-plus" data-id="${item.foodId}" aria-label="Tăng">
                    <i class="fas fa-plus"></i>
                </button>
            </div>
        </div>
    `;
}

function _bindCartItemEvents(container) {
    try {
        container.querySelectorAll('.mp-ci-minus').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const id = parseInt(this.getAttribute('data-id'), 10);
                updateQty(id, -1);
            });
        });
        container.querySelectorAll('.mp-ci-plus').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const id = parseInt(this.getAttribute('data-id'), 10);
                updateQty(id, 1);
            });
        });
    } catch (_) {}
}

function _calcSubtotal() {
    return _s.cart.reduce(function (s, c) { return s + c.price * c.quantity; }, 0);
}


/* ================================================================
   13. APPLY COUPON — POST /api/user/public/promotions/check
   ================================================================ */
async function applyCoupon() {
    try {
        const inp  = document.getElementById('mpCouponInp');
        const code = (inp ? inp.value : '').trim().toUpperCase();

        if (!code) {
            _showCouponStatus('Vui lòng nhập mã giảm giá', 'err');
            return;
        }

        const subtotal = _calcSubtotal();
        if (subtotal <= 0) {
            _showCouponStatus('Giỏ hàng trống, không thể áp dụng mã', 'err');
            return;
        }

        // Loading state
        const btn = document.getElementById('mpCouponBtn');
        if (btn) { btn.textContent = '...'; btn.disabled = true; }

        const res = await fetch('/api/user/public/promotions/check', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ code, subtotal }),
        });

        const data = await res.json().catch(function () { return {}; });

        if (res.ok && data.promo_id) {
            _s.promoId        = data.promo_id;
            _s.discountAmount = Number(data.discount_amount) || 0;
            _showCouponStatus(`Áp dụng thành công! Giảm ${_fmtPrice(_s.discountAmount)}`, 'ok');
            renderCart();
            showToast('Mã giảm giá đã được áp dụng! 🎉', 'success');
        } else {
            _s.promoId        = null;
            _s.discountAmount = 0;
            _showCouponStatus(data.message || 'Mã không hợp lệ hoặc đã hết hạn', 'err');
            renderCart();
        }

    } catch (err) {
        console.warn('[Menu] applyCoupon:', err.message);
        _showCouponStatus('Không thể kết nối máy chủ', 'err');
    } finally {
        const btn = document.getElementById('mpCouponBtn');
        if (btn) { btn.textContent = 'Áp dụng'; btn.disabled = false; }
    }
}

function _showCouponStatus(msg, type) {
    try {
        const statusEl = document.getElementById('mpCouponStatus');
        const msgEl    = document.getElementById('mpCouponStatusMsg');
        if (!statusEl) return;

        statusEl.className = `mp-coupon-status show ${type}`;
        statusEl.querySelector('i').className = type === 'ok'
            ? 'fas fa-circle-check'
            : 'fas fa-circle-xmark';
        if (msgEl) msgEl.textContent = msg;
    } catch (_) {}
}

function _resetCoupon() {
    try {
        _s.promoId        = null;
        _s.discountAmount = 0;
        const inp      = document.getElementById('mpCouponInp');
        const statusEl = document.getElementById('mpCouponStatus');
        if (inp)      inp.value = '';
        if (statusEl) statusEl.classList.remove('show');
    } catch (_) {}
}


/* ================================================================
   14. SUBMIT ORDER — POST /api/user/order/create
       Header: Authorization: Bearer <token>
       Body: { items: [{foodId, priceAtOrder, quantity, itemName}], promo_id? }
       tableId được lấy từ decoded token server-side
   ================================================================ */
/* ================================================================
   14. OPEN CONFIRM MODAL — Hiện modal xác nhận trước khi gửi đơn
   ================================================================ */
function submitOrder() {
    if (_s.cart.length === 0) {
        showToast('Giỏ hàng trống!', 'warning');
        return;
    }
    if (!_s.token) {
        showToast('Phiên đăng nhập hết hạn. Vui lòng chọn lại bàn.', 'error');
        setTimeout(function () { window.location.href = '/views/user/table-select.html'; }, 1500);
        return;
    }

    // Điền thông tin vào modal confirm
    try {
        // Danh sách món
        const itemsEl = document.getElementById('mpConfirmItems');
        if (itemsEl) {
            itemsEl.innerHTML = _s.cart.map(function (c) {
                const price = new Intl.NumberFormat('vi-VN').format(c.price * c.quantity) + 'đ';
                return '<div class="mp-confirm-item">' +
                    '<div><div class="mp-confirm-item-name">' + _escHtml(c.foodName) + '</div>' +
                    '<div class="mp-confirm-item-qty">x' + c.quantity + '</div></div>' +
                    '<div class="mp-confirm-item-price">' + price + '</div></div>';
            }).join('');
        }

        // Tổng tiền
        const totalEl = document.getElementById('mpConfirmTotal');
        if (totalEl) {
            const sub  = _s.cart.reduce(function (s, c) { return s + c.price * c.quantity; }, 0);
            const disc = _s.discountAmount || 0;
            totalEl.textContent = new Intl.NumberFormat('vi-VN').format(sub - disc) + 'đ';
        }

        // Thông tin bàn
        const tableEl = document.getElementById('mpConfirmTableInfo');
        if (tableEl) {
            const tableName = _lsGet('tableName') || 'Bàn đang chọn';
            tableEl.innerHTML = '<i class="fas fa-chair"></i> ' + _escHtml(tableName);
        }
    } catch (_) {}

    // Hiện modal
    const overlay = document.getElementById('mpConfirmOverlay');
    if (overlay) overlay.classList.add('show');
}

/* ================================================================
   14b. _doSubmitOrder — Thực sự gửi đơn sau khi user xác nhận
   ================================================================ */
async function _doSubmitOrder() {
    const overlay  = document.getElementById('mpConfirmOverlay');
    const submitBtn = document.getElementById('mpConfirmSubmit');

    // Loading state
    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang gửi...'; }

    try {
        // Với khách hàng đã đăng nhập (authToken), bắt buộc phải biết tableId
        // để backend gán đơn hàng cho đúng bàn.
        const tableIdRaw = _lsGet('tableId');
        if (!_s.isGuest && !tableIdRaw) {
            showToast('Không xác định được bàn. Vui lòng chọn bàn trước khi đặt món.', 'error');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Xác nhận đặt món';
            }
            return;
        }

        const items = _s.cart.map(function (c) {
            return {
                foodId:       c.foodId,
                priceAtOrder: c.price,
                quantity:     c.quantity,
                itemName:     c.foodName,
            };
        });

        const body = { items };
        if (_s.promoId) body.promo_id = _s.promoId;

        // Nếu là customer (authToken) thì gửi kèm table_id để server sử dụng
        if (!_s.isGuest && tableIdRaw) {
            body.table_id = Number(tableIdRaw);
        }

        const res = await fetch('/api/user/order/create', {
            method:  'POST',
            headers: {
                'Content-Type':  'application/json',
                'Authorization': 'Bearer ' + _s.token,
            },
            body: JSON.stringify(body),
        });

        const data = await res.json().catch(function () { return {}; });

        if (res.status === 201 && data.order_id) {
            // Đóng confirm modal
            if (overlay) overlay.classList.remove('show');

            // Xoá cart
            _s.cart = [];
            _saveCartToStorage();
            window.dispatchEvent(new CustomEvent('cartUpdated'));
            try { localStorage.setItem('lastOrderId', String(data.order_id)); } catch (_) {}

            // Hiện redirect overlay
            const redirectEl = document.getElementById('mpRedirectOverlay');
            if (redirectEl) redirectEl.classList.add('show');

            setTimeout(function () {
                window.location.href = '/views/user/history.html';
            }, 2000);

        } else if (res.status === 401 || res.status === 403) {
            if (overlay) overlay.classList.remove('show');
            showToast('Phiên hết hạn. Đang chuyển hướng...', 'error');
            setTimeout(function () { window.location.href = '/views/user/table-select.html'; }, 1800);
        } else {
            const msg = data.message || 'Đặt món thất bại. Vui lòng thử lại.';
            showToast(msg, 'error');
        }

    } catch (err) {
        console.warn('[Menu] _doSubmitOrder:', err.message);
        showToast('Không thể kết nối máy chủ. Vui lòng thử lại.', 'error');
    } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Xác nhận đặt món'; }
    }
}


/* ================================================================
   15. REQUEST CHECKOUT — PUT /api/user/order/request-checkout
       Chỉ cần guestToken (verifyGuestToken middleware)
   ================================================================ */
async function requestCheckout() {
    try {
        if (!_s.isGuest || !_s.token) {
            showToast('Chức năng này dành cho khách tại bàn.', 'info');
            return;
        }

        const btn = document.getElementById('mpReqCheckoutBtn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang gửi...'; }

        const res = await fetch('/api/user/order/request-checkout', {
            method:  'PUT',
            headers: {
                'Content-Type':  'application/json',
                'Authorization': 'Bearer ' + _s.token,
            },
        });

        const data = await res.json().catch(function () { return {}; });

        if (res.ok) {
            showToast(data.message || 'Đã gọi thanh toán! Nhân viên sẽ đến ngay.', 'success');
            if (btn) btn.innerHTML = '<i class="fas fa-circle-check"></i> Đã gửi yêu cầu';
        } else {
            showToast(data.message || 'Gửi yêu cầu thất bại.', 'error');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-credit-card"></i> Gọi thanh toán';
            }
        }

    } catch (err) {
        console.warn('[Menu] requestCheckout:', err.message);
        showToast('Không thể kết nối máy chủ.', 'error');
        const btn = document.getElementById('mpReqCheckoutBtn');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-credit-card"></i> Gọi thanh toán';
        }
    }
}


/* ================================================================
   16. CANCEL TABLE — Hủy bàn, reset session về table-select
   ================================================================ */
function openCancelTableModal() {
    const overlay = document.getElementById('mpCancelOverlay');
    if (overlay) overlay.classList.add('show');
}

async function _doCancelTable() {
    const overlay    = document.getElementById('mpCancelOverlay');
    const confirmBtn = document.getElementById('mpCancelConfirm');

    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang hủy...'; }

    try {
        const token = _s.token || _lsGet('guestToken');

        const res = await fetch('/api/user/order/cancel-table', {
            method:  'DELETE',
            headers: {
                'Content-Type':  'application/json',
                'Authorization': 'Bearer ' + token,
            },
        });

        const data = await res.json().catch(function () { return {}; });

        if (res.ok) {
            // Xóa toàn bộ session guest
            try {
                localStorage.removeItem('guestToken');
                localStorage.removeItem('tableId');
                localStorage.removeItem('tableName');
                localStorage.removeItem('lastOrderId');
            } catch (_) {}

            // Xóa cart
            _s.cart = [];
            _saveCartToStorage();

            if (overlay) overlay.classList.remove('show');
            showToast('Đã hủy bàn. Đang chuyển hướng...', 'success');

            setTimeout(function () {
                window.location.href = '/views/user/table-select.html';
            }, 1200);

        } else if (res.status === 409) {
            // Đang có đơn hàng đang xử lý
            if (overlay) overlay.classList.remove('show');
            showToast(data.message || 'Bàn đang có đơn đang xử lý, không thể hủy.', 'error');
        } else {
            showToast(data.message || 'Lỗi hủy bàn. Vui lòng thử lại.', 'error');
        }

    } catch (err) {
        console.warn('[Menu] cancelTable:', err.message);
        showToast('Không thể kết nối máy chủ.', 'error');
    } finally {
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.innerHTML = '<i class="fas fa-door-open"></i> Xác nhận hủy'; }
    }
}


/* ================================================================
   17. TOAST
   ================================================================ */
function showToast(msg, type) {
    try {
        const container = document.getElementById('mpToastContainer');
        if (!container) return;

        const iconMap = {
            success: 'fa-circle-check',
            error:   'fa-circle-xmark',
            warning: 'fa-triangle-exclamation',
            info:    'fa-circle-info',
        };
        const icon = iconMap[type] || 'fa-circle-info';

        const toast = document.createElement('div');
        toast.className = `mp-toast ${type || 'info'}`;
        toast.innerHTML = `
            <i class="fas ${icon}"></i>
            <span style="flex:1;line-height:1.45">${msg}</span>
        `;

        container.appendChild(toast);

        // Auto remove
        setTimeout(function () {
            try {
                toast.style.opacity    = '0';
                toast.style.transform  = 'translateX(14px)';
                toast.style.transition = 'all .25s ease';
                setTimeout(function () { try { toast.remove(); } catch (_) {} }, 260);
            } catch (_) {}
        }, 3000);

    } catch (_) {}
}


/* ================================================================
   17. UTILITIES
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

function _setText(id, text) {
    try {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    } catch (_) {}
}

// Alias used in confirm modal
var _escHtml = _esc;

function _lsGet(key) {
    try { return localStorage.getItem(key) || null; }
    catch (_) { return null; }
}

function _getCatEmoji(name) {
    const n = (name || '').toLowerCase();
    for (const key in CAT_EMOJI_MAP) {
        if (n.includes(key)) return CAT_EMOJI_MAP[key];
    }
    return '🍽️';
}


/* ================================================================
   18. EXPOSE PUBLIC API (debug + HTML onclick fallback)
   ================================================================ */
window.MenuPage = {
    addToCart:       addToCart,
    updateQty:       updateQty,
    openFoodModal:   openFoodModal,
    closeModal:      closeModal,
    applyCoupon:     applyCoupon,
    submitOrder:     submitOrder,
    requestCheckout: requestCheckout,
    showToast:       showToast,
    filterAndSort:   filterAndSort,
};