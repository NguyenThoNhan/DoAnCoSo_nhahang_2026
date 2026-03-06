/* ================================================================
   GOMEAL — PROFILE.JS
   File: public/js/user/profile.js

   Trang Hồ sơ thành viên — views/user/profile.html
   Yêu cầu: authToken (layout.js đã guard → redirect /views/auth/login.html nếu thiếu)

   Chức năng:
     1.  loadProfile()           — GET /api/user/profile-details (Bearer authToken)
     2.  renderVipCard()         — Thẻ VIP động: gradient + tier + progress bar
     3.  renderPersonalInfo()    — Avatar, tên, email, phone, địa chỉ, các fields
     4.  renderPointsBreakdown() — Điểm lớn + progress bar + items
     5.  renderStatsGrid()       — 4 quick stat cards
     6.  renderRoadmap()         — Lộ trình hạng thành viên (done/active/locked)
     7.  renderPerks()           — Quyền lợi theo hạng (active/locked)
     8.  animateNumber()         — Counter animation cho điểm
     9.  computeProgress()       — Tính toán % tiến trình lên hạng tiếp theo
     10. initRefreshBtn()        — Nút làm mới
     11. showToast()             — Inline toast

   API dùng (đúng theo user.routes.js — NHÓM 3 Protected):
     GET /api/user/profile-details
     Header: Authorization: Bearer <authToken>  (GoMeal.safeFetch tự gắn)

   Response shape:
     {
       customer_id:      number,
       address:          string | null,
       last_order_at:    string | null,   (datetime)
       name:             string,
       email:            string,
       phone_number:     string | null,
       membership_level: 'none' | 'silver' | 'gold' | 'platinum',
       total_points:     number
     }

   Membership tiers (DB values → display):
     none     → Thành viên   (threshold 200pt  → Bạc)
     silver   → Bạc          (threshold 500pt  → Vàng)
     gold     → Vàng         (threshold 1500pt → Bạch kim)
     platinum → Bạch kim     (đỉnh — không có next)

   Không tạo route mới. Không phá layout user.
   ================================================================ */

'use strict';

/* ================================================================
   0. TIER CONFIG
   ================================================================ */
const TIER_CONFIG = {
    none: {
        label:     'Thành viên',
        labelShort:'MEMBER',
        icon:      'fas fa-user',
        color:     '#9CA3AF',
        cardClass: 'tier-none',
        threshold: 200,
        nextLabel: 'Bạc',
        nextIcon:  'fas fa-medal',
        gradient:  'linear-gradient(135deg,#1F2937 0%,#374151 55%,#4B5563 100%)',
    },
    silver: {
        label:     'Bạc',
        labelShort:'SILVER',
        icon:      'fas fa-medal',
        color:     '#9CA3AF',
        cardClass: 'tier-silver',
        threshold: 500,
        nextLabel: 'Vàng',
        nextIcon:  'fas fa-medal',
        gradient:  'linear-gradient(135deg,#374151 0%,#6B7280 50%,#9CA3AF 100%)',
    },
    gold: {
        label:     'Vàng',
        labelShort:'GOLD',
        icon:      'fas fa-medal',
        color:     '#F59E0B',
        cardClass: 'tier-gold',
        threshold: 1500,
        nextLabel: 'Bạch kim',
        nextIcon:  'fas fa-gem',
        gradient:  'linear-gradient(135deg,#78350F 0%,#D97706 50%,#FCD34D 100%)',
    },
    platinum: {
        label:     'Bạch kim',
        labelShort:'PLATINUM',
        icon:      'fas fa-gem',
        color:     '#A78BFA',
        cardClass: 'tier-platinum',
        threshold: null,
        nextLabel: null,
        nextIcon:  null,
        gradient:  'linear-gradient(135deg,#1E1B4B 0%,#4C1D95 40%,#7C3AED 70%,#A78BFA 100%)',
    },
};

/* Perks per tier — define active perks by minimum tier required */
const PERKS_DEF = [
    {
        icon:       '🎁',
        name:       'Tích điểm đơn hàng',
        desc:       '1 điểm cho mỗi 10.000₫ chi tiêu',
        minTier:    'none',
    },
    {
        icon:       '🏷️',
        name:       'Mã giảm giá riêng',
        desc:       'Nhận voucher độc quyền hàng tuần',
        minTier:    'silver',
    },
    {
        icon:       '⚡',
        name:       'Ưu tiên phục vụ',
        desc:       'Được phục vụ trước trong giờ cao điểm',
        minTier:    'gold',
    },
    {
        icon:       '💎',
        name:       'Concierge cá nhân',
        desc:       'Nhân viên phục vụ riêng tận bàn',
        minTier:    'platinum',
    },
];

