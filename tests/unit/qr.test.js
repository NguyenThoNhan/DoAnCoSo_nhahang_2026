// tests/unit/qr.test.js
// Liên kết yêu cầu:
//   REQ-QR-01 — Xác thực bàn qua QR (verifyTable)
//   REQ-QR-02 — Polling session và cấp guest token (checkTableSession)

require('../helpers/mockDb');

jest.mock('../../src/models/Table', () => ({
  findByTableNumber: jest.fn(),
}));

const jwt            = require('jsonwebtoken');
const { pool }       = require('../../config/database');
const Table          = require('../../src/models/Table');
const userController = require('../../src/controllers/user.controller');

const mockReq = (params = {}) => ({ params });
const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  res.send   = jest.fn().mockReturnValue(res);
  return res;
};

// ════════════════════════════════════════════════════════════════
// HỘP ĐEN — verifyTable
// Kỹ thuật: Phân lớp tương đương + BVA
// ════════════════════════════════════════════════════════════════
describe('[HỘP ĐEN] verifyTable — REQ-QR-01', () => {
  beforeEach(() => jest.clearAllMocks());

  test('TC-BB-QR-01 | Bàn tồn tại → 200 + HTML xác thực', async () => {
    Table.findByTableNumber.mockResolvedValue({
      id: 1, table_number: '5', session_status: 'idle',
    });
    pool.execute.mockResolvedValue([{}]);
    const res = mockRes();
    await userController.verifyTable(mockReq({ id: '5' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('Ban so 5'));
    expect(pool.execute).toHaveBeenCalledWith(
      'UPDATE tables SET session_status = "verified" WHERE table_number = ?',
      ['5']
    );
  });

  test('TC-BB-QR-02 | Bàn không tồn tại → 404 + HTML lỗi', async () => {
    Table.findByTableNumber.mockResolvedValue(null);
    const res = mockRes();
    await userController.verifyTable(mockReq({ id: '999' }), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('999'));
  });

  test('TC-BB-QR-03 | DB lỗi → 500 + HTML lỗi', async () => {
    Table.findByTableNumber.mockRejectedValue(new Error('DB fail'));
    const res = mockRes();
    await userController.verifyTable(mockReq({ id: '1' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('TC-BB-QR-04 | BVA: table_number = "1" (biên dưới) → 200', async () => {
    Table.findByTableNumber.mockResolvedValue({
      id: 1, table_number: '1', session_status: 'idle',
    });
    pool.execute.mockResolvedValue([{}]);
    const res = mockRes();
    await userController.verifyTable(mockReq({ id: '1' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ════════════════════════════════════════════════════════════════
// HỘP TRẮNG — verifyTable
// File: src/controllers/user.controller.js — exports.verifyTable
// Coverage: Statement + Branch
// ════════════════════════════════════════════════════════════════
describe('[HỘP TRẮNG] verifyTable — Branch Coverage — REQ-QR-01', () => {
  beforeEach(() => jest.clearAllMocks());

  test('TC-WB-QR-01 | Nhánh 1: !table → return 404, không UPDATE DB', async () => {
    Table.findByTableNumber.mockResolvedValue(null);
    const res = mockRes();
    await userController.verifyTable(mockReq({ id: '3' }), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(pool.execute).not.toHaveBeenCalled();
  });

  test('TC-WB-QR-02 | Nhánh 2: table hợp lệ → UPDATE session + return 200', async () => {
    Table.findByTableNumber.mockResolvedValue({
      id: 2, table_number: '3', session_status: 'idle',
    });
    pool.execute.mockResolvedValue([{}]);
    const res = mockRes();
    await userController.verifyTable(mockReq({ id: '3' }), res);
    expect(pool.execute).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('TC-WB-QR-03 | Nhánh 3: exception → return 500', async () => {
    Table.findByTableNumber.mockRejectedValue(new Error('fail'));
    const res = mockRes();
    await userController.verifyTable(mockReq({ id: '1' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ════════════════════════════════════════════════════════════════
// HỘP ĐEN — checkTableSession
// ════════════════════════════════════════════════════════════════
describe('[HỘP ĐEN] checkTableSession — REQ-QR-02', () => {
  beforeEach(() => jest.clearAllMocks());

  test('TC-BB-QR-10 | session_status=verified → 200 + guest_token', async () => {
    Table.findByTableNumber.mockResolvedValue({
      id: 4, table_number: '7', session_status: 'verified',
    });
    pool.execute.mockResolvedValue([{}]);
    const res = mockRes();
    await userController.checkTableSession(mockReq({ tableNumber: '7' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.status).toBe('verified');
    expect(body).toHaveProperty('guest_token');
    expect(body.table_id).toBe(4);
  });

  test('TC-BB-QR-11 | session_status=idle → 200 + status waiting', async () => {
    Table.findByTableNumber.mockResolvedValue({
      id: 4, table_number: '7', session_status: 'idle',
    });
    const res = mockRes();
    await userController.checkTableSession(mockReq({ tableNumber: '7' }), res);
    expect(res.json).toHaveBeenCalledWith({ status: 'waiting' });
  });

  test('TC-BB-QR-12 | Bàn không tồn tại → 200 + waiting', async () => {
    Table.findByTableNumber.mockResolvedValue(null);
    const res = mockRes();
    await userController.checkTableSession(mockReq({ tableNumber: '99' }), res);
    expect(res.json).toHaveBeenCalledWith({ status: 'waiting' });
  });
});

// ════════════════════════════════════════════════════════════════
// HỘP TRẮNG — checkTableSession
// Condition Coverage: table && session_status === 'verified'
// ════════════════════════════════════════════════════════════════
describe('[HỘP TRẮNG] checkTableSession — Condition Coverage — REQ-QR-02', () => {
  beforeEach(() => jest.clearAllMocks());

  test('TC-WB-QR-10 | Điều kiện: table=null → waiting', async () => {
    Table.findByTableNumber.mockResolvedValue(null);
    const res = mockRes();
    await userController.checkTableSession(mockReq({ tableNumber: '1' }), res);
    expect(res.json).toHaveBeenCalledWith({ status: 'waiting' });
  });

  test('TC-WB-QR-11 | Điều kiện: table có, status≠verified → waiting', async () => {
    Table.findByTableNumber.mockResolvedValue({
      id: 1, table_number: '1', session_status: 'idle',
    });
    const res = mockRes();
    await userController.checkTableSession(mockReq({ tableNumber: '1' }), res);
    expect(res.json).toHaveBeenCalledWith({ status: 'waiting' });
  });

  test('TC-WB-QR-12 | Điều kiện: table có AND verified → guest_token hợp lệ', async () => {
    Table.findByTableNumber.mockResolvedValue({
      id: 5, table_number: '2', session_status: 'verified',
    });
    pool.execute.mockResolvedValue([{}]);
    const res = mockRes();
    await userController.checkTableSession(mockReq({ tableNumber: '2' }), res);
    const body = res.json.mock.calls[0][0];
    const decoded = jwt.verify(body.guest_token, process.env.JWT_SECRET);
    expect(decoded.role).toBe('guest');
    expect(decoded.tableId).toBe(5);
  });
});
