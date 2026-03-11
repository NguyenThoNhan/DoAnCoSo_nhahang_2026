'use strict';

// food-create.js — Trang thêm món ăn mới (admin)
// API dùng:
//   GET  /api/admin/categories
//   POST /api/admin/foods  (FormData: name, description, price, category_id, is_featured, is_available, imageFile?)

const FC_API = '/api/admin';
const IMG_MAX_SIZE = 5 * 1024 * 1024; // 5MB

let _fcCategories = [];
let _fcIngredients = [];
// Công thức món hiện tại: [{ ingredient_id, name, unit, quantity_required }]
let _fcRecipe = [];

function fcToast(message, type = 'success') {
    const icons = {
        success: 'circle-check',
        error: 'triangle-exclamation',
        info: 'circle-info',
        warning: 'triangle-exclamation',
    };
    const colors = {
        success: '#10B981',
        error: '#EF4444',
        info: '#3B82F6',
        warning: '#F59E0B',
    };

    const el = document.createElement('div');
    el.style.cssText = [
        'display:flex;align-items:center;gap:10px',
        'padding:12px 18px;border-radius:12px',
        'background:var(--color-white)',
        'box-shadow:0 8px 30px rgba(0,0,0,0.14)',
        `border-left:4px solid ${colors[type] || colors.info}`,
        'font-family:var(--font-primary);font-size:14px',
        'color:var(--color-gray-800);max-width:340px',
        'pointer-events:all;animation:toast-in 0.3s ease',
    ].join(';');
    el.innerHTML = `
        <i class="fas fa-${icons[type] || icons.info}" style="color:${colors[type] || colors.info};font-size:1rem;flex-shrink:0"></i>
        <span style="flex:1;line-height:1.4">${fcEsc(message)}</span>
        <button onclick="this.parentElement.remove()"
            style="background:none;border:none;cursor:pointer;color:var(--color-gray-400);font-size:0.8rem;flex-shrink:0;padding:0">
            <i class="fas fa-xmark"></i>
        </button>
    `;

    if (!document.getElementById('_fcToastStyle')) {
        const style = document.createElement('style');
        style.id = '_fcToastStyle';
        style.textContent = '@keyframes toast-in{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}';
        document.head.appendChild(style);
    }

    document.getElementById('toastContainer')?.appendChild(el);
    setTimeout(() => el.remove(), 4000);
}

function fcEsc(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

async function fcApiFetch(endpoint, options = {}) {
    const isFormData = options.body instanceof FormData;
    const headers = {
        ...GoMeal.getAuthHeader(),
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...(options.headers || {}),
    };
    const res = await fetch(`${FC_API}${endpoint}`, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.message || `Lỗi ${res.status}`);
    }
    return data;
}

async function fcLoadCategoriesSelect() {
    const sel = document.getElementById('fCategory');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Đang tải danh mục... --</option>';

    try {
        const categories = await fcApiFetch('/categories');
        _fcCategories = Array.isArray(categories) ? categories : [];

        sel.innerHTML = '<option value="">-- Chọn danh mục --</option>';
        _fcCategories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat.id;
            opt.textContent = cat.name;
            sel.appendChild(opt);
        });
    } catch (err) {
        sel.innerHTML = '<option value="">Lỗi tải danh mục</option>';
        fcToast('Không thể tải danh sách danh mục: ' + err.message, 'error');
    }
}

async function fcLoadIngredients() {
    const sel = document.getElementById('rcIngredient');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Đang tải nguyên liệu... --</option>';

    try {
        const ingredients = await fcApiFetch('/ingredients');
        _fcIngredients = Array.isArray(ingredients) ? ingredients : [];

        sel.innerHTML = '<option value="">-- Chọn nguyên liệu --</option>';
        _fcIngredients.forEach(ing => {
            const opt = document.createElement('option');
            opt.value = ing.id;
            const unit = ing.unit ? ` (${ing.unit})` : '';
            opt.textContent = `${ing.name}${unit}`;
            sel.appendChild(opt);
        });
    } catch (err) {
        sel.innerHTML = '<option value="">Lỗi tải nguyên liệu</option>';
        fcToast('Không thể tải danh sách nguyên liệu: ' + err.message, 'error');
    }
}

