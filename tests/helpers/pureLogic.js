// tests/helpers/pureLogic.js
// Logic thuần mirror từ controller — dùng cho unit test, KHÔNG sửa code nguồn

/**
 * Tính tổng đơn hàng (mirror createOrder — user.controller.js)
 * @param {Array<{ priceAtOrder: number, quantity: number }>} items
 * @param {{ type: 'percent'|'fixed', value: number }|null} promo
 */
function calculateOrderTotal(items, promo = null) {
  const subtotal = items.reduce(
    (sum, i) => sum + i.priceAtOrder * i.quantity,
    0
  );
  let discount = 0;
  if (promo) {
    discount =
      promo.type === 'percent'
        ? (subtotal * promo.value) / 100
        : promo.value;
  }
  return { subtotal, discount, total: subtotal - discount };
}

/**
 * Validate input đăng nhập (mirror auth.controller.js — login)
 */
function validateLoginInput(email, password) {
  if (!email || !password) {
    return { valid: false, status: 400, message: 'Vui lòng nhập Email và Mật khẩu.' };
  }
  return { valid: true };
}

/**
 * Validate input tạo món (mirror admin.controller.js — createFood)
 */
function validateFoodInput({ name, category_id, price }) {
  if (!name || !category_id || !price) {
    return { valid: false, status: 400, message: 'Thiếu thông tin bắt buộc.' };
  }
  return { valid: true };
}

/**
 * Áp mã khuyến mãi (mirror checkCoupon — user.controller.js)
 * @param {object|null} promo — row từ DB
 * @param {number} subtotal
 */
function applyPromotion(promo, subtotal) {
  if (!promo) {
    return { ok: false, status: 404, message: 'Mã giảm giá không hợp lệ.' };
  }
  if (subtotal < promo.min_order_amount) {
    return {
      ok: false,
      status: 400,
      message: `Đơn hàng cần tối thiểu ${promo.min_order_amount}₫`,
    };
  }
  const discount_amount =
    promo.type === 'percent'
      ? (subtotal * promo.value) / 100
      : promo.value;
  return { ok: true, status: 200, promo_id: promo.id, discount_amount };
}

module.exports = {
  calculateOrderTotal,
  validateLoginInput,
  validateFoodInput,
  applyPromotion,
};
