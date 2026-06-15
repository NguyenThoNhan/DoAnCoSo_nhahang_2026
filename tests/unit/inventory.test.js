// tests/unit/inventory.test.js
// Liên kết yêu cầu:
//   REQ-INV-01 — Trừ kho tự động khi đơn hàng completed
//   REQ-INV-02 — Thêm / sửa / xóa nguyên liệu

require('../helpers/mockDb');
const { pool } = require('../../config/database');

// ── Mock các model ──────────────────────────────────────────────
jest.mock('../../src/models/Ingredient', () => ({
  findAll: jest.fn(),
  create:  jest.fn(),
  update:  jest.fn(),
  delete:  jest.fn(),
}));
jest.mock('../../src/models/Food',      () => ({ findAll: jest.fn() }));
jest.mock('../../src/models/Category',  () => ({}));
jest.mock('../../src/models/Table',     () => ({}));
jest.mock('../../src/models/Staff',     () => ({}));
jest.mock('../../src/models/Customer',  () => ({}));
jest.mock('../../src/models/Combo',     () => ({}));
jest.mock('../../src/models/FoodRecipe',() => ({}));

const Ingredient     = require('../../src/models/Ingredient');
const adminController = require('../../src/controllers/admin.controller');

// ── Helper req / res giả ────────────────────────────────────────
const mockReq = (body = {}, params = {}) => ({ body, params });
const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
};

// ── Hàm deductInventory tách ra để test logic thuần ─────────────
// Logic từ admin.controller.js — hàm deductInventory (private)
async function deductInventory(connection, orderId) {
  const [items] = await connection.execute(
    'SELECT food_id, quantity FROM order_items WHERE order_id = ?',
    [orderId]
  );
  for (const item of items) {
    const [recipe] = await connection.execute(
      'SELECT ingredient_id, quantity_required FROM food_recipes WHERE food_id = ?',
      [item.food_id]
    );
    for (const ing of recipe) {
      await connection.execute(
        'UPDATE ingredients SET stock_quantity = GREATEST(0, stock_quantity - ?) WHERE id = ?',
        [ing.quantity_required * item.quantity, ing.ingredient_id]
      );
    }
  }
}

// ════════════════════════════════════════════════════════════════
// HỘP TRẮNG — deductInventory
// Kỹ thuật: Branch Coverage + Statement Coverage
// REQ-INV-01
// ════════════════════════════════════════════════════════════════
describe('[HỘP TRẮNG] deductInventory — REQ-INV-01', () => {

  test('TC-WB-INV-01 | Đơn có 1 món, 1 nguyên liệu → UPDATE được gọi đúng 1 lần', async () => {
    const mockConn = {
      execute: jest.fn()
        // Lần 1: SELECT order_items
        .mockResolvedValueOnce([[{ food_id: 1, quantity: 2 }]])
        // Lần 2: SELECT food_recipes
        .mockResolvedValueOnce([[{ ingredient_id: 10, quantity_required: 3 }]])
        // Lần 3: UPDATE ingredients
        .mockResolvedValueOnce([{}]),
    };

    await deductInventory(mockConn, 5);

    // UPDATE phải được gọi với đúng lượng trừ: 3 * 2 = 6
    expect(mockConn.execute).toHaveBeenCalledWith(
      'UPDATE ingredients SET stock_quantity = GREATEST(0, stock_quantity - ?) WHERE id = ?',
      [6, 10]
    );
    expect(mockConn.execute).toHaveBeenCalledTimes(3);
  });

  test('TC-WB-INV-02 | Đơn có 2 món, mỗi món 1 nguyên liệu → UPDATE gọi 2 lần', async () => {
    const mockConn = {
      execute: jest.fn()
        // SELECT order_items → 2 món
        .mockResolvedValueOnce([[
          { food_id: 1, quantity: 1 },
          { food_id: 2, quantity: 2 },
        ]])
        // SELECT food_recipes cho món 1
        .mockResolvedValueOnce([[{ ingredient_id: 10, quantity_required: 2 }]])
        // UPDATE cho món 1
        .mockResolvedValueOnce([{}])
        // SELECT food_recipes cho món 2
        .mockResolvedValueOnce([[{ ingredient_id: 11, quantity_required: 1 }]])
        // UPDATE cho món 2
        .mockResolvedValueOnce([{}]),
    };

    await deductInventory(mockConn, 6);

    // Tổng số execute: 1(select items) + 2*(1 select recipe + 1 update) = 5
    expect(mockConn.execute).toHaveBeenCalledTimes(5);
  });

  test('TC-WB-INV-03 | Đơn không có món nào → KHÔNG gọi UPDATE', async () => {
    const mockConn = {
      execute: jest.fn()
        // SELECT order_items → rỗng
        .mockResolvedValueOnce([[]])
    };

    await deductInventory(mockConn, 7);

    expect(mockConn.execute).toHaveBeenCalledTimes(1); // chỉ SELECT ban đầu
  });

  // BVA: Số lượng nguyên liệu sau trừ không âm (GREATEST(0,...))
  test('TC-WB-INV-04 | BVA: Trừ vượt quá tồn kho → GREATEST(0,...) ngăn số âm', async () => {
    const mockConn = {
      execute: jest.fn()
        .mockResolvedValueOnce([[{ food_id: 1, quantity: 100 }]])
        .mockResolvedValueOnce([[{ ingredient_id: 5, quantity_required: 100 }]])
        .mockResolvedValueOnce([{}]),
    };

    await deductInventory(mockConn, 8);

    // UPDATE được gọi với 100*100=10000 nhưng GREATEST(0,...) trong SQL xử lý
    expect(mockConn.execute).toHaveBeenCalledWith(
      'UPDATE ingredients SET stock_quantity = GREATEST(0, stock_quantity - ?) WHERE id = ?',
      [10000, 5]
    );
  });
});

