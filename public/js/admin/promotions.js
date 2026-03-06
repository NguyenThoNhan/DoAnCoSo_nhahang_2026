/**
 * promotions.js — Admin Promotions / Coupon Management
 * ══════════════════════════════════════════════════════════
 * ROUTES (admin.routes.js — confirmed, GET + POST only):
 *   GET  /api/admin/promotions → [{id, code, type, value, min_order_amount,
 *                                   start_date, end_date, created_at}]
 *   POST /api/admin/promotions → 201 {message} | 400 missing fields | 409 duplicate code
 *
 * type values: 'percent' | 'fixed'
 *
 * Date format sent to MySQL: YYYY-MM-DD  (input[type=date] gives this natively)
 *
 * RULES:
 *   ✓ headers: getAuthHeaders() on every fetch  (via GoMeal.getAuthHeader())
 *   ✓ No recursive showToast calls
 *   ✓ All event listeners registered once inside DOMContentLoaded
 *   ✓ window.copyCode exposed for inline onclick
 * ══════════════════════════════════════════════════════════
 */

'use strict';

/* ─── Constants ─── */
const PROMO_API = '/api/admin/promotions';
const DEBOUNCE  = 250;

/* ─── State ─── */
let _promos       = [];
let _filtered     = [];
let _statusFilter = 'all';   // 'all' | 'active' | 'coming' | 'expired'
let _typeFilter   = 'all';   // 'all' | 'percent' | 'fixed'
let _search       = '';
let _searchTimer  = null;

/* ══════════════════════════════════════════
   DATE / STATUS HELPERS
══════════════════════════════════════════ */

/** Returns today as YYYY-MM-DD string (local timezone) */
function todayStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
}

/** Normalise any date value to YYYY-MM-DD string */
function toDateStr(v) {
    if (!v) return '';
    // MySQL DATETIME looks like "2024-06-01T00:00:00.000Z" or "2024-06-01 00:00:00"
    return String(v).slice(0, 10);
}

/**
 * promoStatus: compares start_date / end_date (YYYY-MM-DD) against today
 * @returns {'active'|'coming'|'expired'}
 */
function promoStatus(promo) {
    const today = todayStr();
    const start = toDateStr(promo.start_date);
    const end   = toDateStr(promo.end_date);
    if (end < today)   return 'expired';
    if (start > today) return 'coming';
    return 'active';
}

const STATUS_LABEL = { active: 'Đang hoạt động', coming: 'Sắp diễn ra', expired: 'Đã hết hạn' };
const STATUS_BADGE = { active: 'psb-active', coming: 'psb-coming', expired: 'psb-expired' };
const STATUS_ICON  = { active: 'fa-circle-check', coming: 'fa-clock', expired: 'fa-ban' };
const CARD_CLASS   = { active: 'card-active', coming: 'card-coming', expired: 'card-expired' };
const STRIPE_CLASS = { active: 'stripe-active', coming: 'stripe-coming', expired: 'stripe-expired' };

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

function fmtCurrency(v) {
    const n = Number(v) || 0;
    return n.toLocaleString('vi-VN');
}

function fmtDate(v) {
    const s = toDateStr(v);
    if (!s) return '--';
    const [y, m, d] = s.split('-');
    return d + '/' + m + '/' + y;
}

/* ══════════════════════════════════════════
   TOAST  (no self-recursion, registered once)
══════════════════════════════════════════ */
function showToast(msg, type) {
    type = type || 'success';
    const cfg = {
        success: { ico: 'circle-check',         col: '#10B981' },
        error:   { ico: 'triangle-exclamation', col: '#EF4444' },
        warning: { ico: 'triangle-exclamation', col: '#F59E0B' },
        info:    { ico: 'circle-info',           col: '#3B82F6' },
    };
    var c = cfg[type] || cfg.info;

    if (!document.getElementById('_pm_kf')) {
        var s = document.createElement('style');
        s.id = '_pm_kf';
        s.textContent = '@keyframes _t{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:translateX(0)}}';
        document.head.appendChild(s);
    }

    var el = document.createElement('div');
    el.style.cssText = [
        'display:flex;align-items:center;gap:10px',
        'padding:12px 18px;border-radius:12px',
        'background:#fff',
        'box-shadow:0 8px 28px rgba(0,0,0,.13)',
        'border-left:4px solid ' + c.col,
        'font-family:var(--font-primary);font-size:14px',
        'color:var(--color-gray-800);max-width:380px',
        'pointer-events:all;animation:_t .3s ease',
    ].join(';');
    el.innerHTML =
        '<i class="fas fa-' + esc(c.ico) + '" style="color:' + c.col + ';font-size:1rem;flex-shrink:0"></i>' +
        '<span style="flex:1;line-height:1.45">' + esc(msg) + '</span>' +
        '<button onclick="this.parentElement.remove()" ' +
        'style="background:none;border:none;cursor:pointer;color:var(--color-gray-400);font-size:.8rem;padding:0">' +
        '<i class="fas fa-xmark"></i></button>';

    var container = document.getElementById('toastContainer');
    if (container) container.appendChild(el);
    setTimeout(function() { if (el.parentElement) el.remove(); }, 5000);
}

