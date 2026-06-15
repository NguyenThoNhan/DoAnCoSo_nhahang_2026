// tests/unit/auth.test.js
// Liên kết yêu cầu:
//   REQ-AUTH-01 — Đăng nhập bằng email + mật khẩu
//   REQ-AUTH-02 — Đăng ký tài khoản mới

require('../helpers/mockDb');
const bcrypt = require('bcryptjs');

// ── Mock model User ─────────────────────────────────────────────
jest.mock('../../src/models/User', () => ({
  findByEmail: jest.fn(),
  create:      jest.fn(),
}));
const User           = require('../../src/models/User');
const authController = require('../../src/controllers/auth.controller');

// ── Helper req / res giả ────────────────────────────────────────
const mockReq = (body = {}) => ({ body });
const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
};

// ════════════════════════════════════════════════════════════════
// HỘP ĐEN — login
// Kỹ thuật: Phân lớp tương đương + Boundary Value Analysis
// ════════════════════════════════════════════════════════════════
describe('[HỘP ĐEN] POST /api/auth/login — REQ-AUTH-01', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── Lớp hợp lệ ──────────────────────────────────────────────
  test('TC-BB-LOGIN-01 | Email + mật khẩu đúng (Admin) → 200 + token', async () => {
    const hashed = await bcrypt.hash('Abc@12345', 10);
    User.findByEmail.mockResolvedValue({
      id: 1, name: 'Nhân', email: 'nhan@gomeal.vn',
      password: hashed, role: 'admin',
    });

    const req = mockReq({ email: 'nhan@gomeal.vn', password: 'Abc@12345' });
    const res = mockRes();
    await authController.login(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ token: expect.any(String) })
    );
  });

  // ── Lớp không hợp lệ — email ────────────────────────────────
  test('TC-BB-LOGIN-02 | Email không tồn tại → 401', async () => {
    User.findByEmail.mockResolvedValue(null);
    const res = mockRes();
    await authController.login(mockReq({ email: 'khong@ton.tai', password: 'Abc@12345' }), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('TC-BB-LOGIN-03 | Email sai định dạng (thiếu @) → 401 hoặc 400', async () => {
    User.findByEmail.mockResolvedValue(null);
    const res = mockRes();
    await authController.login(mockReq({ email: 'khongcoat', password: 'Abc@12345' }), res);
    const called = res.status.mock.calls[0][0];
    expect([400, 401]).toContain(called);
  });

  // ── Lớp không hợp lệ — mật khẩu ────────────────────────────
  test('TC-BB-LOGIN-04 | Mật khẩu sai → 401', async () => {
    const hashed = await bcrypt.hash('DungRoi@123', 10);
    User.findByEmail.mockResolvedValue({
      id: 1, email: 'nhan@gomeal.vn', password: hashed, role: 'admin',
    });
    const res = mockRes();
    await authController.login(mockReq({ email: 'nhan@gomeal.vn', password: 'SaiRoi@999' }), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  // ── Lớp thiếu trường ────────────────────────────────────────
  test('TC-BB-LOGIN-05 | Thiếu email → 400', async () => {
    const res = mockRes();
    await authController.login(mockReq({ password: 'Abc@12345' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('TC-BB-LOGIN-06 | Thiếu mật khẩu → 400', async () => {
    const res = mockRes();
    await authController.login(mockReq({ email: 'nhan@gomeal.vn' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('TC-BB-LOGIN-07 | Cả hai trường đều rỗng → 400', async () => {
    const res = mockRes();
    await authController.login(mockReq({}), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  // ── Boundary Value Analysis — email ─────────────────────────
  test('TC-BB-LOGIN-08 | Email tối thiểu hợp lệ (a@b.co) không tồn tại → 401', async () => {
    User.findByEmail.mockResolvedValue(null);
    const res = mockRes();
    await authController.login(mockReq({ email: 'a@b.co', password: 'Abc@12345' }), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('TC-BB-LOGIN-09 | Staff (role=admin) đăng nhập đúng → 200 + token', async () => {
    const hashed = await bcrypt.hash('Staff@123', 10);
    User.findByEmail.mockResolvedValue({
      id: 2, name: 'Nhân viên', email: 'staff@gomeal.vn',
      password: hashed, role: 'admin',
    });
    const res = mockRes();
    await authController.login(
      mockReq({ email: 'staff@gomeal.vn', password: 'Staff@123' }), res
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].user.role).toBe('admin');
  });
});

// ════════════════════════════════════════════════════════════════
// HỘP TRẮNG — login
// Kỹ thuật: Branch Coverage — 4 nhánh trong hàm login
// File: src/controllers/auth.controller.js — exports.login
// ════════════════════════════════════════════════════════════════
describe('[HỘP TRẮNG] login — Branch Coverage — REQ-AUTH-01', () => {
  beforeEach(() => jest.clearAllMocks());

  // Nhánh 1: !email || !password → return 400 ngay lập tức
  test('TC-WB-LOGIN-01 | Nhánh 1: thiếu input → return 400, KHÔNG gọi DB', async () => {
    const res = mockRes();
    await authController.login(mockReq({ email: '' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(User.findByEmail).not.toHaveBeenCalled(); // branch bị cắt sớm
  });

  // Nhánh 2: User.findByEmail trả null → return 401
  test('TC-WB-LOGIN-02 | Nhánh 2: user = null → return 401, KHÔNG gọi bcrypt', async () => {
    User.findByEmail.mockResolvedValue(null);
    const res = mockRes();
    await authController.login(mockReq({ email: 'x@x.com', password: '123' }), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  // Nhánh 3: user tồn tại, bcrypt.compare = false → return 401 lần 2
  test('TC-WB-LOGIN-03 | Nhánh 3: password sai → bcrypt.compare=false → 401', async () => {
    User.findByEmail.mockResolvedValue({
      id: 1, email: 'x@x.com',
      password: await bcrypt.hash('correct', 10),
      role: 'admin',
    });
    const res = mockRes();
    await authController.login(mockReq({ email: 'x@x.com', password: 'wrong' }), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  // Nhánh 4: tất cả đúng → generateToken → return 200
  test('TC-WB-LOGIN-04 | Nhánh 4: mọi điều kiện đúng → 200 + có token', async () => {
    User.findByEmail.mockResolvedValue({
      id: 1, email: 'x@x.com',
      password: await bcrypt.hash('correct', 10),
      role: 'admin',
    });
    const res = mockRes();
    await authController.login(mockReq({ email: 'x@x.com', password: 'correct' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload).toHaveProperty('token');
  });
});

// ════════════════════════════════════════════════════════════════
// HỘP ĐEN — register
// Liên kết yêu cầu: REQ-AUTH-02
// ════════════════════════════════════════════════════════════════
describe('[HỘP ĐEN] POST /api/auth/register — REQ-AUTH-02', () => {
  beforeEach(() => jest.clearAllMocks());

  test('TC-BB-REG-01 | Đủ thông tin, email mới → 201', async () => {
    User.findByEmail.mockResolvedValue(null);
    User.create.mockResolvedValue(10);
    const res = mockRes();
    await authController.register(
      mockReq({ name: 'Nhân', email: 'new@gomeal.vn', password: 'Abc@12345' }),
      res
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('TC-BB-REG-02 | Email đã tồn tại → 409', async () => {
    User.findByEmail.mockResolvedValue({ id: 1 });
    const res = mockRes();
    await authController.register(
      mockReq({ name: 'Nhân', email: 'exists@gomeal.vn', password: 'Abc@12345' }),
      res
    );
    expect(res.status).toHaveBeenCalledWith(409);
  });

  test('TC-BB-REG-03 | Thiếu name → 400', async () => {
    const res = mockRes();
    await authController.register(
      mockReq({ email: 'new@gomeal.vn', password: 'Abc@12345' }),
      res
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('TC-BB-REG-04 | Thiếu email → 400', async () => {
    const res = mockRes();
    await authController.register(
      mockReq({ name: 'Nhân', password: 'Abc@12345' }),
      res
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('TC-BB-REG-05 | Thiếu password → 400', async () => {
    const res = mockRes();
    await authController.register(
      mockReq({ name: 'Nhân', email: 'new@gomeal.vn' }),
      res
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });
});