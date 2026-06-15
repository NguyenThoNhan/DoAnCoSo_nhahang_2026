// tests/setup.js — Load biến môi trường trước khi require controller/middleware
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Đảm bảo JWT_SECRET luôn có giá trị khi chạy Jest (mock DB không load config/database)
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'motchuoi_bi_mat_khong_ai_biet_nay';
