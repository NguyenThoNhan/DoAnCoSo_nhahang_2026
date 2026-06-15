// tests/api/order.api.test.js
// Kiểm thử tích hợp API — Đơn hàng và Khuyến mãi
// Liên kết yêu cầu: REQ-ORDER-01, REQ-ORDER-02, REQ-PROMO-01

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

jest.mock('../../src/models/Food',       () => ({ findAll: jest.fn() }));
jest.mock('../../src/models/Category',   () => ({ findAll: jest.fn() }));
jest.mock('../../src/models/Table',      () => ({ findAll: jest.fn(), findByTableNumber: jest.fn() }));
jest.mock('../../src/models/Order',      () => ({ findByUserId: jest.fn() }));
jest.mock('../../src/models/OrderDetail',() => ({}));
jest.mock('../../src/models/Customer',   () => ({ findById: jest.fn() }));
jest.mock('../../src/models/Combo',      () => ({ findAll: jest.fn() }));
jest.mock('../../src/models/FoodRecipe', () => ({ findByFoodId: jest.fn() }));
jest.mock('../../src/models/User',       () => ({ findByEmail: jest.fn() }));
jest.mock('../../src/models/Ingredient', () => ({ findAll: jest.fn() }));
jest.mock('../../src/models/Staff',      () => ({ findAll: jest.fn() }));
jest.mock('../../src/models/Inventory', () => ({
  deductStock: jest.fn().mockResolvedValue(undefined),
}));

const request = require('supertest');
const app     = require('../../server');
const { pool } = require('../../config/database');
const { makeAdminToken, makeGuestToken } = require('../helpers/testTokens');

// ════════════════════════════════════════════════════════════════
// API TEST — POST /api/user/public/promotions/check
// ════════════════════════════════════════════════════════════════
describe('[API] POST /api/user/public/promotions/check — REQ-PROMO-01', () => {
  beforeEach(() => jest.clearAllMocks());

  test('TC-API-PROMO-01 | Mã hợp lệ, đơn đủ min → 200 + discount_amount', async () => {
    pool.execute.mockResolvedValue([[{
      id: 1, code: 'SALE10', type: 'percent',
      value: 10, min_order_amount: 50000,
    }]]);

    const res = await request(app)
      .post('/api/user/public/promotions/check')
      .send({ code: 'SALE10', subtotal: 100000 });

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('discount_amount');
    expect(res.body.discount_amount).toBe(10000);
  });

  test('TC-API-PROMO-02 | Mã không tồn tại → 404', async () => {
    pool.execute.mockResolvedValue([[]]);

    const res = await request(app)
      .post('/api/user/public/promotions/check')
      .send({ code: 'KHONGTONTAI', subtotal: 100000 });

    expect(res.statusCode).toBe(404);
  });

  test('TC-API-PROMO-03 | Đơn chưa đủ min_order_amount → 400', async () => {
    pool.execute.mockResolvedValue([[{
      id: 1, code: 'SALE10', type: 'percent',
      value: 10, min_order_amount: 200000,
    }]]);

    const res = await request(app)
      .post('/api/user/public/promotions/check')
      .send({ code: 'SALE10', subtotal: 50000 });

    expect(res.statusCode).toBe(400);
  });

  test('TC-API-PROMO-04 | KM loại fixed → discount = value', async () => {
    pool.execute.mockResolvedValue([[{
      id: 2, code: 'FIXED50K', type: 'fixed',
      value: 50000, min_order_amount: 0,
    }]]);

    const res = await request(app)
      .post('/api/user/public/promotions/check')
      .send({ code: 'FIXED50K', subtotal: 200000 });

    expect(res.statusCode).toBe(200);
    expect(res.body.discount_amount).toBe(50000);
  });
});

