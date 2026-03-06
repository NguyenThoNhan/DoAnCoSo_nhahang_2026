/**
 * foods.js — Admin Food Management
 * Sprint 3 / Phase 3
 *
 * APIs used:
 *   GET    /api/admin/foods
 *   POST   /api/admin/foods          (FormData — uploadMiddleware)
 *   PUT    /api/admin/foods/:id      (FormData — uploadMiddleware)
 *   DELETE /api/admin/foods/:id
 *   PUT    /api/admin/foods/:id/availability  { is_available }
 *   GET    /api/admin/categories
 *
 * Food fields: id, name, description, price, is_available, is_featured,
 *              image_url, category_id, category_name
 *
 * Upload note:
 *   - Backend uses uploadMiddleware (multer) — send as FormData
 *   - image_url is stored as path e.g. /uploads/foods/xxx.jpg
 *   - On edit: if no new file chosen → omit the 'image' field from FormData
 *     Backend then keeps final_image_url = currentFood.image_url
 */

'use strict';

/* ─────────────────────────────────────────────
   CONFIG
───────────────────────────────────────────── */
const API    = '/api/admin';
const IMG_FB = '/public/assets/food-placeholder.png'; // fallback image

/* ─────────────────────────────────────────────
   STATE
───────────────────────────────────────────── */
let _foods      = [];       // full list from server
let _categories = [];       // [{id, name}]
let _filtered   = [];       // current displayed list
let _viewMode   = 'grid';   // 'grid' | 'list'
let _filterCat  = 'all';    // category id or 'all'
let _filterAvail= 'all';    // 'all' | '1' | '0'
let _sortKey    = 'name_asc';
let _editingId  = null;     // null = create mode
let _deleteId   = null;
let _currentImageUrl = null; // image_url of food being edited

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */
const fmt = (n) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n || 0);

