/**
 * dashboard.js — Admin Dashboard
 * Sprint 3 / Phase 3
 *
 * APIs:
 *   GET /api/admin/stats/dashboard
 *     → { cards: { revenueToday, pendingCount }, revenueChart: [{date,daily_revenue}], topSelling: [{item_name,total_qty}] }
 *   GET /api/admin/orders
 *     → [ { id, table_number, total_amount, status, created_at, customer_name, items[] } ]
 *   GET /api/admin/tables
 *     → [ { id, table_number, capacity, status } ]
 *
 * Helpers expected from common.js:
 *   GoMeal.getAuthHeader()  — returns { Authorization: 'Bearer <token>' }
 *   formatCurrency()  — formats number to VNĐ string  (fallback defined here)
 */

'use strict';

/* ─────────────────────────────────────────────────
   CONFIG
───────────────────────────────────────────────── */
const API_BASE   = '/api/admin';
const REFRESH_MS = 60_000; // auto-refresh every 60s

/* ─────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────── */
const fmt = (typeof formatCurrency === 'function')
    ? formatCurrency
    : (n) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n || 0);

function relativeTime(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60_000);
    if (m < 1)  return 'Vừa xong';
    if (m < 60) return `${m} phút trước`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} giờ trước`;
    return `${Math.floor(h / 24)} ngày trước`;
}

function statusLabel(s) {
    const map = {
        pending:    { text: 'Chờ xử lý',  cls: 'badge-warning' },
        processing: { text: 'Đang làm',   cls: 'badge-info'    },
        completed:  { text: 'Hoàn tất',   cls: 'badge-success' },
        cancelled:  { text: 'Huỷ',        cls: 'badge-error'   },
    };
    return map[s] || { text: s, cls: 'badge-neutral' };
}

/* ─────────────────────────────────────────────────
   CHART INSTANCES (keyed for destroy-on-redraw)
───────────────────────────────────────────────── */
const _charts = {};

function destroyChart(id) {
    if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; }
}

/* ─────────────────────────────────────────────────
   SPARKLINE — minimal line chart (dark bg variant)
───────────────────────────────────────────────── */
function drawSparkline(canvasId, data, color = '#F97316', isDark = false) {
    const el = document.getElementById(canvasId);
    if (!el || !data?.length) return;

    destroyChart(canvasId);

    const ctx = el.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, el.offsetHeight || 80);
    gradient.addColorStop(0, color + '55');
    gradient.addColorStop(1, color + '00');

    _charts[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map((_, i) => i),
            datasets: [{
                data,
                borderColor: color,
                borderWidth: 2.5,
                pointRadius: 0,
                tension: 0.45,
                fill: true,
                backgroundColor: gradient,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales: {
                x: { display: false },
                y: { display: false },
            },
            animation: { duration: 800, easing: 'easeOutQuart' },
            elements: { line: { capBezierPoints: false } },
        },
    });
}

/* ─────────────────────────────────────────────────
   FETCH WRAPPERS
───────────────────────────────────────────────── */
async function apiFetch(endpoint) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
        headers: {
            'Content-Type': 'application/json',
            ...GoMeal.getAuthHeader(),
        },
    });
    if (!res.ok) throw new Error(`API ${endpoint} → ${res.status}`);
    return res.json();
}

/* ─────────────────────────────────────────────────
   RENDER: ANALYTICS GRID
───────────────────────────────────────────────── */
function renderAnalytics(stats, tables) {
    const { cards, revenueChart = [], topSelling = [], lowStockIngredients = [] } = stats;
    const revenue         = Number(cards.revenueToday)    || 0;
    const pending         = Number(cards.pendingCount)    || 0;
    const occupiedFromAPI = Number(cards.occupiedTables)  || 0;

    /* ── Revenue Hero ── */
    const revEl    = document.getElementById('revValue');
    const hintEl   = document.getElementById('revZeroHint');
    const trendEl  = document.getElementById('revTrend');

    if (revenue === 0) {
        revEl.innerHTML = '';
        revEl.textContent = 'Chưa có doanh thu';
        revEl.classList.add('rhc-zero');
        hintEl.classList.add('show');
        trendEl.style.display = 'none';
    } else {
        revEl.textContent = fmt(revenue);
        revEl.classList.remove('rhc-zero');
        hintEl.classList.remove('show');
        trendEl.style.display = 'flex';
    }

    /* Revenue sparkline (last 7 days, reversed to chronological) */
    const chartData = [...revenueChart].reverse().map(r => Number(r.daily_revenue) || 0);
    drawSparkline('sparklineRevenue', chartData, '#F97316', true);

    /* Bottom metrics: peak & avg */
    if (chartData.length) {
        const peak = Math.max(...chartData);
        const avg  = chartData.reduce((a, b) => a + b, 0) / chartData.length;
        document.getElementById('metricPeakDay').textContent = fmt(peak);
        document.getElementById('metricAvgDay').textContent  = fmt(Math.round(avg));
    } else {
        document.getElementById('metricPeakDay').textContent = '--';
        document.getElementById('metricAvgDay').textContent  = '--';
    }

    /* ── Pending Orders ── */
    document.getElementById('statPending').textContent = pending;
    document.getElementById('statPendingSub').textContent =
        pending > 0 ? `${pending} đơn cần xử lý ngay` : 'Không có đơn chờ';
    drawSparkline('sparkPending', chartData.map(() => Math.random() * pending + pending * 0.5), '#F97316');

    /* ── Live Tables — dùng occupiedTables từ stats.cards (chính xác hơn) ── */
    {
        const occupied = occupiedFromAPI || (tables ? tables.filter(t => t.status === 'occupied').length : 0);
        const free     = tables ? tables.filter(t => t.status === 'available').length : 0;
        document.getElementById('statTables').textContent = occupied;
        document.getElementById('statTablesSub').innerHTML =
            `<i class="fas fa-circle" style="font-size:6px;color:var(--color-success)"></i>
             <span>${free} bàn còn trống</span>`;
        drawSparkline('sparkTables', Array.from({ length: 7 }, (_, i) => Math.max(0, occupied - i * 0.5)), '#10B981');
    }

    /* ── Low Stock Warning ── */
    renderLowStockWarning(lowStockIngredients);

    /* ── Avg order value ── */
    if (chartData.length) {
        const totalRevenue7d = chartData.reduce((a, b) => a + b, 0);
        // rough estimate: assume pending~orders ratio
        const avgOrderVal = totalRevenue7d / Math.max(pending * 7 || 7, 1);
        document.getElementById('statAvg').textContent = fmt(Math.round(avgOrderVal));
        drawSparkline('sparkAvg', chartData.map(v => v / Math.max(pending || 1, 1)), '#3B82F6');
    } else {
        document.getElementById('statAvg').textContent = '--';
    }

    /* ── Top Selling Mini ── */
    renderTopSellMini(topSelling);
}

/* ─────────────────────────────────────────────────
   RENDER: TOP SELLING MINI (analytics grid)
───────────────────────────────────────────────── */
function renderTopSellMini(list) {
    const el = document.getElementById('topSellMini');
    if (!el) return;

    if (!list?.length) {
        el.innerHTML = `<div class="dash-empty"><div class="de-title">Chưa có dữ liệu</div></div>`;
        return;
    }

    const max = list[0]?.total_qty || 1;
    el.innerHTML = list.slice(0, 5).map((item, idx) => {
        const pct   = Math.round((item.total_qty / max) * 100);
        const rankCls = idx === 0 ? 'r1' : idx === 1 ? 'r2' : idx === 2 ? 'r3' : '';
        return `
        <div class="tsc-item">
            <div class="tsc-rank ${rankCls}">${idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}</div>
            <div class="tsc-name" title="${escHtml(item.item_name)}">${escHtml(item.item_name)}</div>
            <div class="tsc-bar-wrap">
                <div class="tsc-bar-fill" style="width:${pct}%"></div>
            </div>
            <div class="tsc-qty">${item.total_qty}</div>
        </div>`;
    }).join('');
}

/* ─────────────────────────────────────────────────
   RENDER: LOW STOCK WARNING
───────────────────────────────────────────────── */
function renderLowStockWarning(list) {
    // Hiển thị cảnh báo tồn kho thấp nếu có phần tử #lowStockWrap trong DOM
    const wrap = document.getElementById('lowStockWrap');
    if (!wrap) return;

    if (!list || list.length === 0) {
        wrap.style.display = 'none';
        return;
    }

    wrap.style.display = '';
    const listEl = document.getElementById('lowStockList');
    if (!listEl) return;

    listEl.innerHTML = list.map(item => {
        const pct = item.min_stock_level > 0
            ? Math.min(100, Math.round((item.stock_quantity / item.min_stock_level) * 100))
            : 100;
        const isOut = item.stock_quantity === 0;
        const color = isOut ? '#EF4444' : '#F59E0B';
        return `
        <div class="lsw-item">
            <div class="lsw-name">${escHtml(item.name)}</div>
            <div class="lsw-bar-wrap">
                <div class="lsw-bar-fill" style="width:${pct}%;background:${color}"></div>
            </div>
            <div class="lsw-qty" style="color:${color}">
                ${item.stock_quantity} ${escHtml(item.unit)}
                ${isOut ? '<span class="lsw-out">Hết</span>' : ''}
            </div>
        </div>`;
    }).join('');
}

/* ─────────────────────────────────────────────────
   RENDER: RECENT ORDERS
───────────────────────────────────────────────── */
function renderRecentOrders(orders) {
    const el = document.getElementById('recentOrdersList');
    if (!el) return;

    const recent = (orders || []).slice(0, 8);

    if (!recent.length) {
        el.innerHTML = `
        <div class="dash-empty">
            <div class="de-icon"><i class="fas fa-receipt"></i></div>
            <div class="de-title">Chưa có đơn hàng</div>
            <div class="de-hint">Hôm nay chưa có đơn nào được tạo</div>
        </div>`;
        return;
    }

    el.innerHTML = recent.map(o => {
        const st = statusLabel(o.status);
        return `
        <div class="dash-order-row" role="button" onclick="location.href='/views/admin/orders.html'">
            <div class="dor-num">#${o.id}</div>
            <div class="dor-info">
                <div class="dor-id">Bàn ${o.table_number || '?'} — ${escHtml(o.customer_name || 'Khách lẻ')}</div>
                <div class="dor-time">${relativeTime(o.created_at)}</div>
            </div>
            <div class="dor-right">
                <div class="dor-amount">${fmt(o.total_amount)}</div>
                <span class="badge ${st.cls}" style="font-size:0.6rem;padding:2px 6px">${st.text}</span>
            </div>
        </div>`;
    }).join('');
}

/* ─────────────────────────────────────────────────
   RENDER: TOP SELLING (detailed — bottom row)
───────────────────────────────────────────────── */
function renderTopSelling(list) {
    const el = document.getElementById('topSellingList');
    if (!el) return;

    if (!list?.length) {
        el.innerHTML = `
        <div class="dash-empty">
            <div class="de-icon"><i class="fas fa-utensils"></i></div>
            <div class="de-title">Chưa có dữ liệu bán hàng</div>
            <div class="de-hint">Dữ liệu sẽ hiển thị sau khi có đơn hoàn tất</div>
        </div>`;
        return;
    }

    const max = list[0]?.total_qty || 1;
    el.innerHTML = list.map((item, idx) => {
        const pct     = Math.round((item.total_qty / max) * 100);
        const rankCls = ['ddr-rank-1', 'ddr-rank-2', 'ddr-rank-3'][idx] || '';
        return `
        <div class="dash-dish-row">
            <div class="ddr-rank ${rankCls}">${idx + 1}</div>
            <div class="ddr-img">
                <i class="fas fa-utensils" style="font-size:1rem;color:var(--color-gray-300);margin:auto;display:block;padding:10px 0"></i>
            </div>
            <div class="ddr-info">
                <div class="ddr-name">${escHtml(item.item_name)}</div>
                <div class="ddr-cat" style="margin-top:4px">
                    <div style="height:3px;background:var(--color-gray-100);border-radius:99px;overflow:hidden;width:80px">
                        <div style="height:100%;width:${pct}%;background:var(--admin-primary);border-radius:99px;transition:width 1s ease"></div>
                    </div>
                </div>
            </div>
            <div class="ddr-sold">${item.total_qty} <span style="font-size:0.65rem;font-weight:500;color:var(--color-gray-400)">phần</span></div>
        </div>`;
    }).join('');
}

/* ─────────────────────────────────────────────────
   RENDER: LIVE TABLES
───────────────────────────────────────────────── */
function renderLiveTables(tables) {
    const el = document.getElementById('liveTablesList');
    if (!el) return;

    if (!tables?.length) {
        el.innerHTML = `<div class="dash-empty"><div class="de-title">Không có dữ liệu bàn</div></div>`;
        return;
    }

    // Sort: occupied first, then by table_number
    const sorted = [...tables].sort((a, b) => {
        if (a.status === 'occupied' && b.status !== 'occupied') return -1;
        if (a.status !== 'occupied' && b.status === 'occupied') return 1;
        return a.table_number - b.table_number;
    });

    el.innerHTML = sorted.map(t => {
        const isOccupied = t.status === 'occupied';
        const statusText = isOccupied ? 'Có khách' : t.status === 'cleaning' ? 'Dọn dẹp' : 'Trống';
        const dotCls     = isOccupied ? 'dlr-occupied' : 'dlr-free';
        return `
        <div class="dash-live-row">
            <div class="dlr-table ${dotCls}">T${t.table_number}</div>
            <div class="dlr-info">
                <div class="dlr-order">${statusText} — ${t.capacity} chỗ</div>
                <div class="dlr-since">Sức chứa ${t.capacity} người</div>
            </div>
            <div class="dlr-amount">
                ${isOccupied
                    ? `<span class="badge badge-warning" style="font-size:0.6rem">Đang phục vụ</span>`
                    : `<span class="badge badge-success" style="font-size:0.6rem">Sẵn sàng</span>`
                }
            </div>
        </div>`;
    }).join('');
}

/* ─────────────────────────────────────────────────
   SKELETON STATE
───────────────────────────────────────────────── */
function showSkeleton() {
    const skel = (w, h) =>
        `<div class="sk-block skeleton" style="width:${w};height:${h}px;margin-bottom:6px"></div>`;

    const orderSkel = Array(5).fill(0).map(() => `
        <div class="dash-order-row">
            <div class="sk-block skeleton" style="width:28px;height:28px;border-radius:6px"></div>
            <div style="flex:1">
                ${skel('60%', 13)}
                ${skel('40%', 10)}
            </div>
            <div>${skel('70px', 14)}</div>
        </div>`).join('');

    document.getElementById('recentOrdersList').innerHTML  = orderSkel;
    document.getElementById('topSellingList').innerHTML    = Array(4).fill(0).map(() => `
        <div class="dash-dish-row">
            <div class="sk-block skeleton" style="width:20px;height:14px;border-radius:4px"></div>
            <div class="sk-block skeleton" style="width:38px;height:38px;border-radius:6px"></div>
            <div style="flex:1">${skel('70%', 13)}${skel('50%', 8)}</div>
            <div>${skel('30px', 13)}</div>
        </div>`).join('');

    document.getElementById('topSellMini').innerHTML = Array(5).fill(0).map(() => `
        <div class="tsc-item">
            <div class="sk-block skeleton" style="width:18px;height:12px;border-radius:3px"></div>
            <div class="sk-block skeleton" style="flex:1;height:12px;border-radius:4px"></div>
            <div class="sk-block skeleton" style="width:52px;height:5px;border-radius:99px"></div>
            <div class="sk-block skeleton" style="width:24px;height:12px;border-radius:3px"></div>
        </div>`).join('');
}

/* ─────────────────────────────────────────────────
   SET PAGE DATE
───────────────────────────────────────────────── */
function setPageDate() {
    const now  = new Date();
    const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const str  = now.toLocaleDateString('vi-VN', opts);
    const el   = document.getElementById('dashDate');
    if (el) el.textContent = `${str} · Cập nhật lần cuối: ${now.toLocaleTimeString('vi-VN')}`;
}

/* ─────────────────────────────────────────────────
   ESCAPE HTML
───────────────────────────────────────────────── */
function escHtml(s) {
    if (!s) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/* ─────────────────────────────────────────────────
   ADMIN NAME (from JWT stored in localStorage)
───────────────────────────────────────────────── */
function setAdminName() {
    try {
        const token   = localStorage.getItem('token') || sessionStorage.getItem('token');
        if (!token) return;
        const payload = JSON.parse(atob(token.split('.')[1]));
        const name    = payload.name || payload.username || 'Admin';
        const initial = name.charAt(0).toUpperCase();
        const nameEl  = document.getElementById('adminName');
        const avaEl   = document.getElementById('avatarInitial');
        if (nameEl) nameEl.textContent = name;
        if (avaEl)  avaEl.textContent  = initial;
    } catch (_) { /* ignore */ }
}

/* ─────────────────────────────────────────────────
   MAIN LOAD
───────────────────────────────────────────────── */
let _refreshTimer = null;

async function loadDashboard() {
    setPageDate();

    /* pending-order badge on notif button */
    document.getElementById('notifDot')?.style && null; // handled after fetch

    showSkeleton();

    try {
        // Parallel fetch: stats + orders + tables
        const [stats, orders, tables] = await Promise.all([
            apiFetch('/stats/dashboard'),
            apiFetch('/orders'),
            apiFetch('/tables'),
        ]);

        /* Notify dot if pending orders */
        const pendingCount = Number(stats?.cards?.pendingCount) || 0;
        const notifDot = document.getElementById('notifDot');
        if (notifDot) notifDot.style.display = pendingCount > 0 ? 'block' : 'none';

        renderAnalytics(stats, tables);
        renderRecentOrders(orders);
        renderTopSelling(stats.topSelling || []);
        renderLiveTables(tables);

    } catch (err) {
        console.error('[Dashboard] Load error:', err);

        // Show inline error on main areas
        const errMsg = `
        <div class="dash-empty">
            <div class="de-icon"><i class="fas fa-triangle-exclamation"></i></div>
            <div class="de-title">Không thể tải dữ liệu</div>
            <div class="de-hint">Kiểm tra kết nối hoặc đăng nhập lại</div>
        </div>`;
        ['recentOrdersList', 'topSellingList'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = errMsg;
        });

        // Show error on revenue card
        const revEl = document.getElementById('revValue');
        if (revEl) {
            revEl.textContent = 'Lỗi tải dữ liệu';
            revEl.classList.add('rhc-zero');
        }
    }
}

/* ─────────────────────────────────────────────────
   AUTO REFRESH
───────────────────────────────────────────────── */
function startAutoRefresh() {
    stopAutoRefresh();
    _refreshTimer = setInterval(() => {
        loadDashboard();
    }, REFRESH_MS);
}

function stopAutoRefresh() {
    if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null; }
}

/* ─────────────────────────────────────────────────
   EXPORT (placeholder)
───────────────────────────────────────────────── */
function handleExport() {
    // Placeholder — connect to a real export endpoint if available
    alert('Tính năng xuất báo cáo đang được phát triển.');
}

/* ─────────────────────────────────────────────────
   INIT
───────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
    setAdminName();
    loadDashboard();
    startAutoRefresh();

    /* Manual refresh button */
    document.getElementById('btnRefresh')?.addEventListener('click', () => {
        stopAutoRefresh();
        loadDashboard();
        startAutoRefresh();
    });

    /* Export button */
    document.getElementById('btnExport')?.addEventListener('click', handleExport);

    /* Stop refresh when tab hidden (perf) */
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stopAutoRefresh();
        else { loadDashboard(); startAutoRefresh(); }
    });
});