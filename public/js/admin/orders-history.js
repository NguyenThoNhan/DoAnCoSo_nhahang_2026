'use strict';

const HIST_API      = '/api/admin/orders';
const HIST_PAGE_SZ  = 20;
let _histAll        = [];
let _histFiltered   = [];
let _histPage       = 1;
let _histSearch     = '';
let _histDateFrom   = '';
let _histDateTo     = '';

function hEsc(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function hFmtMoney(n) {
    const num = Number(n) || 0;
    return num.toLocaleString('vi-VN') + '₫';
}

function hFmtDateTime(iso) {
    if (!iso) return '--';
    const d = new Date(iso);
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) +
        ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

async function histApiFetch() {
    const headers = {
        'Content-Type': 'application/json',
        ...GoMeal.getAuthHeader(),
    };
    const res  = await fetch(HIST_API, { headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.message || 'Không tải được dữ liệu đơn hàng.');
    }
    return data;
}

function histToast(msg, type = 'info') {
    const colors = {
        success: '#10B981',
        error:   '#EF4444',
        warning: '#F59E0B',
        info:    '#3B82F6',
    };
    const color = colors[type] || colors.info;
    const el = document.createElement('div');
    el.style.cssText = [
        'display:flex;align-items:center;gap:10px',
        'padding:10px 16px;border-radius:12px',
        'background:var(--color-white)',
        'box-shadow:0 8px 24px rgba(0,0,0,0.14)',
        `border-left:4px solid ${color}`,
        'font-family:var(--font-primary);font-size:13px',
        'color:var(--color-gray-800);max-width:360px',
        'pointer-events:all',
    ].join(';');
    el.innerHTML = `
        <i class="fas fa-circle-info" style="color:${color}"></i>
        <span style="flex:1;line-height:1.4">${hEsc(msg)}</span>
        <button style="background:none;border:none;cursor:pointer;color:var(--color-gray-400);font-size:0.8rem">
            <i class="fas fa-xmark"></i>
        </button>
    `;
    el.querySelector('button').onclick = () => el.remove();
    document.getElementById('toastContainer')?.appendChild(el);
    setTimeout(() => el.remove(), 4500);
}

async function loadHistory() {
    try {
        const tbody = document.getElementById('histTableBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="padding:24px;text-align:center;color:var(--color-gray-400)">
                        <i class="fas fa-spinner fa-spin"></i> Đang tải lịch sử đơn hàng...
                    </td>
                </tr>`;
        }
        const data = await histApiFetch();
        _histAll = Array.isArray(data) ? data.filter(o => o.status === 'completed') : [];
        applyHistFilter();
    } catch (err) {
        console.error('[OrdersHistory] loadHistory:', err);
        histToast(err.message || 'Không tải được lịch sử đơn hàng.', 'error');
        const tbody = document.getElementById('histTableBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="padding:24px;text-align:center;color:var(--color-gray-400)">
                        <i class="fas fa-triangle-exclamation"></i> Không thể tải dữ liệu.
                    </td>
                </tr>`;
        }
    }
}

function applyHistFilter() {
    const q = _histSearch.toLowerCase();
    _histFiltered = _histAll.filter(o => {
        if (_histDateFrom) {
            const d = new Date(o.completed_at || o.created_at);
            const iso = d.toISOString().slice(0, 10);
            if (iso < _histDateFrom) return false;
        }
        if (_histDateTo) {
            const d = new Date(o.completed_at || o.created_at);
            const iso = d.toISOString().slice(0, 10);
            if (iso > _histDateTo) return false;
        }
        if (q) {
            const hay = [
                String(o.id),
                String(o.table_number || ''),
                String(o.customer_name || ''),
                String(o.customer_phone || ''),
            ].join(' ').toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });

    _histPage = 1;
    renderHistTable();
    updateHistPagination();

    const clearBtn = document.getElementById('histClearFilter');
    if (clearBtn) {
        clearBtn.style.display = (_histSearch || _histDateFrom || _histDateTo) ? 'inline-flex' : 'none';
    }
}

function renderHistTable() {
    const tbody = document.getElementById('histTableBody');
    if (!tbody) return;

    if (!_histFiltered.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="padding:24px;text-align:center;color:var(--color-gray-400)">
                    <i class="fas fa-inbox" style="font-size:1.8rem;opacity:0.3;display:block;margin-bottom:8px"></i>
                    Chưa có đơn hàng hoàn thành nào theo bộ lọc hiện tại.
                </td>
            </tr>`;
        return;
    }

    const start = (_histPage - 1) * HIST_PAGE_SZ;
    const pageItems = _histFiltered.slice(start, start + HIST_PAGE_SZ);

    tbody.innerHTML = pageItems.map(o => {
        const payTime   = hFmtDateTime(o.completed_at || o.created_at);
        const table     = o.table_number ? `Bàn ${hEsc(String(o.table_number))}` : '--';
        const customer  = hEsc(o.customer_name || 'Khách vãng lai');
        const phone     = o.customer_phone ? `<div style="font-size:0.7rem;color:var(--color-gray-400)">${hEsc(o.customer_phone)}</div>` : '';
        const items     = Array.isArray(o.items) ? o.items : [];
        const itemCount = items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0) || items.length || 0;
        const subtotal  = items.reduce((sum, it) => {
            const price = Number(it.price_at_order || 0);
            const qty   = Number(it.quantity || 0);
            return sum + price * qty;
        }, 0);
        const discount  = Number(o.discount_amount) || 0;
        const total     = Number(o.total_amount) || (subtotal - discount);

        return `
            <tr>
                <td style="font-weight:700;color:var(--admin-primary)">#${o.id}</td>
                <td>${table}</td>
                <td>
                    <div style="font-weight:600;color:var(--color-gray-800)">${customer}</div>
                    ${phone}
                </td>
                <td style="font-weight:700;color:var(--color-gray-800)">${itemCount}</td>
                <td style="font-weight:600;color:var(--color-gray-700)">${hFmtMoney(subtotal)}</td>
                <td style="font-weight:600;color:var(--color-success)">${discount > 0 ? '−' + hFmtMoney(discount) : '0₫'}</td>
                <td style="font-weight:800;color:var(--color-gray-900)">${hFmtMoney(total)}</td>
                <td style="font-size:var(--text-xs);color:var(--color-gray-500)">${payTime}</td>
            </tr>`;
    }).join('');
}

function updateHistPagination() {
    const info = document.getElementById('histPageInfo');
    const btnPrev = document.getElementById('histPrev');
    const btnNext = document.getElementById('histNext');
    const totalPages = Math.max(1, Math.ceil(_histFiltered.length / HIST_PAGE_SZ));

    if (info) {
        info.textContent = `Trang ${_histPage} / ${totalPages} — ${_histFiltered.length} đơn`;
    }
    if (btnPrev) btnPrev.disabled = _histPage <= 1;
    if (btnNext) btnNext.disabled = _histPage >= totalPages;
}

document.addEventListener('DOMContentLoaded', () => {
    loadHistory();

    document.getElementById('btnBackOrders')?.addEventListener('click', () => {
        window.location.href = '/views/admin/orders.html';
    });

    document.getElementById('histSearch')?.addEventListener('input', e => {
        _histSearch = e.target.value.trim();
        applyHistFilter();
    });

    document.getElementById('histDateFrom')?.addEventListener('change', e => {
        _histDateFrom = e.target.value;
        applyHistFilter();
    });
    document.getElementById('histDateTo')?.addEventListener('change', e => {
        _histDateTo = e.target.value;
        applyHistFilter();
    });

    document.getElementById('histClearFilter')?.addEventListener('click', () => {
        _histSearch   = '';
        _histDateFrom = '';
        _histDateTo   = '';
        const s  = document.getElementById('histSearch');
        const df = document.getElementById('histDateFrom');
        const dt = document.getElementById('histDateTo');
        if (s)  s.value  = '';
        if (df) df.value = '';
        if (dt) dt.value = '';
        applyHistFilter();
    });

    document.getElementById('histPrev')?.addEventListener('click', () => {
        if (_histPage > 1) {
            _histPage--;
            renderHistTable();
            updateHistPagination();
        }
    });
    document.getElementById('histNext')?.addEventListener('click', () => {
        const totalPages = Math.max(1, Math.ceil(_histFiltered.length / HIST_PAGE_SZ));
        if (_histPage < totalPages) {
            _histPage++;
            renderHistTable();
            updateHistPagination();
        }
    });
});