function escHtml(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function imgSrc(url) {
    if (!url) return null;
    // Already absolute
    if (url.startsWith('http') || url.startsWith('/uploads') || url.startsWith('/public')) return url;
    return '/uploads/foods/' + url;
}

/* ─────────────────────────────────────────────
   TOAST
───────────────────────────────────────────── */
function toast(msg, type = 'success') {
    const icons = { success: 'circle-check', error: 'triangle-exclamation', info: 'circle-info', warning: 'triangle-exclamation' };
    const colors = { success: '#10B981', error: '#EF4444', info: '#3B82F6', warning: '#F59E0B' };

    const el = document.createElement('div');
    el.style.cssText = `
        display:flex;align-items:center;gap:10px;
        padding:12px 18px;border-radius:12px;
        background:var(--color-white);
        box-shadow:0 8px 30px rgba(0,0,0,0.14);
        border-left:4px solid ${colors[type]};
        font-family:var(--font-primary);font-size:14px;
        color:var(--color-gray-800);max-width:340px;
        pointer-events:all;animation:toast-in 0.3s ease;
    `;
    el.innerHTML = `
        <i class="fas fa-${icons[type]}" style="color:${colors[type]};font-size:1rem;flex-shrink:0"></i>
        <span style="flex:1;line-height:1.4">${escHtml(msg)}</span>
        <button onclick="this.parentElement.remove()"
            style="background:none;border:none;cursor:pointer;color:var(--color-gray-400);font-size:0.8rem;flex-shrink:0;padding:0">
            <i class="fas fa-xmark"></i></button>
    `;
    const style = document.createElement('style');
    style.textContent = `@keyframes toast-in{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}`;
    document.head.appendChild(style);

    const container = document.getElementById('toastContainer');
    container?.appendChild(el);
    setTimeout(() => el.remove(), 4000);
}

/* ─────────────────────────────────────────────
   API FETCH
───────────────────────────────────────────── */
async function apiFetch(endpoint, options = {}) {
    const isFormData = options.body instanceof FormData;
    const headers = {
        ...GoMeal.getAuthHeader(),
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...(options.headers || {}),
    };
    const res = await fetch(`${API}${endpoint}`, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || `Lỗi ${res.status}`);
    return data;
}

/* ─────────────────────────────────────────────
   FETCH DATA
───────────────────────────────────────────── */
async function loadFoods() {
    showSkeleton();
    try {
        const [foods, categories] = await Promise.all([
            apiFetch('/foods'),
            apiFetch('/categories'),
        ]);
        _foods      = foods || [];
        _categories = categories || [];
        buildCategoryChips();
        applyFilter();
        updateStats();
    } catch (err) {
        console.error('[Foods] Load error:', err);
        toast('Không thể tải danh sách món ăn: ' + err.message, 'error');
        document.getElementById('foodsGrid').innerHTML = `
            <div class="foods-empty">
                <div class="fe-icon"><i class="fas fa-triangle-exclamation"></i></div>
                <div class="fe-title">Không thể tải dữ liệu</div>
                <div class="fe-desc">${escHtml(err.message)}</div>
            </div>`;
    }
}

/* ─────────────────────────────────────────────
   STATS
───────────────────────────────────────────── */
function updateStats() {
    const total    = _foods.length;
    const avail    = _foods.filter(f => Number(f.is_available) === 1).length;
    const unavail  = total - avail;
    const featured = _foods.filter(f => Number(f.is_featured) === 1).length;

    setText('statTotal',    total);
    setText('statAvail',    avail);
    setText('statUnavail',  unavail);
    setText('statFeatured', featured);
    document.getElementById('foodCount').textContent = `(${total})`;
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

/* ─────────────────────────────────────────────
   CATEGORY CHIPS
───────────────────────────────────────────── */
function buildCategoryChips() {
    const container = document.getElementById('catChips');
    if (!container) return;

    // Update "Tất cả" chip count
    const allChip = container.querySelector('[data-cat="all"] .ffb-chip-count');
    if (allChip) allChip.textContent = _foods.length;

    // Build counts per category
    const counts = {};
    _foods.forEach(f => {
        counts[f.category_id] = (counts[f.category_id] || 0) + 1;
    });

    // Remove old dynamic chips
    container.querySelectorAll('[data-cat]:not([data-cat="all"])').forEach(el => el.remove());

    _categories.forEach(cat => {
        const count = counts[cat.id] || 0;
        const chip  = document.createElement('button');
        chip.className = 'ffb-chip';
        chip.dataset.cat = cat.id;
        chip.innerHTML = `${escHtml(cat.name)} <span class="ffb-chip-count">${count}</span>`;
        chip.addEventListener('click', () => setCatFilter(cat.id, chip));
        container.appendChild(chip);
    });
}

function setCatFilter(catId, chipEl) {
    _filterCat = catId;
    document.querySelectorAll('.ffb-chip').forEach(c => c.classList.remove('ffbc-on'));
    chipEl.classList.add('ffbc-on');
    applyFilter();
    updateClearBtn();
}

/* ─────────────────────────────────────────────
   AVAILABILITY FILTER
───────────────────────────────────────────── */
function setAvailFilter(val, btnEl) {
    _filterAvail = val;
    document.querySelectorAll('.ffb-avail-btn').forEach(b => b.classList.remove('ffba-on'));
    btnEl.classList.add('ffba-on');
    applyFilter();
    updateClearBtn();
}

function updateClearBtn() {
    const active = _filterCat !== 'all' || _filterAvail !== 'all';
    const btn = document.getElementById('btnClearFilter');
    if (btn) btn.style.display = active ? 'flex' : 'none';
}

/* ─────────────────────────────────────────────
   FILTER + SORT + RENDER
───────────────────────────────────────────── */
function applyFilter() {
    const search = (document.getElementById('globalSearch')?.value || '').trim().toLowerCase();

    _filtered = _foods.filter(f => {
        // Category filter
        if (_filterCat !== 'all' && String(f.category_id) !== String(_filterCat)) return false;
        // Availability filter
        if (_filterAvail !== 'all' && String(Number(f.is_available)) !== _filterAvail) return false;
        // Text search
        if (search && !f.name.toLowerCase().includes(search) &&
            !(f.description || '').toLowerCase().includes(search)) return false;
        return true;
    });

    // Sort
    const sort = _sortKey;
    _filtered.sort((a, b) => {
        if (sort === 'name_asc')   return a.name.localeCompare(b.name, 'vi');
        if (sort === 'name_desc')  return b.name.localeCompare(a.name, 'vi');
        if (sort === 'price_asc')  return Number(a.price) - Number(b.price);
        if (sort === 'price_desc') return Number(b.price) - Number(a.price);
        if (sort === 'featured')   return Number(b.is_featured) - Number(a.is_featured);
        return 0;
    });

    setText('resultCount', _filtered.length);
    renderView();
}

/* ─────────────────────────────────────────────
   RENDER — dispatch to grid or list
───────────────────────────────────────────── */
function renderView() {
    if (_viewMode === 'grid') renderGrid();
    else renderList();
}

/* ─────────────────────────────────────────────
   RENDER GRID
───────────────────────────────────────────── */
function renderGrid() {
    const grid     = document.getElementById('foodsGrid');
    const listView = document.getElementById('foodsListView');
    grid.style.display     = '';
    listView.style.display = 'none';

    if (!_filtered.length) {
        grid.innerHTML = `
            <div class="foods-empty">
                <div class="fe-icon"><i class="fas fa-magnifying-glass"></i></div>
                <div class="fe-title">Không tìm thấy món nào</div>
                <div class="fe-desc">Thử thay đổi bộ lọc hoặc từ khoá tìm kiếm</div>
            </div>`;
        return;
    }

    grid.innerHTML = _filtered.map(f => foodCardHtml(f)).join('');
}

function foodCardHtml(f) {
    const unavailable = Number(f.is_available) === 0;
    const featured    = Number(f.is_featured)  === 1;
    const src         = imgSrc(f.image_url);

    return `
    <div class="food-card ${unavailable ? 'fc-unavailable' : ''}"
         data-id="${f.id}">

        <!-- Image -->
        <div class="fc-img-wrap">
            ${src
                ? `<img class="fc-img" src="${escHtml(src)}" alt="${escHtml(f.name)}"
                        onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
                : ''}
            <div class="fc-img-placeholder" style="${src ? 'display:none' : ''}">
                <i class="fas fa-utensils"></i>
                <span>Chưa có ảnh</span>
            </div>

            <!-- Badges -->
            <div class="fc-badges">
                ${featured    ? `<span class="fc-badge-featured"><i class="fas fa-star"></i> Nổi bật</span>` : ''}
                ${unavailable ? `<span class="fc-badge-unavailable"><i class="fas fa-ban"></i> Tạm ngưng</span>` : ''}
            </div>

            <!-- Quick actions -->
            <div class="fc-overlay">
                <button class="fc-ov-btn fc-ov-edit" onclick="openEdit(${f.id})" title="Chỉnh sửa">
                    <i class="fas fa-pen"></i>
                </button>
                <button class="fc-ov-btn fc-ov-toggle"
                    onclick="toggleAvail(${f.id}, ${f.is_available})"
                    title="${unavailable ? 'Bật lại' : 'Tạm ngưng'}">
                    <i class="fas fa-${unavailable ? 'circle-check' : 'ban'}"></i>
                </button>
                <button class="fc-ov-btn fc-ov-delete" onclick="openDelete(${f.id}, '${escHtml(f.name)}')" title="Xoá">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>

        <!-- Body -->
        <div class="fc-body">
            <div class="fc-cat-tag">${escHtml(f.category_name || '')}</div>
            <div class="fc-name">${escHtml(f.name)}</div>
            <div class="fc-desc">${escHtml(f.description || 'Chưa có mô tả')}</div>
        </div>

        <!-- Footer -->
        <div class="fc-footer">
            <div class="fc-price">${fmt(f.price)}</div>
            <div class="fc-status-dot ${unavailable ? 'fcs-unavailable' : 'fcs-available'}"
                 title="${unavailable ? 'Tạm ngưng' : 'Đang bán'}"></div>
        </div>
    </div>`;
}

/* ─────────────────────────────────────────────
   RENDER LIST
───────────────────────────────────────────── */
function renderList() {
    const grid     = document.getElementById('foodsGrid');
    const listView = document.getElementById('foodsListView');
    grid.style.display     = 'none';
    listView.style.display = '';

    if (!_filtered.length) {
        listView.innerHTML = `
            <div class="foods-empty">
                <div class="fe-icon"><i class="fas fa-magnifying-glass"></i></div>
                <div class="fe-title">Không tìm thấy món nào</div>
                <div class="fe-desc">Thử thay đổi bộ lọc hoặc từ khoá tìm kiếm</div>
            </div>`;
        return;
    }

    listView.innerHTML = _filtered.map(f => {
        const unavailable = Number(f.is_available) === 0;
        const src         = imgSrc(f.image_url);
        return `
        <div class="food-list-row ${unavailable ? 'flr-unavailable' : ''}" data-id="${f.id}">
            ${src
                ? `<img class="flr-img" src="${escHtml(src)}" alt="${escHtml(f.name)}"
                       onerror="this.src='/public/assets/food-placeholder.png'">`
                : `<div class="flr-img" style="display:flex;align-items:center;justify-content:center;background:var(--color-gray-100)">
                       <i class="fas fa-utensils" style="color:var(--color-gray-300)"></i></div>`}
            <div class="flr-info">
                <div class="flr-name">
                    ${escHtml(f.name)}
                    ${Number(f.is_featured) ? `<span style="font-size:0.6rem;background:var(--admin-primary-light);color:var(--admin-primary);border-radius:99px;padding:1px 6px;margin-left:5px;font-weight:700">Nổi bật</span>` : ''}
                    ${unavailable ? `<span style="font-size:0.6rem;background:var(--color-gray-100);color:var(--color-gray-400);border-radius:99px;padding:1px 6px;margin-left:5px;font-weight:700">Tạm ngưng</span>` : ''}
                </div>
                <div class="flr-meta">${escHtml(f.category_name || '')}${f.description ? ' · ' + escHtml(f.description).slice(0, 60) + (f.description.length > 60 ? '...' : '') : ''}</div>
            </div>
            <div class="flr-price">${fmt(f.price)}</div>
            <div class="flr-actions">
                <button class="btn btn-ghost btn-xs" onclick="toggleAvail(${f.id}, ${f.is_available})"
                        title="${unavailable ? 'Bật lại' : 'Tạm ngưng'}">
                    <i class="fas fa-${unavailable ? 'circle-check' : 'ban'}"></i>
                </button>
                <button class="btn btn-ghost btn-xs" onclick="openEdit(${f.id})" title="Sửa">
                    <i class="fas fa-pen"></i>
                </button>
                <button class="btn btn-danger btn-xs" onclick="openDelete(${f.id}, '${escHtml(f.name)}')" title="Xoá">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>`;
    }).join('');
}

/* ─────────────────────────────────────────────
   SKELETON
───────────────────────────────────────────── */
function showSkeleton() {
    const grid = document.getElementById('foodsGrid');
    grid.style.display = '';
    document.getElementById('foodsListView').style.display = 'none';
    grid.innerHTML = Array(8).fill(0).map(() => `
        <div class="food-card">
            <div class="fc-img-wrap sk-block skeleton" style="border-radius:0"></div>
            <div class="fc-body" style="gap:8px">
                <div class="sk-block skeleton" style="width:60%;height:10px"></div>
                <div class="sk-block skeleton" style="width:90%;height:14px"></div>
                <div class="sk-block skeleton" style="width:100%;height:10px"></div>
                <div class="sk-block skeleton" style="width:80%;height:10px"></div>
            </div>
            <div class="fc-footer"><div class="sk-block skeleton" style="width:80px;height:16px"></div></div>
        </div>`).join('');
}

/* ─────────────────────────────────────────────
   MODAL — OPEN CREATE
───────────────────────────────────────────── */
async function openCreate() {
    _editingId       = null;
    _currentImageUrl = null;

    resetForm();
    document.getElementById('modalTitle').textContent  = 'Thêm món mới';
    document.getElementById('modalSub').textContent    = 'Điền thông tin món ăn vào form bên dưới';
    document.getElementById('btnSaveText').textContent = 'Thêm món';
    document.getElementById('fAvailable').checked = true;
    document.getElementById('fFeatured').checked  = false;
    document.getElementById('currentImgWrap').style.display = 'none';

    // Mở modal TRƯỚC, load categories sau — tránh block nếu API chậm/lỗi
    openModal('foodModal');
    await loadCategoriesSelect();
}

/* ─────────────────────────────────────────────
   MODAL — OPEN EDIT
───────────────────────────────────────────── */
async function openEdit(id) {
    const food = _foods.find(f => f.id === id);
    if (!food) return;

    _editingId       = id;
    _currentImageUrl = food.image_url || null;

    resetForm();
    document.getElementById('modalTitle').textContent = 'Chỉnh sửa món ăn';
    document.getElementById('modalSub').textContent   = `ID: #${food.id} — ${escHtml(food.name)}`;
    document.getElementById('btnSaveText').textContent = 'Lưu thay đổi';

    // Fill form
    document.getElementById('foodId').value   = food.id;
    document.getElementById('fName').value    = food.name || '';
    document.getElementById('fDesc').value    = food.description || '';
    document.getElementById('fPrice').value   = food.price || '';
    updatePriceDisplay(food.price);
    document.getElementById('fAvailable').checked = Number(food.is_available) === 1;
    document.getElementById('fFeatured').checked  = Number(food.is_featured)  === 1;

    // Show current image if exists
    const imgWrap = document.getElementById('currentImgWrap');
    const currImg = document.getElementById('currentImg');
    if (_currentImageUrl) {
        currImg.src = imgSrc(_currentImageUrl);
        imgWrap.style.display = 'block';
    } else {
        imgWrap.style.display = 'none';
    }

    await loadCategoriesSelect(food.category_id);
    openModal('foodModal');
}

/* ─────────────────────────────────────────────
   LOAD CATEGORIES INTO SELECT
───────────────────────────────────────────── */
async function loadCategoriesSelect(selectedId = null) {
    const sel = document.getElementById('fCategory');
    sel.innerHTML = '<option value="">-- Chọn danh mục --</option>';

    // Use cached _categories; fetch fresh if empty
    let cats = _categories;
    if (!cats.length) {
        try {
            cats = await apiFetch('/categories');
            _categories = cats;
        } catch {
            sel.innerHTML = '<option value="">Lỗi tải danh mục</option>';
            return;
        }
    }

    cats.forEach(cat => {
        const opt = document.createElement('option');
        opt.value       = cat.id;
        opt.textContent = cat.name;
        if (selectedId && String(cat.id) === String(selectedId)) opt.selected = true;
        sel.appendChild(opt);
    });
}

/* ─────────────────────────────────────────────
   SAVE (Create or Update)
───────────────────────────────────────────── */
async function saveFood() {
    if (!validateForm()) return;

    const btn = document.getElementById('btnModalSave');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang lưu...';

    try {
        const formData = new FormData();
        formData.append('name',         document.getElementById('fName').value.trim());
        formData.append('description',  document.getElementById('fDesc').value.trim());
        formData.append('price',        document.getElementById('fPrice').value);
        formData.append('category_id',  document.getElementById('fCategory').value);
        formData.append('is_featured',  document.getElementById('fFeatured').checked ? '1' : '0');

        // Only append is_available on edit (create defaults to 1)
        if (_editingId) {
            formData.append('is_available', document.getElementById('fAvailable').checked ? '1' : '0');
        }

        // Image: only append if user selected a new file
        const fileInput = document.getElementById('fImage');
        if (fileInput.files.length > 0) {
            formData.append('imageFile', fileInput.files[0]);
        }
        // If editing without new file → omit 'image' field
        // Backend: final_image_url = new_image_url || currentFood.image_url

        if (_editingId) {
            await apiFetch(`/foods/${_editingId}`, { method: 'PUT', body: formData });
            toast('Cập nhật món ăn thành công!', 'success');
        } else {
            await apiFetch('/foods', { method: 'POST', body: formData });
            toast('Thêm món ăn thành công!', 'success');
        }

        closeModal('foodModal');
        await loadFoods();

    } catch (err) {
        console.error('[Foods] Save error:', err);
        toast('Lỗi lưu món ăn: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fas fa-check"></i> <span id="btnSaveText">${_editingId ? 'Lưu thay đổi' : 'Thêm món'}</span>`;
    }
}

/* ─────────────────────────────────────────────
   VALIDATE FORM
───────────────────────────────────────────── */
function validateForm() {
    let ok = true;

    const name = document.getElementById('fName').value.trim();
    if (!name) {
        showErr('errName', 'Vui lòng nhập tên món ăn');
        ok = false;
    } else {
        clearErr('errName');
    }

    const cat = document.getElementById('fCategory').value;
    if (!cat) {
        showErr('errCategory', 'Vui lòng chọn danh mục');
        ok = false;
    } else {
        clearErr('errCategory');
    }

    const price = Number(document.getElementById('fPrice').value);
    if (!price || price < 0) {
        showErr('errPrice', 'Giá bán phải lớn hơn 0');
        ok = false;
    } else {
        clearErr('errPrice');
    }

    return ok;
}

function showErr(id, msg) {
    const el = document.getElementById(id);
    if (el) { el.textContent = msg; el.style.display = 'block'; }
}
function clearErr(id) {
    const el = document.getElementById(id);
    if (el) { el.textContent = ''; el.style.display = 'none'; }
}

/* ─────────────────────────────────────────────
   TOGGLE AVAILABILITY (quick action)
───────────────────────────────────────────── */
async function toggleAvail(id, currentVal) {
    const newVal = Number(currentVal) === 1 ? 0 : 1;
    const food   = _foods.find(f => f.id === id);
    const label  = newVal === 1 ? 'Bật lại' : 'Tạm ngưng';

    try {
        await apiFetch(`/foods/${id}/availability`, {
            method: 'PUT',
            body: JSON.stringify({ is_available: newVal }),
            headers: { 'Content-Type': 'application/json' },
        });
        toast(`${label} món "${food?.name}" thành công`, 'success');
        // Optimistic update
        const f = _foods.find(f => f.id === id);
        if (f) f.is_available = newVal;
        applyFilter();
        updateStats();
    } catch (err) {
        toast('Lỗi cập nhật trạng thái: ' + err.message, 'error');
    }
}

/* ─────────────────────────────────────────────
   DELETE
───────────────────────────────────────────── */
function openDelete(id, name) {
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
        await apiFetch(`/foods/${_deleteId}`, { method: 'DELETE' });
        toast('Đã xoá món ăn thành công', 'success');
        closeModal('deleteModal');
        _deleteId = null;
        await loadFoods();
    } catch (err) {
        toast('Lỗi xoá món ăn: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-trash"></i> Xoá vĩnh viễn';
    }
}

/* ─────────────────────────────────────────────
   MODAL HELPERS
───────────────────────────────────────────── */
/* ─────────────────────────────────────────────
   MODAL OPEN / CLOSE
   Sử dụng đúng hệ thống của common.css:
     .modal-overlay           → display:flex; opacity:0; visibility:hidden
     .modal-overlay.active    → opacity:1; visibility:visible
     .modal-overlay.active .modal → transform:none (slide-in)
───────────────────────────────────────────── */
function openModal(id) {
    const el = document.getElementById(id);
    if (!el) { console.warn('[Foods] openModal: element not found:', id); return; }
    // common.css: .modal-overlay luôn display:flex, ẩn bằng opacity+visibility
    // Chỉ cần xóa inline style rồi add class 'active' là modal hiện + slide-in
    el.style.removeProperty('display');
    requestAnimationFrame(() => el.classList.add('active'));
    document.body.style.overflow = 'hidden';
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('active');
    document.body.style.overflow = '';
    // Ẩn hoàn toàn sau khi transition kết thúc (~200ms)
    setTimeout(() => {
        if (!el.classList.contains('active')) el.style.display = 'none';
    }, 250);
}

/* ─────────────────────────────────────────────
   FORM RESET
───────────────────────────────────────────── */
function resetForm() {
    document.getElementById('foodForm').reset();
    document.getElementById('foodId').value = '';
    clearErr('errName');
    clearErr('errCategory');
    clearErr('errPrice');
    document.getElementById('priceDisplay').textContent = '';
    resetImageUpload();
}

function resetImageUpload() {
    document.getElementById('previewStrip').style.display = 'none';
    document.getElementById('previewImg').src  = '';
    document.getElementById('previewName').textContent = '';
    document.getElementById('previewSize').textContent = '';
    // Reset file input
    const fi = document.getElementById('fImage');
    if (fi) fi.value = '';
}

/* ─────────────────────────────────────────────
   IMAGE UPLOAD HANDLING
───────────────────────────────────────────── */
function handleFileSelect(file) {
    if (!file) return;

    // Validate
    if (!file.type.startsWith('image/')) {
        toast('Chỉ chấp nhận file ảnh (JPG, PNG, WebP)', 'warning');
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        toast('Ảnh vượt quá 5MB. Vui lòng chọn ảnh nhỏ hơn.', 'warning');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('previewImg').src    = e.target.result;
        document.getElementById('previewName').textContent = file.name;
        document.getElementById('previewSize').textContent = fmtFileSize(file.size);
        document.getElementById('previewStrip').style.display = 'flex';
        // Hide current img since new one selected
        document.getElementById('currentImgWrap').style.display = 'none';
    };
    reader.readAsDataURL(file);
}

function updatePriceDisplay(val) {
    const el = document.getElementById('priceDisplay');
    if (!el) return;
    const n = Number(val);
    el.textContent = n > 0 ? fmt(n) : '';
}

/* ─────────────────────────────────────────────
   VIEW TOGGLE
───────────────────────────────────────────── */
function setView(mode) {
    _viewMode = mode;
    document.getElementById('btnViewGrid').classList.toggle('vt-active', mode === 'grid');
    document.getElementById('btnViewList').classList.toggle('vt-active', mode === 'list');
    renderView();
}

/* ─────────────────────────────────────────────
   INIT & EVENT BINDING
───────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
    // Initial load
    loadFoods();

    // Toolbar
    document.getElementById('btnRefresh')?.addEventListener('click', loadFoods);
    document.getElementById('btnViewGrid')?.addEventListener('click', () => setView('grid'));
    document.getElementById('btnViewList')?.addEventListener('click', () => setView('list'));

    // Search (debounced)
    let _searchTimer;
    document.getElementById('globalSearch')?.addEventListener('input', () => {
        clearTimeout(_searchTimer);
        _searchTimer = setTimeout(applyFilter, 280);
    });

    // Sort
    document.getElementById('sortSelect')?.addEventListener('change', (e) => {
        _sortKey = e.target.value;
        applyFilter();
    });

    // Category chips (event delegation)
    document.getElementById('catChips')?.addEventListener('click', (e) => {
        const chip = e.target.closest('.ffb-chip');
        if (!chip) return;
        const catId = chip.dataset.cat;
        _filterCat = catId;
        document.querySelectorAll('.ffb-chip').forEach(c => c.classList.remove('ffbc-on'));
        chip.classList.add('ffbc-on');
        applyFilter();
        updateClearBtn();
    });

    // Availability filter buttons
    document.querySelectorAll('.ffb-avail-btn').forEach(btn => {
        btn.addEventListener('click', () => setAvailFilter(btn.dataset.avail, btn));
    });

    // Clear filter
    document.getElementById('btnClearFilter')?.addEventListener('click', () => {
        _filterCat   = 'all';
        _filterAvail = 'all';
        document.querySelectorAll('.ffb-chip').forEach((c, i) => c.classList.toggle('ffbc-on', i === 0));
        document.querySelectorAll('.ffb-avail-btn').forEach((b, i) => b.classList.toggle('ffba-on', i === 0));
        document.getElementById('globalSearch').value = '';
        applyFilter();
        updateClearBtn();
    });

    // ── Modal: food form ──
    document.getElementById('modalClose')?.addEventListener('click', () => closeModal('foodModal'));
    document.getElementById('btnModalCancel')?.addEventListener('click', () => closeModal('foodModal'));
    document.getElementById('btnModalSave')?.addEventListener('click', saveFood);

    // Close on overlay click
    document.getElementById('foodModal')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('foodModal')) closeModal('foodModal');
    });

    // ── Modal: delete confirm ──
    document.getElementById('deleteModalClose')?.addEventListener('click', () => closeModal('deleteModal'));
    document.getElementById('btnDeleteCancel')?.addEventListener('click', () => closeModal('deleteModal'));
    document.getElementById('btnDeleteConfirm')?.addEventListener('click', confirmDelete);
    document.getElementById('deleteModal')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('deleteModal')) closeModal('deleteModal');
    });

    // ── Image upload ──
    const fileInput    = document.getElementById('fImage');
    const dropzone     = document.getElementById('uploadDropzone');
    const btnRemoveImg = document.getElementById('btnRemoveImg');

    fileInput?.addEventListener('change', (e) => {
        handleFileSelect(e.target.files[0]);
    });

    // Click dropzone → trigger file picker (vì input bằng display:none)
    dropzone?.addEventListener('click', (e) => {
        // Không trigger nếu click vào nút xóa ảnh
        if (e.target.closest('#btnRemoveImg')) return;
        fileInput?.click();
    });

    // Drag & drop visual
    dropzone?.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dz-over');
    });
    dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('dz-over'));
    dropzone?.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dz-over');
        const file = e.dataTransfer.files[0];
        if (file) {
            // Inject into input for FormData
            const dt = new DataTransfer();
            dt.items.add(file);
            fileInput.files = dt.files;
            handleFileSelect(file);
        }
    });

    btnRemoveImg?.addEventListener('click', () => {
        resetImageUpload();
        // Restore current img hint if editing
        if (_editingId && _currentImageUrl) {
            document.getElementById('currentImgWrap').style.display = 'block';
        }
    });

    // ── Price live format ──
    document.getElementById('fPrice')?.addEventListener('input', (e) => {
        updatePriceDisplay(e.target.value);
    });

    // ── ESC to close ──
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal('foodModal');
            closeModal('deleteModal');
        }
    });
});

/* ─────────────────────────────────────────────
   EXPOSE to inline onclick handlers
───────────────────────────────────────────── */
window.openEdit   = openEdit;
window.openDelete = openDelete;
window.toggleAvail = toggleAvail;

// Debug helpers — có thể gọi từ browser console để kiểm tra
window._openFoodModal   = () => openModal('foodModal');
window._closeFoodModal  = () => closeModal('foodModal');
window._openDeleteModal = () => openModal('deleteModal');