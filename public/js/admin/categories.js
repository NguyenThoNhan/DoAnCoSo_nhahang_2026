/**
 * categories.js — Admin Categories Management
 * Sprint 3 / Phase 3
 *
 * APIs:
 *   GET    /api/admin/categories
 *   POST   /api/admin/categories       { name, description, image_url }
 *   PUT    /api/admin/categories/:id   { name, description, image_url, is_active }
 *   DELETE /api/admin/categories/:id
 *
 * Category fields: id, name, description, image_url, is_active
 *
 * Delete constraint:
 *   Backend trả 500 khi danh mục có món ăn (FK constraint).
 *   → Hiển thị: "Danh mục đang có món ăn, không thể xóa!"
 *
 * image_url dùng để lưu emoji (VD: "🍔") — không upload file.
 */

'use strict';

/* ─────────────────────────────────────────
   CONFIG
───────────────────────────────────────── */
const API = '/api/admin';

/* ─────────────────────────────────────────
   EMOJI PALETTE
───────────────────────────────────────── */
const EMOJIS = [
    '🍽️','🍔','🍕','🌮','🌯','🍜','🍝','🍛',
    '🍣','🍤','🍗','🥩','🥗','🥘','🍲','🫕',
    '🥞','🧇','🥐','🥖','🍞','🧀','🥪','🌭',
    '🍟','🌶️','🫑','🧅','🧄','🥦','🥕','🫛',
    '🍱','🍘','🍙','🍚','🍞','🫔','🥙','🧆',
    '🍦','🍧','🍨','🍰','🎂','🧁','🍮','🍯',
    '☕','🍵','🧋','🥤','🍹','🍸','🥂','🍾',
    '🧃','🍺','🫖','🥛','🍼','🫗','🧊','🫙',
];
const DEFAULT_EMOJI = '🍽️';

/* ─────────────────────────────────────────
   STATE
───────────────────────────────────────── */
let _cats      = [];        // full list from server
let _filtered  = [];        // displayed list
let _filterKey = 'all';     // 'all' | 'active' | 'inactive'
let _search    = '';
let _editingId = null;      // null = create mode
let _deleteId  = null;
let _selEmoji  = DEFAULT_EMOJI;
let _emojiOpen = false;

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */
function escHtml(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

function isActive(cat) {
    return Number(cat.is_active) === 1;
}

/* ─────────────────────────────────────────
   TOAST
───────────────────────────────────────── */
function toast(msg, type = 'success') {
    const cfg = {
        success: { ico: 'circle-check',          color: '#10B981' },
        error:   { ico: 'triangle-exclamation',  color: '#EF4444' },
        warning: { ico: 'triangle-exclamation',  color: '#F59E0B' },
        info:    { ico: 'circle-info',            color: '#3B82F6' },
    };
    const { ico, color } = cfg[type] || cfg.info;
    const el = document.createElement('div');
    el.style.cssText = [
        'display:flex;align-items:center;gap:10px',
        'padding:12px 18px;border-radius:12px',
        'background:var(--color-white)',
        'box-shadow:0 8px 30px rgba(0,0,0,0.14)',
        `border-left:4px solid ${color}`,
        'font-family:var(--font-primary);font-size:14px',
        'color:var(--color-gray-800);max-width:360px',
        'pointer-events:all;animation:toast-in 0.3s ease',
    ].join(';');
    el.innerHTML = `
        <i class="fas fa-${ico}" style="color:${color};font-size:1rem;flex-shrink:0"></i>
        <span style="flex:1;line-height:1.4">${escHtml(msg)}</span>
        <button onclick="this.parentElement.remove()"
            style="background:none;border:none;cursor:pointer;color:var(--color-gray-400);font-size:0.8rem;flex-shrink:0;padding:0">
            <i class="fas fa-xmark"></i></button>`;
    if (!document.getElementById('_toastStyle')) {
        const s = document.createElement('style');
        s.id = '_toastStyle';
        s.textContent = '@keyframes toast-in{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}';
        document.head.appendChild(s);
    }
    document.getElementById('toastContainer')?.appendChild(el);
    setTimeout(() => el.remove(), 4500);
}

/* ─────────────────────────────────────────
   API FETCH
───────────────────────────────────────── */
async function apiFetch(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...GoMeal.getAuthHeader(),
        ...(options.headers || {}),
    };
    const res  = await fetch(`${API}${endpoint}`, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.message || `HTTP ${res.status}`), { status: res.status, data });
    return data;
}

