// tests/api/food.api.test.js
// Kiểm thử tích hợp API — Món ăn và Thực đơn công khai
// Liên kết yêu cầu: REQ-FOOD-01, REQ-FOOD-02, REQ-FOOD-03

jest.mock('../../config/database', () => ({
  pool: {
    execute: jest.fn(),
    getConnection: jest.fn(() =>
      Promise.resolve({
        execute: jest.fn(), beginTransaction: jest.fn(),
        commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
      })
    ),
  },
  checkDatabaseConnection: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../src/models/Food', () => ({
  findAll:            jest.fn(),
  findById:           jest.fn(),
  create:             jest.fn(),
  update:             jest.fn(),
  delete:             jest.fn(),
  updateAvailability: jest.fn(),
}));
jest.mock('../../src/models/Category',  () => ({ findAll: jest.fn() }));
jest.mock('../../src/models/User',      () => ({ findByEmail: jest.fn() }));

const request  = require('supertest');
const app      = require('../../server');
const Food     = require('../../src/models/Food');
const { makeAdminToken } = require('../helpers/testTokens');

// ════════════════════════════════════════════════════════════════
// API TEST — GET /api/user/public/menu (không cần token)
// ════════════════════════════════════════════════════════════════
describe('[API] GET /api/user/public/menu — REQ-FOOD-03', () => {
  beforeEach(() => jest.clearAllMocks());

  test('TC-API-MENU-01 | Có món available → trả danh sách đúng', async () => {
    Food.findAll.mockResolvedValue([
      { id: 1, name: 'Phở bò',  is_available: true  },
      { id: 2, name: 'Bún riêu', is_available: false },
      { id: 3, name: 'Cơm tấm', is_available: true  },
    ]);

    const res = await request(app).get('/api/user/public/menu');

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Chỉ trả về món available
    expect(res.body.every(f => f.is_available)).toBe(true);
    expect(res.body).toHaveLength(2);
  });

  test('TC-API-MENU-02 | Không có món nào → trả mảng rỗng', async () => {
    Food.findAll.mockResolvedValue([]);

    const res = await request(app).get('/api/user/public/menu');

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  test('TC-API-MENU-03 | DB lỗi → 500', async () => {
    Food.findAll.mockRejectedValue(new Error('DB error'));

    const res = await request(app).get('/api/user/public/menu');

    expect(res.statusCode).toBe(500);
  });
});

// ════════════════════════════════════════════════════════════════
// API TEST — GET /api/admin/foods (cần Admin token)
// ════════════════════════════════════════════════════════════════
describe('[API] GET /api/admin/foods — REQ-FOOD-01', () => {
  beforeEach(() => jest.clearAllMocks());

  test('TC-API-FOOD-01 | Có token admin → 200 + danh sách', async () => {
    Food.findAll.mockResolvedValue([
      { id: 1, name: 'Phở bò', price: 45000 },
    ]);

    const res = await request(app)
      .get('/api/admin/foods')
      .set('Authorization', `Bearer ${makeAdminToken()}`);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('TC-API-FOOD-02 | Không có token → 401', async () => {
    const res = await request(app).get('/api/admin/foods');
    expect(res.statusCode).toBe(401);
  });

  test('TC-API-FOOD-03 | Token không hợp lệ → 403', async () => {
    const res = await request(app)
      .get('/api/admin/foods')
      .set('Authorization', 'Bearer invalid.token.here');
    expect(res.statusCode).toBe(403);
  });
});

// ════════════════════════════════════════════════════════════════
// API TEST — POST /api/admin/foods (tạo món mới)
// ════════════════════════════════════════════════════════════════
describe('[API] POST /api/admin/foods — REQ-FOOD-01', () => {
  beforeEach(() => jest.clearAllMocks());

  test('TC-API-FOOD-04 | Đủ thông tin bắt buộc → 201', async () => {
    Food.create.mockResolvedValue(10);

    const res = await request(app)
      .post('/api/admin/foods')
      .set('Authorization', `Bearer ${makeAdminToken()}`)
      .send({ name: 'Phở bò', category_id: 1, price: 45000 });

    expect(res.statusCode).toBe(201);
  });

  test('TC-API-FOOD-05 | Thiếu name → 400', async () => {
    const res = await request(app)
      .post('/api/admin/foods')
      .set('Authorization', `Bearer ${makeAdminToken()}`)
      .send({ category_id: 1, price: 45000 });

    expect(res.statusCode).toBe(400);
  });

  test('TC-API-FOOD-06 | Thiếu price → 400', async () => {
    const res = await request(app)
      .post('/api/admin/foods')
      .set('Authorization', `Bearer ${makeAdminToken()}`)
      .send({ name: 'Phở bò', category_id: 1 });

    expect(res.statusCode).toBe(400);
  });

  test('TC-API-FOOD-07 | Không có token → 401', async () => {
    const res = await request(app)
      .post('/api/admin/foods')
      .send({ name: 'Phở bò', category_id: 1, price: 45000 });

    expect(res.statusCode).toBe(401);
  });
});

// ════════════════════════════════════════════════════════════════
// API TEST — PUT /api/admin/foods/:id/availability
// ════════════════════════════════════════════════════════════════
describe('[API] PUT /api/admin/foods/:id/availability — REQ-FOOD-02', () => {
  beforeEach(() => jest.clearAllMocks());

  test('TC-API-AVAIL-01 | is_available=true, token admin → 200', async () => {
    Food.updateAvailability.mockResolvedValue(1);

    const res = await request(app)
      .put('/api/admin/foods/5/availability')
      .set('Authorization', `Bearer ${makeAdminToken()}`)
      .send({ is_available: true });

    expect(res.statusCode).toBe(200);
  });

  test('TC-API-AVAIL-02 | is_available=false → 200 (ẩn món)', async () => {
    Food.updateAvailability.mockResolvedValue(1);

    const res = await request(app)
      .put('/api/admin/foods/5/availability')
      .set('Authorization', `Bearer ${makeAdminToken()}`)
      .send({ is_available: false });

    expect(res.statusCode).toBe(200);
  });

  test('TC-API-AVAIL-03 | Thiếu is_available → 400', async () => {
    const res = await request(app)
      .put('/api/admin/foods/5/availability')
      .set('Authorization', `Bearer ${makeAdminToken()}`)
      .send({});

    expect(res.statusCode).toBe(400);
  });

  test('TC-API-AVAIL-04 | Không có token → 401', async () => {
    const res = await request(app)
      .put('/api/admin/foods/5/availability')
      .send({ is_available: true });

    expect(res.statusCode).toBe(401);
  });
});