const TIER_ORDER = ['none', 'silver', 'gold', 'platinum'];


/* ================================================================
   1. ENTRY POINT
   ================================================================ */
document.addEventListener('DOMContentLoaded', function profileInit() {
    try {
        initRefreshBtn();
        loadProfile();
    } catch (err) {
        console.error('[Profile] Init error:', err.message);
    }
});


/* ================================================================
   2. LOAD PROFILE — GET /api/user/profile-details
      GoMeal.safeFetch() tự động gắn Authorization: Bearer <authToken>
   ================================================================ */
async function loadProfile() {
    try {
        _setSkeletonMode(true);

        const result = await GoMeal.safeFetch('/api/user/profile-details');

        if (!result.ok) {
            if (result.status === 401 || result.status === 403) {
                showToast('Phiên đăng nhập hết hạn. Đang chuyển hướng...', 'error');
                setTimeout(function () {
                    window.location.href = '/views/auth/login.html';
                }, 1800);
            } else {
                showToast('Không thể tải hồ sơ. Vui lòng thử lại.', 'error');
                _setSkeletonMode(false);
            }
            return;
        }

        const profile = result.data;
        if (!profile) {
            showToast('Không có dữ liệu hồ sơ.', 'error');
            _setSkeletonMode(false);
            return;
        }

        /* Normalize */
        const tier   = _normalizeTier(profile.membership_level);
        const points = Math.max(0, Number(profile.total_points) || 0);
        const cfg    = TIER_CONFIG[tier];

        /* Render từng section */
        renderVipCard(profile, tier, cfg, points);
        renderPersonalInfo(profile, tier, cfg);
        renderStatsGrid(profile, tier, points);
        renderPointsBreakdown(tier, cfg, points);
        renderRoadmap(tier, points);
        renderPerks(tier);

        _setSkeletonMode(false);

    } catch (err) {
        console.error('[Profile] loadProfile:', err.message);
        showToast('Lỗi kết nối. Vui lòng thử lại.', 'error');
        _setSkeletonMode(false);
    }
}


/* ================================================================
   3. RENDER VIP CARD
   ================================================================ */
function renderVipCard(profile, tier, cfg, points) {
    try {
        const card = document.getElementById('pfVipCard');
        if (!card) return;

        /* Đặt class tier */
        card.className = 'pf-vip-card ' + cfg.cardClass;

        /* Tier badge */
        const tierIcon  = document.getElementById('pfVipTierIcon');
        const tierLabel = document.getElementById('pfVipTierLabel');
        if (tierIcon)  tierIcon.className  = cfg.icon;
        if (tierLabel) tierLabel.textContent = cfg.labelShort;

        /* Member name */
        const nameEl = document.getElementById('pfVipName');
        if (nameEl) nameEl.textContent = profile.name || 'Thành viên';

        /* Points — animate counter */
        const pointsEl = document.getElementById('pfVipPoints');
        if (pointsEl) animateNumber(pointsEl, 0, points, 1200);

        /* Progress bar */
        const prog = computeProgress(tier, cfg, points);
        _renderVipProgress(prog, tier);

        /* Member ID */
        const memberIdEl = document.getElementById('pfVipMemberId');
        if (memberIdEl) {
            const rawId = profile.customer_id || 0;
            memberIdEl.textContent = 'ID ' + String(rawId).padStart(6, '0');
        }

    } catch (err) {
        console.warn('[Profile] renderVipCard:', err.message);
    }
}

function _renderVipProgress(prog, tier) {
    try {
        const hintEl = document.getElementById('pfVipProgressHint');
        const pctEl  = document.getElementById('pfVipProgressPct');
        const fillEl = document.getElementById('pfVipProgressFill');

        if (hintEl) hintEl.textContent = prog.hint;
        if (pctEl)  pctEl.textContent  = prog.pct + '%';

        /* Animate bar after paint */
        if (fillEl) {
            fillEl.style.width = '0%';
            setTimeout(function () {
                fillEl.style.width = prog.pct + '%';
            }, 180);
        }

    } catch (_) {}
}


/* ================================================================
   4. RENDER PERSONAL INFO
   ================================================================ */
