/**
 * customer.js — Admin Customer / Membership Page
 * ══════════════════════════════════════════════════════
 * API (admin.routes.js confirmed):
 *   GET /api/admin/customers → getAllCustomers
 *   Response: [{id, name, email, phone_number, status,
 *               address, membership_level, total_points}]
 *
 * Page is READ-ONLY. No CRUD.
 * All fetch via GoMeal.getAuthHeader()
 * ══════════════════════════════════════════════════════
 */

'use strict';

const CUSTOMER_API = '/api/admin/customers';
const DEBOUNCE     = 250;

/* ── Membership level config ── */
const LEVEL_MAP = {
    // Keys: lowercased membership_level from DB
    'đồng':       { key:'bronze',  label:'Đồng',       cls:'lv-bronze',  icon:'fa-medal',   pointMin:0,     pointMax:1999  },
    'bronze':     { key:'bronze',  label:'Đồng',       cls:'lv-bronze',  icon:'fa-medal',   pointMin:0,     pointMax:1999  },
    'bạc':        { key:'silver',  label:'Bạc',        cls:'lv-silver',  icon:'fa-award',   pointMin:2000,  pointMax:4999  },
    'silver':     { key:'silver',  label:'Bạc',        cls:'lv-silver',  icon:'fa-award',   pointMin:2000,  pointMax:4999  },
    'vàng':       { key:'gold',    label:'Vàng',       cls:'lv-gold',    icon:'fa-crown',   pointMin:5000,  pointMax:9999  },
    'gold':       { key:'gold',    label:'Vàng',       cls:'lv-gold',    icon:'fa-crown',   pointMin:5000,  pointMax:9999  },
    'kim cương':  { key:'diamond', label:'Kim cương',  cls:'lv-diamond', icon:'fa-gem',     pointMin:10000, pointMax:null  },
    'diamond':    { key:'diamond', label:'Kim cương',  cls:'lv-diamond', icon:'fa-gem',     pointMin:10000, pointMax:null  },
};
const LEVEL_NONE = { key:'none', label:'Chưa có hạng', cls:'lv-none', icon:'fa-user', pointMin:0, pointMax:null };

function levelOf(raw) {
    if (!raw) return LEVEL_NONE;
    return LEVEL_MAP[raw.trim().toLowerCase()] || { ...LEVEL_NONE, label: raw };
}

/* ── Avatar bg/color palette (deterministic by id) ── */
const AVA_PALETTE = [
    { bg:'#EDE9FE', clr:'#7C3AED' },
    { bg:'#FCE7F3', clr:'#9D174D' },
    { bg:'#D1FAE5', clr:'#065F46' },
    { bg:'#DBEAFE', clr:'#1D4ED8' },
    { bg:'#FEF3C7', clr:'#92400E' },
    { bg:'#FFE4E6', clr:'#9F1239' },
    { bg:'#CCFBF1', clr:'#134E4A' },
    { bg:'#F5F3FF', clr:'#5B21B6' },
];
function avaColor(id) { return AVA_PALETTE[id % AVA_PALETTE.length]; }

/* ── State ── */
let _customers    = [];
let _filtered     = [];
let _levelFilter  = 'all';
let _search       = '';
let _searchTimer  = null;
let _maxPoints    = 1;

/* ══════════════════════════════════════════
   UTILITIES
══════════════════════════════════════════ */
function esc(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function setText(id, v) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(v);
}

function fmtPoints(v) {
    const n = Number(v) || 0;
    return n.toLocaleString('vi-VN');
}

function initials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ══════════════════════════════════════════
   TOAST
