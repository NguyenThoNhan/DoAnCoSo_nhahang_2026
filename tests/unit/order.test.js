// tests/unit/order.test.js
// Liên kết yêu cầu:
//   REQ-ORDER-01 — Tạo đơn hàng và tính tổng tiền
//   REQ-PROMO-01 — Áp mã khuyến mãi (% và cố định)
//   REQ-ORDER-02 — Cập nhật trạng thái đơn hàng

require('../helpers/mockDb');
const { pool } = require('../../config/database');

// ── Mock các model cần thiết ────────────────────────────────────
jest.mock('../../src/models/Food',      () => ({ findAll: jest.fn() }));
jest.mock('../../src/models/Category',  () => ({ findAll: jest.fn() }));
jest.mock('../../src/models/Table',     () => ({ findAll: jest.fn(), findByTableNumber: jest.fn() }));
jest.mock('../../src/models/Order',     () => ({ findByUserId: jest.fn() }));
jest.mock('../../src/models/OrderDetail', () => ({}));
jest.mock('../../src/models/Customer',  () => ({ findById: jest.fn() }));
jest.mock('../../src/models/Combo',     () => ({ findAll: jest.fn() }));
jest.mock('../../src/models/FoodRecipe',() => ({ findByFoodId: jest.fn() }));
jest.mock('../../src/models/Inventory', () => ({
  deductStock: jest.fn().mockResolvedValue(undefined),
}));

const userController  = require('../../src/controllers/user.controller');
const adminController = require('../../src/controllers/admin.controller');

// ── Helper req / res giả ────────────────────────────────────────
const mockReq = (body = {}, params = {}, extra = {}) => ({ body, params, ...extra });
const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
};

// ── Logic thuần (mirror controller, test độc lập) ───────────────
const {
  calculateOrderTotal,
  validateLoginInput,
  validateFoodInput,
  applyPromotion,
} = require('../helpers/pureLogic');