// ════════════════════════════════════════════════════════════════
// HỘP ĐEN — createIngredient
// Kỹ thuật: Phân lớp tương đương
// REQ-INV-02
// ════════════════════════════════════════════════════════════════
describe('[HỘP ĐEN] createIngredient — REQ-INV-02', () => {
  beforeEach(() => jest.clearAllMocks());

  test('TC-BB-ING-01 | Đủ name + unit → 201', async () => {
    Ingredient.create.mockResolvedValue(3);
    const res = mockRes();
    await adminController.createIngredient(
      mockReq({ name: 'Thịt bò', unit: 'gram', stock_quantity: 500, min_stock_level: 50 }),
      res
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ id: 3 })
    );
  });

  test('TC-BB-ING-02 | Thiếu name → 400', async () => {
    const res = mockRes();
    await adminController.createIngredient(
      mockReq({ unit: 'gram' }), res
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(Ingredient.create).not.toHaveBeenCalled();
  });

  test('TC-BB-ING-03 | Thiếu unit → 400', async () => {
    const res = mockRes();
    await adminController.createIngredient(
      mockReq({ name: 'Thịt bò' }), res
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('TC-BB-ING-04 | Thiếu cả name lẫn unit → 400', async () => {
    const res = mockRes();
    await adminController.createIngredient(mockReq({}), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  // BVA: stock_quantity mặc định = 0 khi không truyền
  test('TC-BB-ING-05 | BVA: Không truyền stock_quantity → mặc định 0, vẫn 201', async () => {
    Ingredient.create.mockResolvedValue(4);
    const res = mockRes();
    await adminController.createIngredient(
      mockReq({ name: 'Muối', unit: 'gram' }), res
    );
    // Trong controller: Ingredient.create(name, unit, stock_quantity || 0, min_stock_level || 0)
    expect(Ingredient.create).toHaveBeenCalledWith('Muối', 'gram', 0, 0);
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

// ════════════════════════════════════════════════════════════════
// HỘP TRẮNG — createIngredient
// Branch Coverage — 2 nhánh
// REQ-INV-02
// ════════════════════════════════════════════════════════════════
describe('[HỘP TRẮNG] createIngredient — Branch Coverage — REQ-INV-02', () => {
  beforeEach(() => jest.clearAllMocks());

  // Nhánh 1: !name || !unit → return 400
  test('TC-WB-ING-01 | Nhánh 1: thiếu unit → 400, KHÔNG gọi Ingredient.create', async () => {
    const res = mockRes();
    await adminController.createIngredient(
      mockReq({ name: 'Bột mì' }), res
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(Ingredient.create).not.toHaveBeenCalled();
  });

  // Nhánh 2: đủ điều kiện → Ingredient.create → 201
  test('TC-WB-ING-02 | Nhánh 2: đủ name + unit → gọi Ingredient.create, 201', async () => {
    Ingredient.create.mockResolvedValue(5);
    const res = mockRes();
    await adminController.createIngredient(
      mockReq({ name: 'Bột mì', unit: 'kg', stock_quantity: 10 }), res
    );
    expect(Ingredient.create).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });
});