/* ══════════════════════════════════════════
   API FETCH  — GoMeal.getAuthHeader()
══════════════════════════════════════════ */
async function apiFetch(url, opts) {
    opts = opts || {};
    var headers = Object.assign(
        { 'Content-Type': 'application/json' },
        GoMeal.getAuthHeader(),
        opts.headers || {}
    );
    var res  = await fetch(url, Object.assign({}, opts, { headers: headers }));
    var data = await res.json().catch(function() { return {}; });
    if (!res.ok) {
        var err = new Error(data.message || 'HTTP ' + res.status);
        err.status = res.status;
        err.data   = data;
        throw err;
    }
    return data;
}

/* ══════════════════════════════════════════
   loadPromotions
══════════════════════════════════════════ */
async function loadPromotions(silent) {
    if (!silent) renderSkeleton();
    try {
        _promos = await apiFetch(PROMO_API) || [];
        updateSummary();
        applyFilter();
    } catch (err) {
        console.error('[Promotions] load:', err);
        renderEmpty('Lỗi tải dữ liệu', 'Vui lòng thử lại.');
        if (!silent) showToast('Không tải được danh sách khuyến mãi: ' + err.message, 'error');
    } finally {
        var r1 = document.querySelector('#btnRefresh i');
        var r2 = document.querySelector('#btnRefresh2 i');
        if (r1) r1.classList.remove('fa-spin');
        if (r2) r2.classList.remove('fa-spin');
    }
}

/* ══════════════════════════════════════════
   SUMMARY COUNTS
══════════════════════════════════════════ */
function updateSummary() {
    var c = { all: _promos.length, active: 0, coming: 0, expired: 0, percent: 0, fixed: 0 };
    _promos.forEach(function(p) {
        var s = promoStatus(p);
        c[s]++;
        if (p.type === 'percent') c.percent++;
        else if (p.type === 'fixed') c.fixed++;
    });
    setText('fsAllN',     c.all);
    setText('fsActiveN',  c.active);
    setText('fsComingN',  c.coming);
    setText('fsExpiredN', c.expired);
    setText('ftAllN',     c.all);
    setText('ftPctN',     c.percent);
    setText('ftFixedN',   c.fixed);
    setText('headCount',  c.all ? '(' + c.all + ')' : '');
}

/* ══════════════════════════════════════════
   FILTER
══════════════════════════════════════════ */
function applyFilter() {
    var q = _search.toLowerCase();
    _filtered = _promos.filter(function(p) {
        if (_statusFilter !== 'all' && promoStatus(p) !== _statusFilter) return false;
        if (_typeFilter   !== 'all' && p.type !== _typeFilter)           return false;
        if (q && !p.code.toLowerCase().includes(q))                      return false;
        return true;
    });
    setText('resultCount', _filtered.length);
    renderCards();
    syncSidebarActive();
}

function syncSidebarActive() {
    document.querySelectorAll('[data-sf]').forEach(function(row) {
        row.classList.toggle('f-on', row.dataset.sf === _statusFilter);
    });
    document.querySelectorAll('[data-tf]').forEach(function(row) {
        row.classList.toggle('f-on', row.dataset.tf === _typeFilter);
    });
}