// ════════════════════════════════════════════════════════════════
// HỘP ĐEN — Tính tổng tiền đơn hàng
// Kỹ thuật: Phân lớp tương đương + Boundary Value Analysis
// ════════════════════════════════════════════════════════════════
describe('[HỘP ĐEN] Tính tổng tiền đơn hàng — REQ-ORDER-01', () => {

  // ── Lớp hợp lệ: Không có KM ─────────────────────────────────
  test('TC-BB-ORDER-01 | 1 món không KM → tổng đúng', () => {
    const items = [{ priceAtOrder: 50000, quantity: 1 }];
    expect(calculateOrderTotal(items, null).total).toBe(50000);
  });

  test('TC-BB-ORDER-02 | Nhiều món không KM → tổng cộng đúng', () => {
    const items = [
      { priceAtOrder: 50000, quantity: 2 },
      { priceAtOrder: 30000, quantity: 1 },
    ];
    expect(calculateOrderTotal(items, null).total).toBe(130000);
  });

  test('TC-BB-ORDER-03 | Số lượng lớn (5 món) → tổng đúng', () => {
    const items = [
      { priceAtOrder: 20000, quantity: 5 },
      { priceAtOrder: 35000, quantity: 3 },
    ];
    // 100000 + 105000 = 205000
    expect(calculateOrderTotal(items, null).total).toBe(205000);
  });

  // ── Lớp hợp lệ: KM theo % ───────────────────────────────────
  test('TC-BB-ORDER-04 | KM 10% trên 100.000đ → giảm 10.000đ, còn 90.000đ', () => {
    const items = [{ priceAtOrder: 100000, quantity: 1 }];
    const { discount, total } = calculateOrderTotal(items, { type: 'percent', value: 10 });
    expect(discount).toBe(10000);
    expect(total).toBe(90000);
  });

  test('TC-BB-ORDER-05 | KM 50% → giảm đúng 50%', () => {
    const items = [{ priceAtOrder: 200000, quantity: 1 }];
    const { total } = calculateOrderTotal(items, { type: 'percent', value: 50 });
    expect(total).toBe(100000);
  });

  // ── Lớp hợp lệ: KM cố định ──────────────────────────────────
  test('TC-BB-ORDER-06 | KM cố định 30.000đ → giảm đúng 30.000đ', () => {
    const items = [{ priceAtOrder: 150000, quantity: 1 }];
    const { total } = calculateOrderTotal(items, { type: 'fixed', value: 30000 });
    expect(total).toBe(120000);
  });

  // ── Boundary Value Analysis ──────────────────────────────────
  test('TC-BB-ORDER-07 | BVA: KM 0% → total không đổi', () => {
    const items = [{ priceAtOrder: 50000, quantity: 1 }];
    expect(calculateOrderTotal(items, { type: 'percent', value: 0 }).total).toBe(50000);
  });

  test('TC-BB-ORDER-08 | BVA: KM 100% → total = 0', () => {
    const items = [{ priceAtOrder: 50000, quantity: 1 }];
    expect(calculateOrderTotal(items, { type: 'percent', value: 100 }).total).toBe(0);
  });

  test('TC-BB-ORDER-09 | BVA: Số lượng = 1 (biên dưới) → đúng', () => {
    const items = [{ priceAtOrder: 35000, quantity: 1 }];
    expect(calculateOrderTotal(items, null).total).toBe(35000);
  });

  test('TC-BB-ORDER-10 | BVA: Giá = 0 (biên dưới bất thường) → total = 0', () => {
    const items = [{ priceAtOrder: 0, quantity: 5 }];
    expect(calculateOrderTotal(items, null).total).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// UNIT TEST — Hàm thuần: validate input
// Mirror auth.controller.js + admin.controller.js
// ════════════════════════════════════════════════════════════════
describe('[UNIT] validateLoginInput — logic thuần', () => {
  test('TC-UNIT-AUTH-01 | Email + password đủ → valid', () => {
    expect(validateLoginInput('a@b.com', '123456').valid).toBe(true);
  });

  test('TC-UNIT-AUTH-02 | Thiếu email → invalid 400', () => {
    const r = validateLoginInput('', '123456');
    expect(r.valid).toBe(false);
    expect(r.status).toBe(400);
  });

  test('TC-UNIT-AUTH-03 | Thiếu password → invalid 400', () => {
    expect(validateLoginInput('a@b.com', '').valid).toBe(false);
  });
});

describe('[UNIT] validateFoodInput — logic thuần', () => {
  test('TC-UNIT-FOOD-01 | Đủ name, category_id, price → valid', () => {
    expect(validateFoodInput({ name: 'Phở', category_id: 1, price: 45000 }).valid).toBe(true);
  });

  test('TC-UNIT-FOOD-02 | Thiếu price → invalid 400', () => {
    expect(validateFoodInput({ name: 'Phở', category_id: 1 }).valid).toBe(false);
  });

  test('TC-UNIT-FOOD-03 | BVA price=0 → invalid (falsy)', () => {
    expect(validateFoodInput({ name: 'Phở', category_id: 1, price: 0 }).valid).toBe(false);
  });
});

describe('[UNIT] applyPromotion — logic thuần xử lý mã KM', () => {
  test('TC-UNIT-PROMO-01 | promo=null → 404', () => {
    expect(applyPromotion(null, 100000).status).toBe(404);
  });

  test('TC-UNIT-PROMO-02 | subtotal < min_order → 400', () => {
    const r = applyPromotion(
      { id: 1, type: 'percent', value: 10, min_order_amount: 200000 },
      50000
    );
    expect(r.status).toBe(400);
  });

  test('TC-UNIT-PROMO-03 | KM percent 10% → discount đúng', () => {
    const r = applyPromotion(
      { id: 1, type: 'percent', value: 10, min_order_amount: 0 },
      200000
    );
    expect(r.discount_amount).toBe(20000);
  });

  test('TC-UNIT-PROMO-04 | KM fixed → discount = value', () => {
    const r = applyPromotion(
      { id: 2, type: 'fixed', value: 30000, min_order_amount: 0 },
      200000
    );
    expect(r.discount_amount).toBe(30000);
  });
});

// ════════════════════════════════════════════════════════════════
// HỘP TRẮNG — checkCoupon
// File: src/controllers/user.controller.js — exports.checkCoupon
// Kỹ thuật: Branch Coverage — 4 nhánh
// ════════════════════════════════════════════════════════════════
describe('[HỘP TRẮNG] checkCoupon — Branch Coverage — REQ-PROMO-01', () => {
  beforeEach(() => jest.clearAllMocks());

  // Nhánh 1: rows.length === 0 → mã không tồn tại/hết hạn → 404
  test('TC-WB-PROMO-01 | Nhánh 1: mã không tồn tại → 404', async () => {
    pool.execute.mockResolvedValue([[]]);
    const res = mockRes();
    await userController.checkCoupon(
      mockReq({ code: 'INVALID', subtotal: 100000 }), res
    );
    expect(res.status).toHaveBeenCalledWith(404);
  });

  // Nhánh 2: subtotal < min_order_amount → 400
  test('TC-WB-PROMO-02 | Nhánh 2: đơn chưa đủ min_order → 400', async () => {
    pool.execute.mockResolvedValue([[{
      id: 1, code: 'SALE10', type: 'percent',
      value: 10, min_order_amount: 200000,
    }]]);
    const res = mockRes();
    await userController.checkCoupon(
      mockReq({ code: 'SALE10', subtotal: 100000 }), res
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  // Nhánh 3: type === 'percent' → discount = subtotal * value / 100
  test('TC-WB-PROMO-03 | Nhánh 3: type=percent → discount đúng 10%', async () => {
    pool.execute.mockResolvedValue([[{
      id: 1, code: 'SALE10', type: 'percent',
      value: 10, min_order_amount: 0,
    }]]);
    const res = mockRes();
    await userController.checkCoupon(
      mockReq({ code: 'SALE10', subtotal: 200000 }), res
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ discount_amount: 20000 })
    );
  });

  // Nhánh 4: type !== 'percent' → discount = value (fixed)
  test('TC-WB-PROMO-04 | Nhánh 4: type=fixed → discount = value', async () => {
    pool.execute.mockResolvedValue([[{
      id: 2, code: 'FIXED30K', type: 'fixed',
      value: 30000, min_order_amount: 0,
    }]]);
    const res = mockRes();
    await userController.checkCoupon(
      mockReq({ code: 'FIXED30K', subtotal: 200000 }), res
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ discount_amount: 30000 })
    );
  });
});

// ════════════════════════════════════════════════════════════════
// HỘP ĐEN + HỘP TRẮNG — updateOrderStatus
// File: src/controllers/admin.controller.js — exports.updateOrderStatus
// ════════════════════════════════════════════════════════════════
describe('[HỘP ĐEN] updateOrderStatus — REQ-ORDER-02', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── Lớp hợp lệ ──────────────────────────────────────────────
  const validStatuses = ['pending', 'processing', 'completed', 'cancelled'];
  validStatuses.forEach((status) => {
    test(`TC-BB-STATUS-0x | status="${status}" hợp lệ → 200`, async () => {
      const mockConn = {
        execute: jest.fn()
          .mockResolvedValueOnce([[{ user_id: null, table_id: 2, total_amount: 100000 }]])
          .mockResolvedValueOnce([{}])
          .mockResolvedValue([[]]),
        beginTransaction: jest.fn(),
        commit: jest.fn(),
        rollback: jest.fn(),
        release: jest.fn(),
      };
      pool.getConnection.mockResolvedValue(mockConn);
      const res = mockRes();
      await adminController.updateOrderStatus(
        mockReq({ status }, { id: '1' }), res
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  // ── Lớp không hợp lệ ────────────────────────────────────────
  test('TC-BB-STATUS-05 | status không hợp lệ ("flying") → 400', async () => {
    const res = mockRes();
    await adminController.updateOrderStatus(
      mockReq({ status: 'flying' }, { id: '1' }), res
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('TC-BB-STATUS-06 | status rỗng → 400', async () => {
    const res = mockRes();
    await adminController.updateOrderStatus(
      mockReq({ status: '' }, { id: '1' }), res
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('[HỘP TRẮNG] updateOrderStatus — Branch Coverage — REQ-ORDER-02', () => {
  beforeEach(() => jest.clearAllMocks());

  // Nhánh 1: validStatuses không chứa status → return 400, không vào DB
  test('TC-WB-STATUS-01 | Nhánh 1: status sai → 400, không gọi getConnection', async () => {
    const res = mockRes();
    await adminController.updateOrderStatus(
      mockReq({ status: 'invalid' }, { id: '5' }), res
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  // Nhánh 2: đơn không tồn tại → rollback + 404
  test('TC-WB-STATUS-02 | Nhánh 2: orderId không tồn tại → rollback + 404', async () => {
    const mockConn = {
      execute: jest.fn().mockResolvedValueOnce([[]]), // empty result
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn(),
    };
    pool.getConnection.mockResolvedValue(mockConn);
    const res = mockRes();
    await adminController.updateOrderStatus(
      mockReq({ status: 'processing' }, { id: '999' }), res
    );
    expect(mockConn.rollback).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });

  // Nhánh 3: status = completed → gọi deductInventory + addMemberPoints → commit
  test('TC-WB-STATUS-03 | Nhánh 3: status=completed → commit, không rollback', async () => {
    const mockConn = {
      execute: jest.fn()
        .mockResolvedValueOnce([[{ user_id: null, table_id: 2, total_amount: 150000 }]])
        .mockResolvedValueOnce([{}])
        .mockResolvedValue([[]]),
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn(),
    };
    pool.getConnection.mockResolvedValue(mockConn);
    const res = mockRes();
    await adminController.updateOrderStatus(
      mockReq({ status: 'completed' }, { id: '10' }), res
    );
    expect(mockConn.commit).toHaveBeenCalled();
    expect(mockConn.rollback).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // Nhánh 4: status = cancelled → chỉ UPDATE, KHÔNG gọi deductInventory
  test('TC-WB-STATUS-04 | Nhánh 4: status=cancelled → execute đúng 2 lần (SELECT+UPDATE)', async () => {
    const mockConn = {
      execute: jest.fn()
        .mockResolvedValueOnce([[{ user_id: 1, table_id: 2, total_amount: 100000 }]])
        .mockResolvedValue([{}]),
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn(),
    };
    pool.getConnection.mockResolvedValue(mockConn);
    const res = mockRes();
    await adminController.updateOrderStatus(
      mockReq({ status: 'cancelled' }, { id: '10' }), res
    );
    // SELECT + UPDATE status = 2 lần, không có thêm call deductInventory
    expect(mockConn.execute).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});