function renderPersonalInfo(profile, tier, cfg) {
    try {
        const name    = profile.name         || '';
        const email   = profile.email        || '';
        const phone   = profile.phone_number || '';
        const address = profile.address      || '';
        const initial = name.trim().charAt(0).toUpperCase() || '?';

        /* Avatar */
        const initEl = document.getElementById('pfAvatarInitial');
        if (initEl) initEl.textContent = initial;

        const avatarNameEl = document.getElementById('pfAvatarName');
        if (avatarNameEl) avatarNameEl.textContent = name || 'Thành viên';

        const avatarEmailEl = document.getElementById('pfAvatarEmail');
        if (avatarEmailEl) {
            avatarEmailEl.innerHTML = `<i class="fas fa-envelope"></i> ${_esc(email || '—')}`;
        }

        /* Topbar sync */
        const topbarName = document.getElementById('topbarUserName');
        if (topbarName && name) {
            topbarName.textContent  = name;
            topbarName.style.display = 'inline';
        }

        /* Fields */
        _setField('pfFieldName',    name,    'Chưa cập nhật');
        _setField('pfFieldPhone',   phone,   'Chưa có số điện thoại');
        _setField('pfFieldEmail',   email,   'Chưa có email');
        _setField('pfFieldAddress', address, 'Chưa có địa chỉ');
        _setField('pfFieldTier',    _tierBadgeHTML(tier, cfg), null, true);
        _setField('pfFieldLastOrder',
            profile.last_order_at ? _fmtDateTime(profile.last_order_at) : null,
            'Chưa có đơn hàng nào'
        );

    } catch (err) {
        console.warn('[Profile] renderPersonalInfo:', err.message);
    }
}

function _tierBadgeHTML(tier, cfg) {
    return `<span style="display:inline-flex;align-items:center;gap:7px">
        <i class="${cfg.icon}" style="color:${cfg.color};font-size:.78rem"></i>
        ${_esc(cfg.label)}
    </span>`;
}

function _setField(id, value, placeholder, isHTML) {
    try {
        const el = document.getElementById(id);
        if (!el) return;

        /* Remove skeleton */
        el.classList.remove('pf-sk', 'pf-sk-field');

        if (value) {
            el.classList.remove('empty');
            if (isHTML) {
                el.innerHTML = value;
            } else {
                el.textContent = value;
            }
        } else {
            el.classList.add('empty');
            el.textContent = placeholder || '—';
        }
    } catch (_) {}
}


/* ================================================================
   5. RENDER STATS GRID — 4 quick stat cards
   ================================================================ */
function renderStatsGrid(profile, tier, points) {
    try {
        const grid = document.getElementById('pfStatsGrid');
        if (!grid) return;

        const cfg          = TIER_CONFIG[tier];
        const prog         = computeProgress(tier, cfg, points);
        const lastOrder    = profile.last_order_at ? _timeAgo(profile.last_order_at) : '—';
        const tierRank     = TIER_ORDER.indexOf(tier) + 1;

        grid.innerHTML = `
            <div class="pf-stat-item">
                <div class="pf-stat-val orange">${points.toLocaleString('vi-VN')}</div>
                <div class="pf-stat-label">Tổng điểm</div>
            </div>
            <div class="pf-stat-item">
                <div class="pf-stat-val">${tierRank}/4</div>
                <div class="pf-stat-label">Hạng hiện tại</div>
            </div>
            <div class="pf-stat-item">
                <div class="pf-stat-val orange">${prog.pct}%</div>
                <div class="pf-stat-label">Tiến trình</div>
            </div>
            <div class="pf-stat-item">
                <div class="pf-stat-val" style="font-size:.88rem">${_esc(lastOrder)}</div>
                <div class="pf-stat-label">Đặt gần nhất</div>
            </div>
        `;

    } catch (err) {
        console.warn('[Profile] renderStatsGrid:', err.message);
    }
}


/* ================================================================
   6. RENDER POINTS BREAKDOWN
   ================================================================ */