/* ─────────────────────────────────────────
   LOAD DATA
───────────────────────────────────────── */
async function loadCategories() {
    showSkeleton();
    try {
        _cats = await apiFetch('/categories') || [];
        applyFilter();
        updateStats();
    } catch (err) {
        console.error('[Categories] Load error:', err);
        toast('Không thể tải danh mục: ' + err.message, 'error');
        document.getElementById('catGrid').innerHTML = `
            <div class="cat-empty">
                <div class="ce-icon"><i class="fas fa-triangle-exclamation"></i></div>
                <div class="ce-title">Lỗi tải dữ liệu</div>
                <div class="ce-desc">${escHtml(err.message)}</div>
            </div>`;
    }
}

/* ─────────────────────────────────────────
   STATS
───────────────────────────────────────── */
function updateStats() {
    const total    = _cats.length;
    const active   = _cats.filter(isActive).length;
    const inactive = total - active;
    setText('statTotal',    total);
    setText('statActive',   active);
    setText('statInactive', inactive);
    const el = document.getElementById('headCount');
    if (el) el.textContent = `(${total})`;
}

/* ─────────────────────────────────────────
   FILTER + RENDER
───────────────────────────────────────── */
function applyFilter() {
    _filtered = _cats.filter(cat => {
        if (_filterKey === 'active'   && !isActive(cat))   return false;
        if (_filterKey === 'inactive' && isActive(cat))    return false;
        if (_search && !cat.name.toLowerCase().includes(_search.toLowerCase())) return false;
        return true;
    });
    setText('resultCount', _filtered.length);
    renderGrid();
}

/* ─────────────────────────────────────────
   RENDER GRID
───────────────────────────────────────── */
function renderGrid() {
    const grid = document.getElementById('catGrid');
    if (!grid) return;

    if (!_filtered.length) {
        grid.innerHTML = `
            <div class="cat-empty">
                <div class="ce-icon"><i class="fas fa-folder-open"></i></div>
                <div class="ce-title">Không tìm thấy danh mục</div>
                <div class="ce-desc">Thử thay đổi bộ lọc hoặc thêm danh mục mới.</div>
            </div>`;
        return;
    }

    grid.innerHTML = _filtered.map(cat => catCardHtml(cat)).join('');
}

function catCardHtml(cat) {
    const active   = isActive(cat);
    const emoji    = cat.image_url || DEFAULT_EMOJI;
    const isSelected = _editingId === cat.id;

    return `
    <div class="cat-card ${!active ? 'cc-inactive' : ''} ${isSelected ? 'cc-selected' : ''}"
         data-id="${cat.id}"
         onclick="selectCard(${cat.id})">

        <!-- Inactive badge -->
        ${!active ? `<div class="cc-inactive-badge"><i class="fas fa-eye-slash"></i></div>` : ''}

        <!-- Emoji circle with active dot -->
        <div class="cc-icon-circle">
            <span style="font-size:1.8rem;line-height:1">${escHtml(emoji)}</span>
            ${active ? `<div class="cc-active-dot" title="Đang hoạt động"></div>` : ''}
        </div>

        <!-- Name -->
        <div class="cc-name">${escHtml(cat.name)}</div>

        <!-- Desc -->
        <div class="cc-desc">${escHtml(cat.description || 'Chưa có mô tả')}</div>

        <!-- Status badge -->
        <div class="cc-food-count">
            ${active
                ? `<i class="fas fa-circle" style="font-size:6px;color:var(--color-success);margin-right:3px"></i> Hoạt động`
                : `<i class="fas fa-eye-slash" style="font-size:8px;color:var(--color-gray-400);margin-right:3px"></i> Đã ẩn`}
        </div>

        <!-- Hover actions -->
        <div class="cc-actions" onclick="event.stopPropagation()">
            <button class="btn btn-secondary btn-sm"
                    onclick="selectCard(${cat.id})"
                    title="Chỉnh sửa"
                    style="padding:0.3rem 0.7rem;font-size:0.7rem">
                <i class="fas fa-pen"></i>
            </button>
            <button class="btn btn-danger btn-sm"
                    onclick="openDeleteModal(${cat.id}, '${escHtml(cat.name)}')"
                    title="Xoá"
                    style="padding:0.3rem 0.7rem;font-size:0.7rem">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    </div>`;
}