// ════════════════════════════════════════════════════════════════
// API TEST — POST /api/user/order/create
// ════════════════════════════════════════════════════════════════
describe('[API] POST /api/user/order/create — REQ-ORDER-01', () => {
  beforeEach(() => jest.clearAllMocks());

  test('TC-API-ORDER-01 | Guest token hợp lệ + đủ items → 201', async () => {
    const mockConn = {
      execute: jest.fn().mockResolvedValue([{ insertId: 99 }]),
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn(),
    };
    pool.getConnection.mockResolvedValue(mockConn);

    const res = await request(app)
      .post('/api/user/order/create')
      .set('Authorization', `Bearer ${makeGuestToken(1)}`)
      .send({
        items: [{ foodId: 1, quantity: 2, priceAtOrder: 45000, itemName: 'Phở bò' }],
      });

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('order_id');
  });

  test('TC-API-ORDER-02 | Không có token → 401', async () => {
    const res = await request(app)
      .post('/api/user/order/create')
      .send({
        items: [{ foodId: 1, quantity: 1, priceAtOrder: 45000, itemName: 'Phở bò' }],
      });

    expect(res.statusCode).toBe(401);
  });

  test('TC-API-ORDER-03 | Token guest hợp lệ, thiếu items → 400', async () => {
    const res = await request(app)
      .post('/api/user/order/create')
      .set('Authorization', `Bearer ${makeGuestToken(1)}`)
      .send({ items: [] });

    expect(res.statusCode).toBe(400);
  });

  test('TC-API-ORDER-04 | Token guest hợp lệ, không có items field → 400', async () => {
    const res = await request(app)
      .post('/api/user/order/create')
      .set('Authorization', `Bearer ${makeGuestToken(1)}`)
      .send({});

    expect(res.statusCode).toBe(400);
  });
});

// ════════════════════════════════════════════════════════════════
// API TEST — PUT /api/admin/orders/:id/status
// ════════════════════════════════════════════════════════════════
describe('[API] PUT /api/admin/orders/:id/status — REQ-ORDER-02', () => {
  beforeEach(() => jest.clearAllMocks());

  const validStatuses = ['pending', 'processing', 'completed', 'cancelled'];

  validStatuses.forEach((status) => {
    test(`TC-API-STATUS-0x | status="${status}" + token admin → 200`, async () => {
      const mockConn = {
        execute: jest.fn()
          .mockResolvedValueOnce([[{ user_id: null, table_id: 1, total_amount: 100000 }]])
          .mockResolvedValueOnce([{}])
          .mockResolvedValue([[]]),
        beginTransaction: jest.fn(),
        commit: jest.fn(),
        rollback: jest.fn(),
        release: jest.fn(),
      };
      pool.getConnection.mockResolvedValue(mockConn);

      const res = await request(app)
        .put('/api/admin/orders/1/status')
        .set('Authorization', `Bearer ${makeAdminToken()}`)
        .send({ status });

      expect(res.statusCode).toBe(200);
    });
  });

  test('TC-API-STATUS-05 | status không hợp lệ → 400', async () => {
    const res = await request(app)
      .put('/api/admin/orders/1/status')
      .set('Authorization', `Bearer ${makeAdminToken()}`)
      .send({ status: 'unknownstatus' });

    expect(res.statusCode).toBe(400);
  });

  test('TC-API-STATUS-06 | Không có token → 401', async () => {
    const res = await request(app)
      .put('/api/admin/orders/1/status')
      .send({ status: 'processing' });

    expect(res.statusCode).toBe(401);
  });

  test('TC-API-STATUS-07 | order_id không tồn tại → 404', async () => {
    const mockConn = {
      execute: jest.fn().mockResolvedValueOnce([[]]),
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn(),
    };
    pool.getConnection.mockResolvedValue(mockConn);

    const res = await request(app)
      .put('/api/admin/orders/99999/status')
      .set('Authorization', `Bearer ${makeAdminToken()}`)
      .send({ status: 'processing' });

    expect(res.statusCode).toBe(404);
  });
});