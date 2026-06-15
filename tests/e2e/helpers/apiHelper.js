const jwt = require('jsonwebtoken');
const { BASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD } = require('../config');

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function assertServerRunning() {
  try {
    await fetch(BASE_URL);
  } catch {
    throw new Error(
      `Server không phản hồi tại ${BASE_URL}. Hãy chạy "npm start" trước khi chạy E2E.`
    );
  }
}

async function loginAdmin() {
  const { status, body } = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (status !== 200 || !body.token) {
    throw new Error(`Đăng nhập admin thất bại (${status}): ${body.message || ''}`);
  }
  return body.token;
}

async function getPublicTables() {
  const { status, body } = await request('/api/user/public/tables');
  if (status !== 200 || !Array.isArray(body)) {
    throw new Error('Không lấy được danh sách bàn');
  }
  return body;
}

function createGuestToken(tableId) {
  return jwt.sign(
    { tableId, role: 'guest', isGuest: true },
    process.env.JWT_SECRET,
    { expiresIn: '3h' }
  );
}

async function setupGuestSession() {
  const tables = await getPublicTables();
  const table = tables.find((t) => t.status === 'available') || tables[0];
  if (!table) throw new Error('Không có bàn nào trong DB. Chạy npm run seed.');

  const guestToken = createGuestToken(table.id);
  return {
    guestToken,
    tableId: table.id,
    tableNumber: table.table_number,
    tableName: `Bàn ${table.table_number}`,
  };
}

async function getMenu() {
  const { status, body } = await request('/api/user/public/menu');
  if (status !== 200 || !Array.isArray(body) || body.length === 0) {
    throw new Error('Menu trống. Seed dữ liệu món ăn trước.');
  }
  return body.filter((f) => f.is_available !== false && f.is_available !== 0);
}

async function getActivePromotion(adminToken) {
  const { status, body } = await request('/api/admin/promotions', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  if (status !== 200 || !Array.isArray(body)) return null;
  const now = Date.now();
  return body.find((p) => {
    if (!p.is_active) return false;
    const start = new Date(p.start_date).getTime();
    const end = new Date(p.end_date).getTime();
    return start <= now && end >= now;
  });
}

async function getOrderById(token, orderId) {
  return request(`/api/user/order/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function getIngredients(adminToken) {
  const { status, body } = await request('/api/admin/ingredients', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  if (status !== 200 || !Array.isArray(body)) {
    throw new Error('Không lấy được danh sách nguyên liệu');
  }
  return body;
}

async function getFoodRecipe(foodId) {
  const { status, body } = await request(`/api/user/public/menu/${foodId}/recipe`);
  if (status !== 200 || !Array.isArray(body)) return [];
  return body;
}

module.exports = {
  assertServerRunning,
  loginAdmin,
  setupGuestSession,
  getMenu,
  getActivePromotion,
  getOrderById,
  getIngredients,
  getFoodRecipe,
  createGuestToken,
};