function fcUpdatePriceDisplay(val) {
    const el = document.getElementById('priceDisplay');
    if (!el) return;
    const n = Number(val);
    el.textContent = n > 0
        ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n)
        : '';
}

function fcResetImage() {
    const strip = document.getElementById('previewStrip');
    const img = document.getElementById('previewImg');
    const name = document.getElementById('previewName');
    const size = document.getElementById('previewSize');
    const fi = document.getElementById('fImage');
    if (strip) strip.classList.remove('show');
    if (img) img.src = '';
    if (name) name.textContent = '';
    if (size) size.textContent = '';
    if (fi) fi.value = '';
}

function fcFmtFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function fcHandleFileSelect(file) {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        fcToast('Chỉ chấp nhận file ảnh (JPG, PNG, WebP, GIF)', 'warning');
        return;
    }
    if (file.size > IMG_MAX_SIZE) {
        fcToast('Ảnh vượt quá 5MB. Vui lòng chọn ảnh nhỏ hơn.', 'warning');
        return;
    }

    const reader = new FileReader();
    reader.onload = e => {
        const strip = document.getElementById('previewStrip');
        const img = document.getElementById('previewImg');
        const name = document.getElementById('previewName');
        const size = document.getElementById('previewSize');
        if (img) img.src = e.target.result;
        if (name) name.textContent = file.name;
        if (size) size.textContent = fcFmtFileSize(file.size);
        if (strip) strip.classList.add('show');
    };
    reader.readAsDataURL(file);
}

function fcValidate() {
    let ok = true;

    const name = document.getElementById('fName')?.value.trim();
    const cat = document.getElementById('fCategory')?.value;
    const price = Number(document.getElementById('fPrice')?.value);

    const errName = document.getElementById('errName');
    const errCat = document.getElementById('errCategory');
    const errPrice = document.getElementById('errPrice');

    if (!name) {
        if (errName) errName.classList.add('show');
        ok = false;
    } else if (errName) {
        errName.classList.remove('show');
    }

    if (!cat) {
        if (errCat) errCat.classList.add('show');
        ok = false;
    } else if (errCat) {
        errCat.classList.remove('show');
    }

    if (!price || price <= 0) {
        if (errPrice) errPrice.classList.add('show');
        ok = false;
    } else if (errPrice) {
        errPrice.classList.remove('show');
    }

    return ok;
}

async function fcSave() {
    if (!fcValidate()) return;

    const btn = document.getElementById('btnSave');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang lưu...';
    }

    try {
        const formData = new FormData();
        formData.append('name', document.getElementById('fName').value.trim());
        formData.append('description', document.getElementById('fDesc').value.trim());
        formData.append('price', document.getElementById('fPrice').value);
        formData.append('category_id', document.getElementById('fCategory').value);
        formData.append('is_featured', document.getElementById('fFeatured').checked ? '1' : '0');
        formData.append('is_available', document.getElementById('fAvailable').checked ? '1' : '0');

        const fileInput = document.getElementById('fImage');
        if (fileInput && fileInput.files.length > 0) {
            formData.append('imageFile', fileInput.files[0]);
        }

        // 1. Tạo món ăn
        const created = await fcApiFetch('/foods', { method: 'POST', body: formData });
        const foodId = created && created.id;

        // 2. Nếu có công thức thì lưu các nguyên liệu
        if (foodId && _fcRecipe.length > 0) {
            for (const item of _fcRecipe) {
                await fcApiFetch(`/foods/${foodId}/recipe`, {
                    method: 'POST',
                    body: JSON.stringify({
                        ingredient_id: item.ingredient_id,
                        quantity_required: item.quantity_required,
                    }),
                });
            }
        }

        fcToast('Thêm món ăn thành công!', 'success');

        // Sau khi lưu thành công: quay lại danh sách
        setTimeout(() => {
            window.location.href = '/views/admin/foods.html';
        }, 800);
    } catch (err) {
        console.error('[FoodCreate] Save error:', err);
        fcToast('Lỗi lưu món ăn: ' + err.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-check"></i> Thêm món';
        }
    }
}