══════════════════════════════════════════ */
function toast(msg, type = 'error') {
    const cfg = {
        success: { ico:'circle-check',         col:'#10B981' },
        error:   { ico:'triangle-exclamation', col:'#EF4444' },
        info:    { ico:'circle-info',           col:'#3B82F6' },
    };
    const { ico, col } = cfg[type] || cfg.error;

    if (!document.getElementById('_cu_kf')) {
        const s = document.createElement('style');
        s.id = '_cu_kf';
        s.textContent = '@keyframes _tIn{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:translateX(0)}}';
        document.head.appendChild(s);
    }
    const el = document.createElement('div');
    el.style.cssText = [
        'display:flex;align-items:center;gap:10px',
        'padding:12px 18px;border-radius:12px',
        'background:var(--color-white)',
        'box-shadow:0 8px 28px rgba(0,0,0,.13)',
        `border-left:4px solid ${col}`,
        'font-family:var(--font-primary);font-size:14px',
        'color:var(--color-gray-800);max-width:380px',
        'pointer-events:all;animation:_tIn .3s ease',
    ].join(';');
    el.innerHTML = `
        <i class="fas fa-${esc(ico)}" style="color:${col};font-size:1rem;flex-shrink:0"></i>
        <span style="flex:1;line-height:1.45">${esc(msg)}</span>
        <button onclick="this.parentElement.remove()"
                style="background:none;border:none;cursor:pointer;color:var(--color-gray-400);font-size:.8rem;padding:0">
            <i class="fas fa-xmark"></i></button>`;
    document.getElementById('toastContainer')?.appendChild(el);
    setTimeout(() => el?.remove(), 5000);
}

/* ══════════════════════════════════════════
   API FETCH
══════════════════════════════════════════ */
async function apiFetch(url) {
    const res  = await fetch(url, { headers: { ...GoMeal.getAuthHeader() } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.message || `HTTP ${res.status}`), { status: res.status });
    return data;
}

/* ══════════════════════════════════════════
   loadCustomers  — tách hàm rõ ràng
══════════════════════════════════════════ */
async function loadCustomers(silent = false) {
    if (!silent) renderSpinner();
    try {
        _customers = await apiFetch(CUSTOMER_API) || [];
        // Tính max điểm để scale progress bar
        _maxPoints = Math.max(1, ..._customers.map(c => Number(c.total_points) || 0));
        updateStats();
        applyFilter();
    } catch (err) {
        console.error('[Customer] load:', err);
        renderEmpty('Lỗi tải dữ liệu', 'Vui lòng làm mới trang hoặc kiểm tra kết nối.');
        if (!silent) toast('Không tải được danh sách khách hàng: ' + err.message, 'error');
    } finally {
        document.querySelector('#btnRefresh i')?.classList.remove('fa-spin');
    }
}

/* ══════════════════════════════════════════
   STATS
══════════════════════════════════════════ */
function updateStats() {
    const c = { total: _customers.length, bronze: 0, silver: 0, gold: 0 };
    _customers.forEach(x => {
        const k = levelOf(x.membership_level).key;
        if (k === 'bronze')                 c.bronze++;
        else if (k === 'silver')            c.silver++;
        else if (k === 'gold' || k === 'diamond') c.gold++;
    });
    setText('stTotal',  c.total);
    setText('stBronze', c.bronze);
    setText('stSilver', c.silver);
    setText('stGold',   c.gold);
    setText('headCount', c.total ? `(${c.total})` : '');
}