/* ══════════════════════════════════════════
   renderCards — card grid (not plain table)
══════════════════════════════════════════ */
function renderCards() {
    var container = document.getElementById('promoCards');
    if (!container) return;

    if (!_filtered.length) {
        var isFiltered = _search || _statusFilter !== 'all' || _typeFilter !== 'all';
        renderEmpty(
            isFiltered ? 'Không tìm thấy mã giảm giá' : 'Chưa có mã giảm giá nào',
            isFiltered ? 'Thử thay đổi bộ lọc hoặc từ khoá.' : 'Nhấn "Tạo mã mới" để tạo mã giảm giá đầu tiên.'
        );
        return;
    }

    var html = '<div class="pm-cards">' +
        _filtered.map(function(p, idx) {
            var status     = promoStatus(p);
            var isExpired  = status === 'expired';
            var delay      = Math.min(idx * 30, 300);
            var isPct      = p.type === 'percent';
            var valueNum   = Number(p.value) || 0;
            var minAmt     = Number(p.min_order_amount) || 0;

            var valueDisplay = isPct
                ? '<span class="pm-value-num pm-value-pct">' + valueNum + '<span class="pm-value-unit">%</span></span>'
                : '<span class="pm-value-num pm-value-vnd">' + fmtCurrency(valueNum) + '<span class="pm-value-unit">₫</span></span>';

            var typeHtml = isPct
                ? '<span class="pm-type pt-percent"><i class="fas fa-percent" style="font-size:.6rem"></i> Phần trăm</span>'
                : '<span class="pm-type pt-fixed"><i class="fas fa-money-bill-wave" style="font-size:.6rem"></i> Số tiền cố định</span>';

            return '<div class="pm-card ' + esc(CARD_CLASS[status] || '') + '" style="animation-delay:' + delay + 'ms;position:relative">' +
                '<div class="pm-card-stripe ' + esc(STRIPE_CLASS[status] || '') + '"></div>' +
                (isExpired ? '<div class="pm-expired-label">HẾT HẠN</div>' : '') +
                '<div class="pm-card-body">' +
                    '<div class="pm-code-row">' +
                        '<div class="pm-code" title="Nhấn để sao chép" ' +
                             'onclick="copyCode(\'' + esc(p.code) + '\')" ' +
                             'style="cursor:pointer;user-select:none" title="Nhấn để sao chép mã">' +
                            p.code +
                        '</div>' +
                        '<span class="pm-status-badge ' + esc(STATUS_BADGE[status] || 'psb-expired') + '">' +
                            '<i class="fas ' + esc(STATUS_ICON[status] || 'fa-ban') + '" style="font-size:.65rem"></i>' +
                            STATUS_LABEL[status] +
                        '</span>' +
                    '</div>' +
                    '<div class="pm-value-area">' +
                        valueDisplay +
                        typeHtml +
                    '</div>' +
                    '<div class="pm-meta">' +
                        '<div class="pm-meta-row">' +
                            '<i class="fas fa-calendar-day"></i>' +
                            '<span>Từ <span class="pm-meta-val">' + fmtDate(p.start_date) + '</span></span>' +
                        '</div>' +
                        '<div class="pm-meta-row">' +
                            '<i class="fas fa-calendar-xmark"></i>' +
                            '<span>Đến <span class="pm-meta-val">' + fmtDate(p.end_date) + '</span></span>' +
                        '</div>' +
                        (minAmt > 0
                            ? '<div class="pm-meta-row"><i class="fas fa-cart-shopping"></i>' +
                              '<span>Đơn tối thiểu <span class="pm-meta-val">' + fmtCurrency(minAmt) + '₫</span></span></div>'
                            : '<div class="pm-meta-row"><i class="fas fa-infinity"></i>' +
                              '<span style="color:var(--color-gray-400)">Áp dụng mọi đơn hàng</span></div>'
                        ) +
                    '</div>' +
                '</div>' +
            '</div>';
        }).join('') +
    '</div>';

    container.innerHTML = html;
}

function renderSkeleton() {
    var container = document.getElementById('promoCards');
    if (!container) return;
    var skCards = Array(6).fill('').map(function() {
        return '<div class="pm-sk-card">' +
            '<div class="sk" style="height:4px;border-radius:0;margin:-var(--space-5)"></div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center">' +
                '<div class="sk" style="height:24px;width:120px"></div>' +
                '<div class="sk" style="height:22px;width:80px;border-radius:99px"></div>' +
            '</div>' +
            '<div class="sk" style="height:40px;width:90px"></div>' +
            '<div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">' +
                '<div class="sk" style="height:12px;width:100%"></div>' +
                '<div class="sk" style="height:12px;width:80%"></div>' +
                '<div class="sk" style="height:12px;width:60%"></div>' +
            '</div>' +
        '</div>';
    }).join('');
    container.innerHTML = '<div class="pm-cards">' + skCards + '</div>';
}

function renderEmpty(title, desc) {
    var container = document.getElementById('promoCards');
    if (!container) return;
    container.innerHTML =
        '<div class="pm-empty">' +
            '<div class="pm-empty-ico"><i class="fas fa-ticket-slash"></i></div>' +
            '<div class="pm-empty-t">' + esc(title) + '</div>' +
            '<div class="pm-empty-d">' + esc(desc)  + '</div>' +
        '</div>';
}

