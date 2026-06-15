// tests/helpers/testTokens.js — Tạo JWT cho API test (dùng chung JWT_SECRET với middleware)
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'motchuoi_bi_mat_khong_ai_biet_nay';

const makeAdminToken = () =>
  jwt.sign({ id: 1, email: 'admin@gomeal.vn', role: 'admin' }, SECRET, {
    expiresIn: '1h',
  });

const makeStaffToken = () =>
  jwt.sign({ id: 2, email: 'staff@gomeal.vn', role: 'admin' }, SECRET, {
    expiresIn: '1h',
  });

const makeCustomerToken = () =>
  jwt.sign({ id: 10, email: 'customer@gomeal.vn', role: 'customer' }, SECRET, {
    expiresIn: '1h',
  });

const makeGuestToken = (tableId = 1) =>
  jwt.sign({ tableId, role: 'guest', isGuest: true }, SECRET, {
    expiresIn: '3h',
  });

module.exports = {
  SECRET,
  makeAdminToken,
  makeStaffToken,
  makeCustomerToken,
  makeGuestToken,
};
