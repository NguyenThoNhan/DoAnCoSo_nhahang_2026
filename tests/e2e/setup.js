const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'motchuoi_bi_mat_khong_ai_biet_nay';