/* ══════════════════════════════════════════
   COPY CODE to clipboard
══════════════════════════════════════════ */
function copyCode(code) {
    if (!code) return;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(code).then(function() {
            showToast('Đã sao chép mã "' + code + '" vào clipboard!', 'success');
        }).catch(function() {
            showToast('Mã: ' + code, 'info');
        });
    } else {
        showToast('Mã: ' + code, 'info');
    }
}

/* ══════════════════════════════════════════
   FORM helpers
══════════════════════════════════════════ */
function resetForm() {
    ['mCode', 'mMinOrder', 'mValue', 'mStartDate', 'mEndDate'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) { el.value = ''; el.classList.remove('inp-err'); }
    });
    var mType = document.getElementById('mType');
    if (mType) mType.value = '';
    ['errCode', 'errType', 'errValue', 'errStartDate', 'errEndDate'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.classList.remove('show');
    });
    document.querySelectorAll('.pm-type-card').forEach(function(c) { c.classList.remove('tc-on'); });
    var unit = document.getElementById('valueUnit');
    if (unit) unit.textContent = '% / ₫';

    // Default start date = today
    var mStart = document.getElementById('mStartDate');
    if (mStart) mStart.value = todayStr();
}

function showFieldErr(errId, inpId, msg) {
    var err = document.getElementById(errId);
    var inp = inpId ? document.getElementById(inpId) : null;
    if (err) { err.textContent = msg; err.classList.add('show'); }
    if (inp) inp.classList.add('inp-err');
}

function clearFieldErr(errId, inpId) {
    var err = document.getElementById(errId);
    var inp = inpId ? document.getElementById(inpId) : null;
    if (err) err.classList.remove('show');
    if (inp) inp.classList.remove('inp-err');
}

function validateForm() {
    var ok = true;

    var code = (document.getElementById('mCode')?.value || '').trim();
    if (!code) {
        showFieldErr('errCode', 'mCode', 'Vui lòng nhập mã giảm giá.'); ok = false;
    } else clearFieldErr('errCode', 'mCode');

    var type = document.getElementById('mType')?.value || '';
    if (!type) {
        showFieldErr('errType', null, 'Vui lòng chọn loại giảm giá.'); ok = false;
    } else clearFieldErr('errType', null);

    var value = parseFloat(document.getElementById('mValue')?.value);
    if (!value || value <= 0) {
        showFieldErr('errValue', 'mValue', 'Vui lòng nhập giá trị giảm hợp lệ (> 0).'); ok = false;
    } else {
        if (type === 'percent' && value > 100) {
            showFieldErr('errValue', 'mValue', 'Giảm phần trăm tối đa 100%.'); ok = false;
        } else clearFieldErr('errValue', 'mValue');
    }

    var start = document.getElementById('mStartDate')?.value || '';
    if (!start) {
        showFieldErr('errStartDate', 'mStartDate', 'Vui lòng chọn ngày bắt đầu.'); ok = false;
    } else clearFieldErr('errStartDate', 'mStartDate');

    var end = document.getElementById('mEndDate')?.value || '';
    if (!end) {
        showFieldErr('errEndDate', 'mEndDate', 'Vui lòng chọn ngày kết thúc.'); ok = false;
    } else if (start && end < start) {
        showFieldErr('errEndDate', 'mEndDate', 'Ngày kết thúc phải sau ngày bắt đầu.'); ok = false;
    } else clearFieldErr('errEndDate', 'mEndDate');

    return ok;
}

/* ══════════════════════════════════════════
   submitPromotion
══════════════════════════════════════════ */
async function submitPromotion() {
    if (!validateForm()) return;

    // input[type=date] returns YYYY-MM-DD natively — exactly what MySQL needs
    var payload = {
        code:             (document.getElementById('mCode')?.value     || '').trim().toUpperCase(),
        type:              document.getElementById('mType')?.value     || '',
        value:            parseFloat(document.getElementById('mValue')?.value) || 0,
        min_order_amount: parseFloat(document.getElementById('mMinOrder')?.value) || 0,
        start_date:        document.getElementById('mStartDate')?.value || '',
        end_date:          document.getElementById('mEndDate')?.value   || '',
    };

    var btn = document.getElementById('btnPromoSubmit');
    setBtn(btn, true, '<i class="fas fa-spinner fa-spin"></i> Đang tạo...');

    try {
        await apiFetch(PROMO_API, { method: 'POST', body: JSON.stringify(payload) });
        showToast('Đã tạo mã giảm giá "' + payload.code + '" thành công!', 'success');
        closeModal('promoModal');
        await loadPromotions(true);
    } catch (err) {
        if (err.status === 409) {
            showFieldErr('errCode', 'mCode', 'Mã giảm giá này đã tồn tại.');
            document.getElementById('mCode')?.focus();
        } else if (err.status === 400) {
            showToast((err.data && err.data.message) || 'Dữ liệu không hợp lệ.', 'error');
        } else {
            showToast('Lỗi tạo mã: ' + err.message, 'error');
        }
    } finally {
        setBtn(btn, false, '<i class="fas fa-ticket"></i> Tạo mã giảm giá');
    }
}