function fcRenderRecipeList() {
    const listEl = document.getElementById('rcList');
    if (!listEl) return;

    if (_fcRecipe.length === 0) {
        listEl.innerHTML = `
            <div style="padding:10px 12px;font-size:.8rem;color:#9CA3AF;">
                Chưa có nguyên liệu nào. Bạn vẫn có thể lưu món, nhưng hệ thống không thể tự trừ kho.
            </div>
        `;
        return;
    }

    listEl.innerHTML = _fcRecipe.map(item => {
        const qtyStr = item.quantity_required.toString();
        const unit = item.unit || '';
        return `
            <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-bottom:1px solid #F3F4F6;">
                <div style="flex:1;min-width:0;">
                    <div style="font-size:.82rem;font-weight:600;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                        ${fcEsc(item.name)}
                    </div>
                    <div style="font-size:.72rem;color:#9CA3AF;margin-top:2px;">
                        Định lượng: <strong>${fcEsc(qtyStr)}</strong> ${fcEsc(unit)}
                    </div>
                </div>
                <button type="button"
                        data-id="${item.ingredient_id}"
                        class="fc-prev-rm rc-remove"
                        title="Xoá nguyên liệu">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
    }).join('');
}

function fcAddIngredientToRecipe() {
    const sel = document.getElementById('rcIngredient');
    const qtyInput = document.getElementById('rcQuantity');
    const err = document.getElementById('rcError');
    if (!sel || !qtyInput) return;

    const ingId = Number(sel.value);
    const qty = Number(qtyInput.value);

    if (!ingId || !qty || qty <= 0) {
        if (err) err.style.display = 'flex';
        return;
    }
    if (err) err.style.display = 'none';

    const ing = _fcIngredients.find(i => i.id === ingId);
    if (!ing) return;

    // Nếu đã có trong recipe thì cập nhật lại định lượng
    const existing = _fcRecipe.find(r => r.ingredient_id === ingId);
    if (existing) {
        existing.quantity_required = qty;
    } else {
        _fcRecipe.push({
            ingredient_id: ing.id,
            name: ing.name,
            unit: ing.unit,
            quantity_required: qty,
        });
    }

    fcRenderRecipeList();
}

function fcRemoveIngredientFromRecipe(ingredientId) {
    _fcRecipe = _fcRecipe.filter(item => item.ingredient_id !== ingredientId);
    fcRenderRecipeList();
}

document.addEventListener('DOMContentLoaded', () => {
    // Load categories
    fcLoadCategoriesSelect();
    // Load ingredients cho phần công thức
    fcLoadIngredients();

    // Price live format
    document.getElementById('fPrice')?.addEventListener('input', e => {
        fcUpdatePriceDisplay(e.target.value);
    });

    // Image upload handling
    const fileInput = document.getElementById('fImage');
    const dropzone = document.getElementById('uploadDropzone');
    const btnRemoveImg = document.getElementById('btnRemoveImg');

    fileInput?.addEventListener('change', e => {
        fcHandleFileSelect(e.target.files[0]);
    });

    dropzone?.addEventListener('click', e => {
        if (e.target.closest('#btnRemoveImg')) return;
        fileInput?.click();
    });

    dropzone?.addEventListener('dragover', e => {
        e.preventDefault();
        dropzone.classList.add('dz-over');
    });
    dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('dz-over'));
    dropzone?.addEventListener('drop', e => {
        e.preventDefault();
        dropzone.classList.remove('dz-over');
        const file = e.dataTransfer.files[0];
        if (file) {
            const dt = new DataTransfer();
            dt.items.add(file);
            if (fileInput) fileInput.files = dt.files;
            fcHandleFileSelect(file);
        }
    });

    btnRemoveImg?.addEventListener('click', () => {
        fcResetImage();
    });

    // Recipe: thêm nguyên liệu
    document.getElementById('btnAddIngredient')?.addEventListener('click', () => {
        fcAddIngredientToRecipe();
    });

    // Recipe: xoá nguyên liệu (event delegation)
    document.getElementById('rcList')?.addEventListener('click', e => {
        const btn = e.target.closest('.rc-remove');
        if (!btn) return;
        const ingId = Number(btn.getAttribute('data-id'));
        if (!ingId) return;
        fcRemoveIngredientFromRecipe(ingId);
    });

    // Save / cancel buttons
    document.getElementById('btnSave')?.addEventListener('click', fcSave);
    document.getElementById('btnCancel')?.addEventListener('click', () => {
        window.location.href = '/views/admin/foods.html';
    });

    // ESC → quay lại danh sách
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            window.location.href = '/views/admin/foods.html';
        }
    });
});