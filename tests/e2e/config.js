const path = require('path');

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;

module.exports = {
  BASE_URL,
  TIMEOUT: 15000,
  ADMIN_EMAIL: process.env.E2E_ADMIN_EMAIL || 'admin@gmail.com',
  ADMIN_PASSWORD: process.env.E2E_ADMIN_PASSWORD || 'admin123',
  SCREENSHOT_DIR: path.resolve(__dirname, 'screenshots'),
  INVALID_PROMO: 'MA_KHONG_HOP_LE_XYZ',
};
