// tests/api/auth.api.test.js
// Kiểm thử tích hợp API — POST /api/auth/login và /api/auth/register
// Liên kết yêu cầu: REQ-AUTH-01, REQ-AUTH-02

// ── Mock DB trước khi require app ──────────────────────────────
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

jest.mock('../../src/models/User', () => ({
  findByEmail: jest.fn(),
  create:      jest.fn(),
}));

const request = require('supertest');
const bcrypt  = require('bcryptjs');
const app     = require('../../server');
const User    = require('../../src/models/User');

// ════════════════════════════════════════════════════════════════
// API TEST — POST /api/auth/login
// ════════════════════════════════════════════════════════════════
describe('[API] POST /api/auth/login', () => {
  beforeEach(() => jest.clearAllMocks());

  test('TC-API-AUTH-01 | Email + password đúng → 200 + token', async () => {
    const hashed = await bcrypt.hash('Abc@12345', 10);
    User.findByEmail.mockResolvedValue({
      id: 1, name: 'Nhân', email: 'nhan@gomeal.vn',
      password: hashed, role: 'admin',
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nhan@gomeal.vn', password: 'Abc@12345' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toMatchObject({ email: 'nhan@gomeal.vn', role: 'admin' });
  });

  test('TC-API-AUTH-02 | Email không tồn tại → 401', async () => {
    User.findByEmail.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@test.com', password: 'Abc@12345' });

    expect(res.statusCode).toBe(401);
    expect(res.body).toHaveProperty('message');
  });

  test('TC-API-AUTH-03 | Mật khẩu sai → 401', async () => {
    const hashed = await bcrypt.hash('DungRoi@123', 10);
    User.findByEmail.mockResolvedValue({
      id: 1, email: 'nhan@gomeal.vn', password: hashed, role: 'admin',
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nhan@gomeal.vn', password: 'SaiRoi@999' });

    expect(res.statusCode).toBe(401);
  });

  test('TC-API-AUTH-04 | Thiếu email → 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'Abc@12345' });

    expect(res.statusCode).toBe(400);
  });

  test('TC-API-AUTH-05 | Thiếu password → 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nhan@gomeal.vn' });

    expect(res.statusCode).toBe(400);
  });

  test('TC-API-AUTH-06 | Body rỗng → 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({});

    expect(res.statusCode).toBe(400);
  });

  test('TC-API-AUTH-07 | Content-Type không phải JSON → 400/401 hoặc lỗi xử lý', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'text/plain')
      .send('email=test&password=123');

    expect([400, 401, 500]).toContain(res.statusCode);
  });
});

// ════════════════════════════════════════════════════════════════
// API TEST — POST /api/auth/register
// ════════════════════════════════════════════════════════════════
describe('[API] POST /api/auth/register', () => {
  beforeEach(() => jest.clearAllMocks());

  test('TC-API-REG-01 | Đủ thông tin, email mới → 201', async () => {
    User.findByEmail.mockResolvedValue(null);
    User.create.mockResolvedValue(15);

    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Khách Mới', email: 'new@gomeal.vn', password: 'Abc@12345' });

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('message');
  });

  test('TC-API-REG-02 | Email đã tồn tại → 409', async () => {
    User.findByEmail.mockResolvedValue({ id: 1 });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Nhân', email: 'exists@gomeal.vn', password: 'Abc@12345' });

    expect(res.statusCode).toBe(409);
  });

  test('TC-API-REG-03 | Thiếu name → 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'new@gomeal.vn', password: 'Abc@12345' });
    expect(res.statusCode).toBe(400);
  });

  test('TC-API-REG-04 | Thiếu email → 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Nhân', password: 'Abc@12345' });
    expect(res.statusCode).toBe(400);
  });

  test('TC-API-REG-05 | Thiếu password → 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Nhân', email: 'new@gomeal.vn' });
    expect(res.statusCode).toBe(400);
  });
});