/* ══════════════════════════════════════════
   FILTER
══════════════════════════════════════════ */
function applyFilter() {
    const q = _search.toLowerCase();
    _filtered = _customers.filter(c => {
        if (_levelFilter !== 'all' && levelOf(c.membership_level).key !== _levelFilter) return false;
        if (q) {
            const hay = [c.name, c.email].filter(Boolean).join(' ').toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });
    setText('resultCount', _filtered.length);
    renderTable();
    syncPills();
}

function syncPills() {
    document.querySelectorAll('.cu-pill').forEach(p => {
        p.classList.toggle('p-on', p.dataset.lf === _levelFilter);
    });
}

/* ══════════════════════════════════════════
   renderTable  — tách hàm rõ ràng
══════════════════════════════════════════ */
function renderTable() {
    const tbody = document.getElementById('customerBody');
    if (!tbody) return;

    if (!_filtered.length) {
        renderEmpty(
            _search || _levelFilter !== 'all' ? 'Không tìm thấy khách hàng' : 'Chưa có khách hàng',
            _search || _levelFilter !== 'all'
                ? 'Thử thay đổi bộ lọc hoặc từ khoá tìm kiếm.'
                : 'Hệ thống chưa có khách hàng nào đăng ký.'
        );
        return;
    }

    tbody.innerHTML = _filtered.map((c, idx) => {
        const level    = levelOf(c.membership_level);
        const ac       = avaColor(c.id || idx);
        const inits    = initials(c.name);
        const pts      = Number(c.total_points) || 0;
        const barPct   = Math.min(100, Math.round((pts / _maxPoints) * 100));
        const isActive = (c.status || '').toLowerCase() !== 'inactive';
        const delay    = Math.min(idx * 25, 250);
        const rank     = idx + 1;

        // Thanh điểm màu theo hạng
        const barColors = { bronze:'#D97706', silver:'#64748B', gold:'#CA8A04', diamond:'#2563EB', none:'#9CA3AF' };
        const barColor  = barColors[level.key] || barColors.none;

        // Top 3 rank style
        let rankCls = '';
        if (rank === 1) rankCls = 'top1';
        else if (rank === 2) rankCls = 'top2';
        else if (rank === 3) rankCls = 'top3';

        return `
        <tr class="tr-in" style="animation-delay:${delay}ms">
            <td style="text-align:center;padding-left:var(--space-5)">
                <div class="cu-rank ${esc(rankCls)}">${rank}</div>
            </td>
            <td>
                <div class="cu-ava" style="background:${esc(ac.bg)};color:${esc(ac.clr)}">
                    ${esc(inits)}
                </div>
            </td>
            <td>
                <span class="cu-name">${esc(c.name)}</span>
            </td>
            <td>
                <span class="cu-email" title="${esc(c.email)}">
                    <i class="fas fa-envelope" style="font-size:.55rem;flex-shrink:0"></i>
                    ${esc(c.email)}
                </span>
            </td>
            <td>
                <span class="cu-badge ${esc(level.cls)}">
                    <i class="fas ${esc(level.icon)}" style="font-size:.65rem"></i>
                    ${esc(level.label)}
                </span>
            </td>
            <td class="td-right">
                <span class="cu-points">${fmtPoints(pts)}</span>
                <div class="cu-points-lbl">điểm</div>
                <div class="cu-pbar-wrap">
                    <div class="cu-pbar" style="width:${barPct}%;background:${barColor}"></div>
                </div>
            </td>
            <td>
                <span class="cu-status ${isActive ? 'st-active' : 'st-inactive'}">
                    <span class="st-dot"></span>
                    ${isActive ? 'Hoạt động' : 'Khoá'}
                </span>
            </td>
        </tr>`;
    }).join('');
}

function renderSpinner() {
    const tbody = document.getElementById('customerBody');
    if (!tbody) return;
    // Dùng skeleton rows thay vì 1 cell spinner để giữ layout cột
    tbody.innerHTML = Array(6).fill('').map(() => `
        <tr>
            <td style="padding-left:var(--space-5)">
                <div class="sk" style="width:28px;height:28px;border-radius:var(--radius-md)"></div>
            </td>
            <td><div class="sk" style="width:40px;height:40px;border-radius:var(--radius-xl)"></div></td>
            <td><div class="sk" style="height:14px;width:130px"></div></td>
            <td><div class="sk" style="height:22px;width:170px;border-radius:99px"></div></td>
            <td><div class="sk" style="height:24px;width:85px;border-radius:99px"></div></td>
            <td style="text-align:right"><div class="sk" style="height:16px;width:55px;margin-left:auto"></div></td>
            <td><div class="sk" style="height:22px;width:75px;border-radius:99px"></div></td>
        </tr>`).join('');
}

function renderEmpty(title, desc) {
    const tbody = document.getElementById('customerBody');
    if (!tbody) return;
    tbody.innerHTML = `
        <tr><td colspan="7">
            <div class="cu-empty">
                <div class="cu-empty-ico"><i class="fas fa-user-slash"></i></div>
                <div class="cu-empty-t">${esc(title)}</div>
                <div class="cu-empty-d">${esc(desc)}</div>
            </div>
        </td></tr>`;
}

/* ══════════════════════════════════════════
   INIT
══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

    loadCustomers();

    /* Refresh */
    document.getElementById('btnRefresh')?.addEventListener('click', () => {
        document.querySelector('#btnRefresh i')?.classList.add('fa-spin');
        loadCustomers();
    });

    /* Search — topbar + toolbar, debounced */
    function handleSearch(val) {
        _search = val.trim();
        applyFilter();
    }
    ['topbarSearch', 'searchInput'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', e => {
            clearTimeout(_searchTimer);
            _searchTimer = setTimeout(() => handleSearch(e.target.value), DEBOUNCE);
        });
    });

    /* Level filter pills */
    document.getElementById('pillsGroup')?.addEventListener('click', e => {
        const pill = e.target.closest('.cu-pill');
        if (!pill) return;
        _levelFilter = pill.dataset.lf;
        applyFilter();
    });
});