function renderPointsBreakdown(tier, cfg, points) {
    try {
        /* Big number counter */
        const bigEl = document.getElementById('pfPointsBig');
        if (bigEl) animateNumber(bigEl, 0, points, 1400);

        /* Progress bar */
        const prog = computeProgress(tier, cfg, points);

        const labelEl = document.getElementById('pfProgressLabel');
        const pctEl   = document.getElementById('pfProgressPct');
        const fillEl  = document.getElementById('pfProgressFill');

        if (labelEl) labelEl.textContent = prog.label;
        if (pctEl)   pctEl.textContent   = prog.pct + '%';
        if (fillEl) {
            fillEl.style.width = '0%';
            setTimeout(function () { fillEl.style.width = prog.pct + '%'; }, 250);
        }

        /* Hint line */
        const hintIconEl = document.getElementById('pfProgressHintIcon');
        const hintTextEl = document.getElementById('pfProgressHintText');
        const hintEl     = document.getElementById('pfProgressHint');

        if (hintTextEl) hintTextEl.textContent = prog.hint;
        if (hintEl && prog.pct >= 100) hintEl.classList.add('complete');

        if (hintIconEl) {
            hintIconEl.className = prog.pct >= 100
                ? 'fas fa-circle-check'
                : 'fas fa-arrow-right';
        }

        /* Points items */
        const itemsEl = document.getElementById('pfPointsItems');
        if (itemsEl) {
            const remaining = cfg.threshold != null
                ? Math.max(0, cfg.threshold - points)
                : 0;

            itemsEl.innerHTML = `
                <div class="pf-points-item">
                    <div class="pf-pi-icon earned">
                        <i class="fas fa-coins"></i>
                    </div>
                    <div class="pf-pi-body">
                        <p class="pf-pi-title">Điểm tích lũy hiện tại</p>
                        <p class="pf-pi-sub">Từ các đơn hàng đã đặt</p>
                    </div>
                    <span class="pf-pi-val">${points.toLocaleString('vi-VN')} đ</span>
                </div>

                ${cfg.threshold != null ? `
                <div class="pf-points-item">
                    <div class="pf-pi-icon info">
                        <i class="fas fa-flag-checkered"></i>
                    </div>
                    <div class="pf-pi-body">
                        <p class="pf-pi-title">Ngưỡng lên hạng ${_esc(cfg.nextLabel || '')}</p>
                        <p class="pf-pi-sub">Cần đạt để lên hạng kế tiếp</p>
                    </div>
                    <span class="pf-pi-val">${Number(cfg.threshold).toLocaleString('vi-VN')} đ</span>
                </div>

                <div class="pf-points-item">
                    <div class="pf-pi-icon next">
                        <i class="fas fa-arrow-up"></i>
                    </div>
                    <div class="pf-pi-body">
                        <p class="pf-pi-title">Còn thiếu để lên hạng</p>
                        <p class="pf-pi-sub">Đặt thêm món để tích điểm</p>
                    </div>
                    <span class="pf-pi-val">${remaining > 0 ? remaining.toLocaleString('vi-VN') + ' đ' : '✅ Đủ'}</span>
                </div>
                ` : `
                <div class="pf-points-item">
                    <div class="pf-pi-icon next">
                        <i class="fas fa-gem"></i>
                    </div>
                    <div class="pf-pi-body">
                        <p class="pf-pi-title">Hạng cao nhất — Bạch Kim</p>
                        <p class="pf-pi-sub">Bạn đã đạt đỉnh cao thành viên!</p>
                    </div>
                    <span class="pf-pi-val">🏆 MAX</span>
                </div>
                `}
            `;
        }

    } catch (err) {
        console.warn('[Profile] renderPointsBreakdown:', err.message);
    }
}


/* ================================================================
   7. COMPUTE PROGRESS — Tính tiến trình lên hạng kế
   ================================================================ */
function computeProgress(tier, cfg, points) {
    /* Platinum = max tier */
    if (tier === 'platinum' || cfg.threshold == null) {
        return {
            pct:   100,
            label: 'Hạng cao nhất — Bạch Kim',
            hint:  '🏆 Bạn đã đạt hạng cao nhất!',
        };
    }

    const threshold = Number(cfg.threshold);
    const pct       = Math.min(Math.round((points / threshold) * 100), 100);
    const needed    = Math.max(0, threshold - points);

    return {
        pct,
        label: 'Tiến trình lên hạng ' + (cfg.nextLabel || ''),
        hint:  needed > 0
            ? 'Còn thiếu ' + needed.toLocaleString('vi-VN') + ' điểm để lên hạng ' + (cfg.nextLabel || '')
            : '✅ Đã đủ điểm lên hạng ' + (cfg.nextLabel || ''),
    };
}


/* ================================================================
   8. RENDER ROADMAP — Lộ trình hạng thành viên
   ================================================================ */
