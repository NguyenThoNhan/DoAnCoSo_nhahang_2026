// tests/unit/food.test.js
// Liên kết yêu cầu:
//   REQ-FOOD-01 — Thêm / sửa món ăn
//   REQ-FOOD-02 — Bật / tắt trạng thái phục vụ món ăn
//   REQ-FOOD-03 — Lấy danh sách thực đơn (chỉ hiển thị món available)

require('../helpers/mockDb');

// ── Mock model Food ─────────────────────────────────────────────
jest.mock('../../src/models/Food', () => ({
  findAll:           jest.fn(),
  findById:          jest.fn(),
  create:            jest.fn(),
  update:            jest.fn(),
  delete:            jest.fn(),
  updateAvailability: jest.fn(),
}));
const Food           = require('../../src/models/Food');
const adminController = require('../../src/controllers/admin.controller');
const userController  = require('../../src/controllers/user.controller');

// ── Helper req / res giả ────────────────────────────────────────
const mockReq = (body = {}, params = {}) => ({ body, params });
const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
};

// ════════════════════════════════════════════════════════════════
// HỘP ĐEN — createFood
// Kỹ thuật: Phân lớp tương đương + BVA
// REQ-FOOD-01
// ════════════════════════════════════════════════════════════════
describe('[HỘP ĐEN] createFood — REQ-FOOD-01', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── Lớp hợp lệ ──────────────────────────────────────────────
  test('TC-BB-FOOD-01 | Đủ name + category_id + price → 201', async () => {
    Food.create.mockResolvedValue(5);
    const res = mockRes();
    await adminController.createFood(
      mockReq({ name: 'Phở bò', category_id: 1, price: 45000,
                description: 'Phở truyền thống', is_featured: false }),
      res
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ id: 5 })
    );
  });

  // ── Lớp không hợp lệ: thiếu trường bắt buộc ────────────────
  test('TC-BB-FOOD-02 | Thiếu name → 400', async () => {
    const res = mockRes();
    await adminController.createFood(
      mockReq({ category_id: 1, price: 45000 }), res
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(Food.create).not.toHaveBeenCalled();
  });

  test('TC-BB-FOOD-03 | Thiếu category_id → 400', async () => {
    const res = mockRes();
    await adminController.createFood(
      mockReq({ name: 'Phở bò', price: 45000 }), res
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('TC-BB-FOOD-04 | Thiếu price → 400', async () => {
    const res = mockRes();
    await adminController.createFood(
      mockReq({ name: 'Phở bò', category_id: 1 }), res
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('TC-BB-FOOD-05 | Tất cả trường rỗng → 400', async () => {
    const res = mockRes();
    await adminController.createFood(mockReq({}), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  // ── Boundary Value Analysis ──────────────────────────────────
  test('TC-BB-FOOD-06 | BVA: price = 0 (biên dưới) → 400 vì thiếu price truthy', async () => {
    const res = mockRes();
    await adminController.createFood(
      mockReq({ name: 'Test', category_id: 1, price: 0 }), res
    );
    // price=0 là falsy → controller coi là thiếu → 400
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('TC-BB-FOOD-07 | BVA: price = 1 (biên trên tối thiểu hợp lệ) → 201', async () => {
    Food.create.mockResolvedValue(6);
    const res = mockRes();
    await adminController.createFood(
      mockReq({ name: 'Test', category_id: 1, price: 1 }), res
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

// ════════════════════════════════════════════════════════════════
// HỘP ĐEN — updateFood
// REQ-FOOD-01
// ════════════════════════════════════════════════════════════════
describe('[HỘP ĐEN] updateFood — REQ-FOOD-01', () => {
  beforeEach(() => jest.clearAllMocks());

  test('TC-BB-FOOD-10 | Món tồn tại, đủ field → 200', async () => {
    Food.findById.mockResolvedValue({
      id: 3, name: 'Cũ', image_url: '/uploads/old.jpg',
    });
    Food.update.mockResolvedValue(1);
    const res = mockRes();
    await adminController.updateFood(
      mockReq(
        { name: 'Phở mới', category_id: 2, price: 55000,
          is_available: true, is_featured: false },
        { id: '3' }
      ),
      res
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('TC-BB-FOOD-11 | Món không tồn tại → 404', async () => {
    Food.findById.mockResolvedValue(null);
    const res = mockRes();
    await adminController.updateFood(
      mockReq({ name: 'X', category_id: 1, price: 10000 }, { id: '999' }),
      res
    );
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ════════════════════════════════════════════════════════════════
// HỘP ĐEN — updateFoodAvailability
// Kỹ thuật: Phân lớp tương đương
// REQ-FOOD-02
// ════════════════════════════════════════════════════════════════
describe('[HỘP ĐEN] updateFoodAvailability — REQ-FOOD-02', () => {
  beforeEach(() => jest.clearAllMocks());

  test('TC-BB-AVAIL-01 | is_available=true → bật món, 200', async () => {
    Food.updateAvailability.mockResolvedValue(1);
    const res = mockRes();
    await adminController.updateFoodAvailability(
      mockReq({ is_available: true }, { id: '5' }), res
    );
    expect(Food.updateAvailability).toHaveBeenCalledWith('5', true);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('TC-BB-AVAIL-02 | is_available=false → ẩn món, 200', async () => {
    Food.updateAvailability.mockResolvedValue(1);
    const res = mockRes();
    await adminController.updateFoodAvailability(
      mockReq({ is_available: false }, { id: '5' }), res
    );
    expect(Food.updateAvailability).toHaveBeenCalledWith('5', false);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('TC-BB-AVAIL-03 | Thiếu is_available → 400', async () => {
    const res = mockRes();
    await adminController.updateFoodAvailability(
      mockReq({}, { id: '5' }), res
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(Food.updateAvailability).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════
// HỘP TRẮNG — updateFoodAvailability
// Branch Coverage — 2 nhánh chính
// REQ-FOOD-02
// ════════════════════════════════════════════════════════════════
describe('[HỘP TRẮNG] updateFoodAvailability — Branch Coverage — REQ-FOOD-02', () => {
  beforeEach(() => jest.clearAllMocks());

  // Nhánh 1: is_available === undefined → return 400
  test('TC-WB-AVAIL-01 | Nhánh 1: undefined → 400, DB không được gọi', async () => {
    const res = mockRes();
    await adminController.updateFoodAvailability(
      mockReq({}, { id: '5' }), res
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(Food.updateAvailability).not.toHaveBeenCalled();
  });

  // Nhánh 2: is_available có giá trị → gọi Food.updateAvailability → return 200
  test('TC-WB-AVAIL-02 | Nhánh 2: is_available=true → gọi updateAvailability(id, true)', async () => {
    Food.updateAvailability.mockResolvedValue(1);
    const res = mockRes();
    await adminController.updateFoodAvailability(
      mockReq({ is_available: true }, { id: '7' }), res
    );
    expect(Food.updateAvailability).toHaveBeenCalledWith('7', true);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ════════════════════════════════════════════════════════════════
// HỘP ĐEN — getMenu (phía khách hàng, chỉ trả available)
// REQ-FOOD-03
// ════════════════════════════════════════════════════════════════
describe('[HỘP ĐEN] getMenu — REQ-FOOD-03', () => {
  beforeEach(() => jest.clearAllMocks());

  test('TC-BB-MENU-01 | Có 3 món (2 available, 1 không) → chỉ trả 2 món', async () => {
    Food.findAll.mockResolvedValue([
      { id: 1, name: 'Phở', is_available: true },
      { id: 2, name: 'Bún', is_available: false },
      { id: 3, name: 'Mì',  is_available: true },
    ]);
    const res = mockRes();
    await userController.getMenu(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const returned = res.json.mock.calls[0][0];
    expect(returned).toHaveLength(2);
    expect(returned.every(f => f.is_available)).toBe(true);
  });

  test('TC-BB-MENU-02 | Tất cả món đều unavailable → trả mảng rỗng', async () => {
    Food.findAll.mockResolvedValue([
      { id: 1, name: 'Phở', is_available: false },
    ]);
    const res = mockRes();
    await userController.getMenu(mockReq(), res);
    expect(res.json.mock.calls[0][0]).toHaveLength(0);
  });

  test('TC-BB-MENU-03 | Không có món nào trong DB → trả mảng rỗng', async () => {
    Food.findAll.mockResolvedValue([]);
    const res = mockRes();
    await userController.getMenu(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0]).toHaveLength(0);
  });
});