/* ══════════════════════════════════════════
   MODAL HELPERS
══════════════════════════════════════════ */
function openModal(id) {
    var el = document.getElementById(id);
    if (el) requestAnimationFrame(function() { el.classList.add('active'); });
}

function closeModal(id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove('active');
}

function setBtn(btn, disabled, html) {
    if (!btn) return;
    btn.disabled = disabled;
    btn.innerHTML = html;
}

/* ══════════════════════════════════════════
   INIT — single DOMContentLoaded, no duplicate listeners
══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function() {

    // Initial load
    loadPromotions(false);

    // Refresh
    function doRefresh() {
        var i1 = document.querySelector('#btnRefresh i');
        var i2 = document.querySelector('#btnRefresh2 i');
        if (i1) i1.classList.add('fa-spin');
        if (i2) i2.classList.add('fa-spin');
        loadPromotions(false);
    }
    document.getElementById('btnRefresh')?.addEventListener('click', doRefresh);
    document.getElementById('btnRefresh2')?.addEventListener('click', doRefresh);

    // Open modal buttons
    function openAddModal() {
        resetForm();
        openModal('promoModal');
        setTimeout(function() { document.getElementById('mCode')?.focus(); }, 280);
    }
    document.getElementById('btnAddTop')?.addEventListener('click',  openAddModal);
    document.getElementById('btnAddSide')?.addEventListener('click', openAddModal);

    // Submit
    document.getElementById('btnPromoSubmit')?.addEventListener('click', submitPromotion);

    // Close modal
    document.getElementById('promoModalClose')?.addEventListener('click',  function() { closeModal('promoModal'); });
    document.getElementById('promoModalCancel')?.addEventListener('click', function() { closeModal('promoModal'); });
    document.getElementById('promoModal')?.addEventListener('click', function(e) {
        if (e.target.id === 'promoModal') closeModal('promoModal');
    });

    // Type picker cards
    document.getElementById('typePicker')?.addEventListener('click', function(e) {
        var card = e.target.closest('.pm-type-card');
        if (!card) return;
        document.querySelectorAll('.pm-type-card').forEach(function(c) { c.classList.remove('tc-on'); });
        card.classList.add('tc-on');
        var type = card.dataset.type;
        var mType = document.getElementById('mType');
        if (mType) mType.value = type;
        var unit = document.getElementById('valueUnit');
        if (unit) unit.textContent = type === 'percent' ? '%' : '₫';
        clearFieldErr('errType', null);
    });

    // Clear errors on input
    document.getElementById('mCode')?.addEventListener('input', function() {
        // Auto-uppercase preview
        this.value = this.value.toUpperCase();
        clearFieldErr('errCode', 'mCode');
    });
    document.getElementById('mValue')?.addEventListener('input', function() {
        clearFieldErr('errValue', 'mValue');
    });
    document.getElementById('mStartDate')?.addEventListener('change', function() {
        clearFieldErr('errStartDate', 'mStartDate');
        // Reset end date if it's before start date
        var endEl = document.getElementById('mEndDate');
        if (endEl && endEl.value && endEl.value < this.value) {
            endEl.value = '';
        }
        // Set min for end date
        if (endEl) endEl.min = this.value;
    });
    document.getElementById('mEndDate')?.addEventListener('change', function() {
        clearFieldErr('errEndDate', 'mEndDate');
    });

    // Sidebar status filter rows
    document.querySelectorAll('[data-sf]').forEach(function(row) {
        row.addEventListener('click', function() {
            _statusFilter = row.dataset.sf;
            applyFilter();
        });
    });

    // Sidebar type filter rows
    document.querySelectorAll('[data-tf]').forEach(function(row) {
        row.addEventListener('click', function() {
            _typeFilter = row.dataset.tf;
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
            var val = e.target.value;
            _searchTimer = setTimeout(function() { handleSearch(val); }, DEBOUNCE);
        });
    });

    // ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeModal('promoModal');
    });
});

/* ══════════════════════════════════════════
   EXPOSE for inline onclick
══════════════════════════════════════════ */
window.copyCode = copyCode;