function renderRoadmap(currentTier, points) {
    try {
        const wrap = document.getElementById('pfRoadmapSteps');
        if (!wrap) return;

        const currentIdx = TIER_ORDER.indexOf(currentTier);

        const steps = TIER_ORDER.map(function (tier, idx) {
            const cfg  = TIER_CONFIG[tier];
            let state  = 'locked';

            if (idx < currentIdx)  state = 'done';
            if (idx === currentIdx) state = 'active';

            const prevTier      = idx > 0 ? TIER_CONFIG[TIER_ORDER[idx - 1]] : null;
            const prevThreshold = prevTier ? prevTier.threshold : 0;
            const ptRange       = cfg.threshold != null
                ? (prevThreshold || 0) + '–' + cfg.threshold + ' điểm'
                : (prevThreshold || 0) + '+ điểm';

            const icons = {
                done:   '<i class="fas fa-check"></i>',
                active: '<i class="' + cfg.icon + '"></i>',
                locked: '<i class="fas fa-lock"></i>',
            };

            const desc = {
                none:     'Chào mừng bạn đến GoMeal! Tích điểm ngay.',
                silver:   'Nhận voucher độc quyền & ưu tiên phục vụ.',
                gold:     'Chiết khấu đặc biệt & bàn VIP ưu tiên.',
                platinum: 'Quyền lợi cao nhất — Concierge cá nhân.',
            };

            return `
                <div class="pf-roadmap-step">
                    <div class="pf-roadmap-dot-wrap">
                        <div class="pf-roadmap-dot ${state}">
                            ${icons[state]}
                        </div>
                    </div>
                    <div class="pf-roadmap-info">
                        <p class="pf-roadmap-tier-name ${state === 'locked' ? 'locked' : ''}">
                            <i class="${cfg.icon}" style="color:${cfg.color};font-size:.78rem;margin-right:5px"></i>
                            ${_esc(cfg.label)}
                            ${state === 'active' ? '<span style="font-size:.6rem;background:#FFF3EE;color:#FF6B35;padding:2px 8px;border-radius:99px;font-weight:800;margin-left:6px;vertical-align:middle">Hiện tại</span>' : ''}
                            ${state === 'done'   ? '<span style="font-size:.6rem;background:#ECFDF5;color:#059669;padding:2px 8px;border-radius:99px;font-weight:800;margin-left:6px;vertical-align:middle">Đã đạt</span>' : ''}
                        </p>
                        <p class="pf-roadmap-tier-desc">${_esc(desc[tier] || '')}</p>
                        <span class="pf-roadmap-tier-pts ${state === 'done' ? 'done' : ''}">
                            ${state === 'done' ? '✅ ' : ''}${_esc(ptRange)}
                        </span>
                    </div>
                </div>
            `;
        });

        wrap.innerHTML = steps.join('');

    } catch (err) {
        console.warn('[Profile] renderRoadmap:', err.message);
    }
}


/* ================================================================
   9. RENDER PERKS — Quyền lợi theo hạng
   ================================================================ */
function renderPerks(currentTier) {
    try {
        const grid = document.getElementById('pfPerksGrid');
        if (!grid) return;

        const currentIdx = TIER_ORDER.indexOf(currentTier);

        const html = PERKS_DEF.map(function (perk) {
            const minIdx  = TIER_ORDER.indexOf(perk.minTier);
            const isActive = currentIdx >= minIdx;

            return `
                <div class="pf-perk-item ${isActive ? 'active' : 'locked'}">
                    <div class="pf-perk-icon">${perk.icon}</div>
                    <p class="pf-perk-name">${_esc(perk.name)}</p>
                    <p class="pf-perk-desc">${_esc(perk.desc)}</p>
                    <span class="pf-perk-status ${isActive ? 'active' : 'locked'}">
                        ${isActive
                            ? '<i class="fas fa-circle-check" style="font-size:.6rem"></i> Đã mở khóa'
                            : '<i class="fas fa-lock" style="font-size:.6rem"></i> Cần hạng ' + _esc(TIER_CONFIG[perk.minTier].label)}
                    </span>
                </div>
            `;
        }).join('');

        grid.innerHTML = html;

    } catch (err) {
        console.warn('[Profile] renderPerks:', err.message);
    }
}


/* ================================================================
   10. ANIMATE NUMBER — Counter effect
   ================================================================ */
