// tests/api/qr.api.test.js
// Kiểm thử tích hợp API — Xác thực bàn qua QR
// Liên kết yêu cầu: REQ-QR-01, REQ-QR-02

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

jest.mock('../../src/models/Table', () => ({
  findAll: jest.fn(),
  findByTableNumber: jest.fn(),
}));

const request = require('supertest');
const jwt     = require('jsonwebtoken');
const app     = require('../../server');
const Table   = require('../../src/models/Table');
const { pool } = require('../../config/database');

describe('[API] GET /api/user/public/table/verify/:id — REQ-QR-01', () => {
  beforeEach(() => jest.clearAllMocks());

  test('TC-API-QR-01 | Bàn hợp lệ → 200 + HTML', async () => {
    Table.findByTableNumber.mockResolvedValue({
      id: 1, table_number: '5', session_status: 'idle',
    });
    pool.execute.mockResolvedValue([{}]);

    const res = await request(app).get('/api/user/public/table/verify/5');

    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('Ban so 5');
  });

  test('TC-API-QR-02 | Bàn không tồn tại → 404', async () => {
    Table.findByTableNumber.mockResolvedValue(null);

    const res = await request(app).get('/api/user/public/table/verify/999');

    expect(res.statusCode).toBe(404);
    expect(res.text).toContain('999');
  });
});

describe('[API] GET /api/user/public/table/check-session/:tableNumber — REQ-QR-02', () => {
  beforeEach(() => jest.clearAllMocks());

  test('TC-API-QR-03 | Session verified → guest_token', async () => {
    Table.findByTableNumber.mockResolvedValue({
      id: 3, table_number: '8', session_status: 'verified',
    });
    pool.execute.mockResolvedValue([{}]);

    const res = await request(app).get('/api/user/public/table/check-session/8');

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('verified');
    expect(res.body).toHaveProperty('guest_token');
    const decoded = jwt.verify(res.body.guest_token, process.env.JWT_SECRET);
    expect(decoded.tableId).toBe(3);
  });

  test('TC-API-QR-04 | Session chưa verify → waiting', async () => {
    Table.findByTableNumber.mockResolvedValue({
      id: 3, table_number: '8', session_status: 'idle',
    });

    const res = await request(app).get('/api/user/public/table/check-session/8');

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: 'waiting' });
  });
});