/* ─────────────────────────────────────────
   SKELETON
───────────────────────────────────────── */
function showSkeleton() {
    const grid = document.getElementById('catGrid');
    if (!grid) return;
    grid.innerHTML = Array(8).fill(0).map(() => `
        <div class="cat-card" style="pointer-events:none">
            <div class="sk-block skeleton" style="width:62px;height:62px;border-radius:50%"></div>
            <div class="sk-block skeleton" style="width:80%;height:14px;margin-top:6px"></div>
            <div class="sk-block skeleton" style="width:100%;height:10px"></div>
            <div class="sk-block skeleton" style="width:60%;height:10px"></div>
            <div class="sk-block skeleton" style="width:70px;height:18px;border-radius:99px;margin-top:4px"></div>
        </div>`).join('');
}

/* ─────────────────────────────────────────
   SELECT CARD → populate panel
───────────────────────────────────────── */
function selectCard(id) {
    const cat = _cats.find(c => c.id === id);
    if (!cat) return;

    _editingId = id;

    // Highlight selected card
    document.querySelectorAll('.cat-card').forEach(el => {
        el.classList.toggle('cc-selected', Number(el.dataset.id) === id);
    });

    // Fill panel
    document.getElementById('catId').value   = cat.id;
    document.getElementById('catName').value  = cat.name || '';
    document.getElementById('catDesc').value  = cat.description || '';

    const active = isActive(cat);
    const toggle = document.getElementById('catActive');
    if (toggle) toggle.checked = active;
    syncToggleUI(active);

    // Emoji
    _selEmoji = cat.image_url || DEFAULT_EMOJI;
    updateEmojiPreview(_selEmoji);
    highlightEmoji(_selEmoji);

    // Panel head
    setPanelMode('edit', cat.name);
    document.getElementById('errCatName').style.display = 'none';

    // Scroll panel into view on mobile
    document.getElementById('catPanel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ─────────────────────────────────────────
   PANEL MODE helpers
───────────────────────────────────────── */
function setPanelMode(mode, name = '') {
    const isEdit    = mode === 'edit';
    const head      = document.getElementById('panelHead');
    const headIco   = document.getElementById('panelHeadIco');
    const title     = document.getElementById('panelTitle');
    const sub       = document.getElementById('panelSub');
    const delBtn    = document.getElementById('btnPanelDelete');
    const saveText  = document.getElementById('btnSaveText');

    head.classList.toggle('cph-editing', isEdit);
    headIco.innerHTML = isEdit ? '<i class="fas fa-pen"></i>' : '<i class="fas fa-plus"></i>';
    title.textContent = isEdit ? `Chỉnh sửa: ${name}` : 'Thêm danh mục mới';
    sub.textContent   = isEdit ? `ID #${_editingId} · Đang chỉnh sửa` : 'Điền thông tin bên dưới';
    delBtn.style.display  = isEdit ? 'inline-flex' : 'none';
    saveText.textContent  = isEdit ? 'Lưu thay đổi' : 'Thêm mới';
}

/* ─────────────────────────────────────────
   RESET PANEL → create mode
───────────────────────────────────────── */
function resetPanel() {
    _editingId = null;
    document.getElementById('catId').value   = '';
    document.getElementById('catName').value  = '';
    document.getElementById('catDesc').value  = '';
    document.getElementById('catActive').checked = true;
    syncToggleUI(true);
    _selEmoji = DEFAULT_EMOJI;
    updateEmojiPreview(DEFAULT_EMOJI);
    highlightEmoji(DEFAULT_EMOJI);
    document.getElementById('errCatName').style.display = 'none';
    setPanelMode('create');
    // Deselect all cards
    document.querySelectorAll('.cat-card').forEach(el => el.classList.remove('cc-selected'));
}

/* ─────────────────────────────────────────
   TOGGLE UI SYNC
───────────────────────────────────────── */
function syncToggleUI(active) {
    const dot  = document.getElementById('atrDot');
    const hint = document.getElementById('atrHint');
    if (dot)  dot.classList.toggle('atr-off', !active);
    if (hint) hint.textContent = active
        ? 'Danh mục đang hiển thị trên menu'
        : 'Danh mục đang bị ẩn khỏi menu';
}

/* ─────────────────────────────────────────
   EMOJI PICKER
───────────────────────────────────────── */
function buildEmojiGrid() {
    const grid = document.getElementById('emojiGrid');
    if (!grid) return;
    grid.innerHTML = EMOJIS.map(e => `
        <div class="epw-item" data-emoji="${e}" onclick="pickEmoji('${e}')">${e}</div>
    `).join('');
}

function toggleEmojiPicker() {
    _emojiOpen = !_emojiOpen;
    const grid = document.getElementById('emojiGrid');
    const row  = document.getElementById('emojiToggleRow');
    grid?.classList.toggle('epg-open', _emojiOpen);
    row?.classList.toggle('epw-open', _emojiOpen);
}

function pickEmoji(emoji) {
    _selEmoji = emoji;
    updateEmojiPreview(emoji);
    highlightEmoji(emoji);
    // Auto-close picker
    _emojiOpen = false;
    document.getElementById('emojiGrid')?.classList.remove('epg-open');
    document.getElementById('emojiToggleRow')?.classList.remove('epw-open');
}

function updateEmojiPreview(emoji) {
    const prev  = document.getElementById('emojiPreview');
    const label = document.getElementById('emojiSelLabel');
    if (prev)  prev.textContent  = emoji;
    if (label) label.textContent = `${emoji} — Đã chọn`;
}

function highlightEmoji(emoji) {
    document.querySelectorAll('.epw-item').forEach(el => {
        el.classList.toggle('epwi-on', el.dataset.emoji === emoji);
    });
}

/* ─────────────────────────────────────────
   VALIDATE
───────────────────────────────────────── */
function validatePanel() {
    const name = document.getElementById('catName').value.trim();
    const errEl = document.getElementById('errCatName');
    if (!name) {
        errEl.textContent    = 'Vui lòng nhập tên danh mục';
        errEl.style.display  = 'flex';
        document.getElementById('catName').focus();
        return false;
    }
    errEl.style.display = 'none';
    return true;
}

/* ─────────────────────────────────────────
   SAVE (create or update)
───────────────────────────────────────── */
async function saveCategory() {
    if (!validatePanel()) return;

    const btn = document.getElementById('btnPanelSave');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    const payload = {
        name:        document.getElementById('catName').value.trim(),
        description: document.getElementById('catDesc').value.trim(),
        image_url:   _selEmoji,
        is_active:   document.getElementById('catActive').checked ? 1 : 0,
    };

    try {
        if (_editingId) {
            await apiFetch(`/categories/${_editingId}`, {
                method: 'PUT',
                body: JSON.stringify(payload),
            });
            toast(`Đã cập nhật danh mục "${payload.name}"`, 'success');
        } else {
            await apiFetch('/categories', {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            toast(`Đã thêm danh mục "${payload.name}"`, 'success');
        }

        await loadCategories();
        resetPanel();

    } catch (err) {
        console.error('[Categories] Save error:', err);
        toast('Lỗi lưu danh mục: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fas fa-check"></i> <span id="btnSaveText">${_editingId ? 'Lưu thay đổi' : 'Thêm mới'}</span>`;
    }
}

/* ─────────────────────────────────────────
   DELETE FLOW
───────────────────────────────────────── */
function openDeleteModal(id, name) {
    _deleteId = id;
    document.getElementById('deleteTargetName').textContent = name;
    openModal('deleteModal');
}

async function confirmDelete() {
    if (!_deleteId) return;

    const btn = document.getElementById('btnDeleteConfirm');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xoá...';

    try {
        await apiFetch(`/categories/${_deleteId}`, { method: 'DELETE' });
        toast('Đã xoá danh mục thành công', 'success');
        closeModal('deleteModal');
        _deleteId = null;

        // If was editing this cat → reset panel
        if (_editingId === _deleteId) resetPanel();

        await loadCategories();

    } catch (err) {
        console.error('[Categories] Delete error:', err);

        // FK constraint → friendly message
        const isFkError = err.status === 500 ||
            (err.message || '').toLowerCase().includes('món ăn') ||
            (err.data?.message || '').toLowerCase().includes('món ăn');

        toast(
            isFkError
                ? 'Danh mục đang có món ăn, không thể xóa!'
                : 'Lỗi xoá danh mục: ' + err.message,
            'error'
        );

    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-trash"></i> Xoá vĩnh viễn';
    }
}

/* ─────────────────────────────────────────
   MODAL HELPERS
───────────────────────────────────────── */
function openModal(id) {
    const el = document.getElementById(id);
    if (el) {
        el.style.display = '';          // remove 'none' if set inline
        requestAnimationFrame(() => el.classList.add('active'));
    }
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('active');
    setTimeout(() => { if (!el.classList.contains('active')) el.style.display = 'none'; }, 250);
}

/* ─────────────────────────────────────────
   INIT
───────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {

    // Build emoji grid
    buildEmojiGrid();
    updateEmojiPreview(DEFAULT_EMOJI);
    highlightEmoji(DEFAULT_EMOJI);

    // Load data
    loadCategories();

    // ── Toolbar ──
    document.getElementById('btnRefresh')?.addEventListener('click', loadCategories);
    document.getElementById('btnNew')?.addEventListener('click', resetPanel);

    // Search — dual inputs (topbar + toolbar)
    function handleSearch(val) {
        _search = val.trim();
        applyFilter();
    }
    let _sTimer;
    ['topbarSearch', 'searchInput'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', e => {
            clearTimeout(_sTimer);
            _sTimer = setTimeout(() => handleSearch(e.target.value), 260);
        });
    });

    // Status filter
    document.querySelectorAll('.ct-status-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.ct-status-btn').forEach(b => b.classList.remove('ctsb-on'));
            btn.classList.add('ctsb-on');
            _filterKey = btn.dataset.filter;
            applyFilter();
        });
    });

    // ── Panel ──
    document.getElementById('btnPanelSave')?.addEventListener('click', saveCategory);
    document.getElementById('btnPanelReset')?.addEventListener('click', resetPanel);
    document.getElementById('btnPanelDelete')?.addEventListener('click', () => {
        if (!_editingId) return;
        const cat = _cats.find(c => c.id === _editingId);
        if (cat) openDeleteModal(cat.id, cat.name);
    });

    // Toggle active switch → sync dot + hint
    document.getElementById('catActive')?.addEventListener('change', e => {
        syncToggleUI(e.target.checked);
    });

    // Emoji picker toggle
    document.getElementById('emojiToggleRow')?.addEventListener('click', toggleEmojiPicker);

    // ── Delete modal ──
    document.getElementById('deleteModalClose')?.addEventListener('click', () => closeModal('deleteModal'));
    document.getElementById('btnDeleteCancel')?.addEventListener('click',  () => closeModal('deleteModal'));
    document.getElementById('btnDeleteConfirm')?.addEventListener('click', confirmDelete);
    document.getElementById('deleteModal')?.addEventListener('click', e => {
        if (e.target === document.getElementById('deleteModal')) closeModal('deleteModal');
    });

    // ── ESC closes modal & resets picker ──
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            closeModal('deleteModal');
            if (_emojiOpen) {
                _emojiOpen = false;
                document.getElementById('emojiGrid')?.classList.remove('epg-open');
                document.getElementById('emojiToggleRow')?.classList.remove('epw-open');
            }
        }
        // Ctrl+Enter = save
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') saveCategory();
    });

    // ── Validate name on blur ──
    document.getElementById('catName')?.addEventListener('blur', () => {
        const val = document.getElementById('catName').value.trim();
        const err = document.getElementById('errCatName');
        if (!val) {
            err.textContent   = 'Vui lòng nhập tên danh mục';
            err.style.display = 'flex';
        } else {
            err.style.display = 'none';
        }
    });
    document.getElementById('catName')?.addEventListener('input', () => {
        const err = document.getElementById('errCatName');
        if (document.getElementById('catName').value.trim()) err.style.display = 'none';
    });
});

/* ─────────────────────────────────────────
   EXPOSE to inline onclick
───────────────────────────────────────── */
window.selectCard      = selectCard;
window.openDeleteModal = openDeleteModal;
window.pickEmoji       = pickEmoji;