function animateNumber(el, from, to, duration) {
    try {
        if (!el) return;
        const startTime = performance.now();
        const diff      = to - from;

        function step(now) {
            try {
                const elapsed = now - startTime;
                const progress = Math.min(elapsed / duration, 1);
                /* easeOutCubic */
                const ease = 1 - Math.pow(1 - progress, 3);
                const current = Math.round(from + diff * ease);
                el.textContent = current.toLocaleString('vi-VN');
                if (progress < 1) requestAnimationFrame(step);
            } catch (_) {}
        }

        requestAnimationFrame(step);

    } catch (_) {
        if (el) el.textContent = to.toLocaleString('vi-VN');
    }
}


/* ================================================================
   11. SKELETON MODE
   ================================================================ */
function _setSkeletonMode(on) {
    try {
        /* Khi loading xong, skeleton classes đã bị xoá bởi _setField.
           Chỉ cần control visibility của các skeleton blocks trong grid/items. */
        if (!on) {
            /* Remove inline skeletons còn sót */
            document.querySelectorAll('.pf-sk').forEach(function (el) {
                el.classList.remove('pf-sk');
            });
        }
    } catch (_) {}
}


/* ================================================================
   12. REFRESH BUTTON
   ================================================================ */
function initRefreshBtn() {
    try {
        const btn  = document.getElementById('refreshBtn');
        const icon = document.getElementById('refreshIcon');
        if (!btn) return;

        btn.addEventListener('click', async function () {
            try {
                if (icon) {
                    icon.style.transition = 'transform .65s ease';
                    icon.style.transform  = 'rotate(360deg)';
                    setTimeout(function () {
                        try {
                            icon.style.transform  = 'rotate(0deg)';
                            icon.style.transition = '';
                        } catch (_) {}
                    }, 700);
                }
                await loadProfile();
                showToast('Hồ sơ đã được cập nhật', 'success');
            } catch (_) {}
        });

    } catch (err) {
        console.warn('[Profile] initRefreshBtn:', err.message);
    }
}


/* ================================================================
   13. TOAST
   ================================================================ */
function showToast(msg, type) {
    try {
        const container = document.getElementById('pfToastContainer');
        if (!container) return;

        const iconMap = {
            success: 'fa-circle-check',
            error:   'fa-circle-xmark',
            warning: 'fa-triangle-exclamation',
            info:    'fa-circle-info',
        };
        const icon = iconMap[type] || 'fa-circle-info';

        const toast = document.createElement('div');
        toast.className = 'pf-toast ' + (type || 'info');
        toast.innerHTML = `<i class="fas ${icon}"></i><span style="flex:1">${_esc(msg)}</span>`;

        container.appendChild(toast);

        setTimeout(function () {
            try {
                toast.style.opacity   = '0';
                toast.style.transform = 'translateX(14px)';
                toast.style.transition = 'all .25s ease';
                setTimeout(function () { try { toast.remove(); } catch (_) {} }, 260);
            } catch (_) {}
        }, 3500);

    } catch (_) {}
}


/* ================================================================
   14. UTILITIES
   ================================================================ */
function _normalizeTier(raw) {
    const val = (raw || 'none').toLowerCase().trim();
    return TIER_CONFIG[val] ? val : 'none';
}

function _esc(str) {
    try {
        return String(str || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    } catch (_) { return ''; }
}

function _fmtDateTime(dateStr) {
    try {
        const d = new Date(dateStr);
        if (isNaN(d)) return '—';
        const pad = function (n) { return String(n).padStart(2, '0'); };
        return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch (_) { return '—'; }
}

function _timeAgo(dateStr) {
    try {
        const diff  = Math.max(0, Date.now() - new Date(dateStr).getTime());
        const mins  = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days  = Math.floor(diff / 86400000);
        if (mins  < 1)  return 'Vừa xong';
        if (mins  < 60) return mins  + ' phút trước';
        if (hours < 24) return hours + ' giờ trước';
        if (days  < 7)  return days  + ' ngày trước';
        return _fmtDateTime(dateStr).split(' ')[0];
    } catch (_) { return '—'; }
}


/* ================================================================
   15. EXPOSE PUBLIC
   ================================================================ */
window.ProfilePage = {
    loadProfile:          loadProfile,
    renderVipCard:        renderVipCard,
    renderPersonalInfo:   renderPersonalInfo,
    renderStatsGrid:      renderStatsGrid,
    renderPointsBreakdown:renderPointsBreakdown,
    renderRoadmap:        renderRoadmap,
    renderPerks:          renderPerks,
    computeProgress:      computeProgress,
    showToast:            showToast,
};