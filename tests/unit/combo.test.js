// tests/unit/combo.test.js
// Liên kết yêu cầu:
//   REQ-COMBO-01 — Lấy danh sách combo active
//   REQ-ORDER-01 — Tính tổng đơn có combo (giá combo cố định)

require('../helpers/mockDb');

jest.mock('../../src/models/Combo', () => ({
  findAll: jest.fn(),
}));

const Combo          = require('../../src/models/Combo');
const userController = require('../../src/controllers/user.controller');
const { calculateOrderTotal } = require('../helpers/pureLogic');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
};

describe('[HỘP ĐEN] getPublicCombos — REQ-COMBO-01', () => {
  beforeEach(() => jest.clearAllMocks());

  test('TC-BB-COMBO-01 | Có combo active → chỉ trả combo is_active=true', async () => {
    Combo.findAll.mockResolvedValue([
      { id: 1, name: 'Combo A', price: 99000, is_active: true },
      { id: 2, name: 'Combo B', price: 79000, is_active: false },
    ]);
    const res = mockRes();
    await userController.getPublicCombos({}, res);
    const returned = res.json.mock.calls[0][0];
    expect(returned).toHaveLength(1);
    expect(returned[0].name).toBe('Combo A');
  });

  test('TC-BB-COMBO-02 | Không có combo → mảng rỗng', async () => {
    Combo.findAll.mockResolvedValue([]);
    const res = mockRes();
    await userController.getPublicCombos({}, res);
    expect(res.json.mock.calls[0][0]).toHaveLength(0);
  });

  test('TC-BB-COMBO-03 | DB lỗi → 500', async () => {
    Combo.findAll.mockRejectedValue(new Error('DB'));
    const res = mockRes();
    await userController.getPublicCombos({}, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('[HỘP TRẮNG] getPublicCombos — Branch Coverage — REQ-COMBO-01', () => {
  beforeEach(() => jest.clearAllMocks());

  test('TC-WB-COMBO-01 | Nhánh try: filter is_active → 200', async () => {
    Combo.findAll.mockResolvedValue([
      { id: 1, is_active: true }, { id: 2, is_active: false },
    ]);
    const res = mockRes();
    await userController.getPublicCombos({}, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('TC-WB-COMBO-02 | Nhánh catch: lỗi DB → 500', async () => {
    Combo.findAll.mockRejectedValue(new Error('fail'));
    const res = mockRes();
    await userController.getPublicCombos({}, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('[HỘP ĐEN] Tính tổng đơn có combo — REQ-ORDER-01', () => {
  test('TC-BB-COMBO-10 | 1 combo + 1 món lẻ → tổng đúng', () => {
    const items = [
      { priceAtOrder: 99000, quantity: 1, itemName: 'Combo Phở+Bún' },
      { priceAtOrder: 25000, quantity: 2, itemName: 'Nước ngọt' },
    ];
    expect(calculateOrderTotal(items, null).total).toBe(149000);
  });

  test('TC-BB-COMBO-11 | Combo + KM 10% → giảm trên subtotal', () => {
    const items = [{ priceAtOrder: 100000, quantity: 1 }];
    const { total, discount } = calculateOrderTotal(items, {
      type: 'percent', value: 10,
    });
    expect(discount).toBe(10000);
    expect(total).toBe(90000);
  });

  test('TC-BB-COMBO-12 | BVA: combo price = 1 (biên dưới hợp lệ) → total = 1', () => {
    const items = [{ priceAtOrder: 1, quantity: 1 }];
    expect(calculateOrderTotal(items, null).total).toBe(1);
  });
});
