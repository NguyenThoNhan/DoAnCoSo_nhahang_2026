// tests/unit/inventory-model.test.js
// Liên kết yêu cầu:
//   REQ-INV-01 — Trừ kho tự động + tự ẩn món khi hết nguyên liệu

require('../helpers/mockDb');
const Inventory = require('../../src/models/Inventory');

describe('[HỘP TRẮNG] Inventory.deductStock + autoDisableFoods — REQ-INV-01', () => {
  beforeEach(() => jest.clearAllMocks());

  test('TC-WB-INV-10 | Trừ kho đúng lượng theo công thức × số lượng món', async () => {
    const mockConn = {
      execute: jest.fn()
        .mockResolvedValueOnce([[{ ingredient_id: 10, quantity_required: 2 }]])
        .mockResolvedValueOnce([{}])
        .mockResolvedValueOnce([[{ stock_quantity: 5 }]])
        .mockResolvedValueOnce([{}]),
    };

    await Inventory.deductStock(1, 3, mockConn);

    expect(mockConn.execute).toHaveBeenCalledWith(
      'UPDATE ingredients SET stock_quantity = GREATEST(0, stock_quantity - ?) WHERE id = ?',
      [6, 10]
    );
  });

  test('TC-WB-INV-11 | stock_quantity ≤ 0 → tự ẩn món liên quan', async () => {
    const mockConn = {
      execute: jest.fn()
        .mockResolvedValueOnce([[{ ingredient_id: 7, quantity_required: 1 }]])
        .mockResolvedValueOnce([{}])
        .mockResolvedValueOnce([[{ stock_quantity: 0 }]])
        .mockResolvedValueOnce([{}]),
    };

    await Inventory.deductStock(2, 1, mockConn);

    expect(mockConn.execute).toHaveBeenCalledWith(
      expect.stringContaining('SET f.is_available = 0'),
      [7]
    );
  });

  test('TC-WB-INV-12 | stock_quantity > 0 → KHÔNG ẩn món', async () => {
    const mockConn = {
      execute: jest.fn()
        .mockResolvedValueOnce([[{ ingredient_id: 7, quantity_required: 1 }]])
        .mockResolvedValueOnce([{}])
        .mockResolvedValueOnce([[{ stock_quantity: 10 }]]),
    };

    await Inventory.deductStock(2, 1, mockConn);

    const hideCalls = mockConn.execute.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('is_available = 0')
    );
    expect(hideCalls).toHaveLength(0);
  });

  test('TC-WB-INV-13 | Món không có công thức → chỉ SELECT recipe, không UPDATE kho', async () => {
    const mockConn = {
      execute: jest.fn().mockResolvedValueOnce([[]]),
    };

    await Inventory.deductStock(99, 1, mockConn);

    expect(mockConn.execute).toHaveBeenCalledTimes(1);
  });
});

describe('[HỘP ĐEN] Inventory — REQ-INV-01', () => {
  test('TC-BB-INV-10 | Trừ kho lớn hơn tồn → GREATEST(0,...) không âm', async () => {
    const mockConn = {
      execute: jest.fn()
        .mockResolvedValueOnce([[{ ingredient_id: 5, quantity_required: 50 }]])
        .mockResolvedValueOnce([{}])
        .mockResolvedValueOnce([[{ stock_quantity: 0 }]])
        .mockResolvedValueOnce([{}]),
    };

    await Inventory.deductStock(1, 10, mockConn);

    expect(mockConn.execute).toHaveBeenCalledWith(
      'UPDATE ingredients SET stock_quantity = GREATEST(0, stock_quantity - ?) WHERE id = ?',
      [500, 5]
    );
  });
});
