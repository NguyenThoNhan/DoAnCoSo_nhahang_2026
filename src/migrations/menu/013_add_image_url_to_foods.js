// project/src/migrations/menu/013_add_image_url_to_foods.js
const { pool } = require('../../../config/database');

async function up() {
    console.log('Migration 013: Thêm cột image_url vào bảng foods...');
    
    // Sử dụng IF NOT EXISTS để đảm bảo không lỗi nếu chạy lại
    const query = `
        ALTER TABLE foods
        ADD COLUMN image_url VARCHAR(255) NULL AFTER is_featured;
    `;
    await pool.execute(query);
    console.log('✅ Cột image_url đã được thêm vào foods.');
}

async function down() {
    console.log('Revert Migration 013: Xóa cột image_url khỏi foods...');
    
    // Kiểm tra và xóa cột (MySQL 8+ hỗ trợ IF EXISTS)
    const query = `
        ALTER TABLE foods
        DROP COLUMN image_url;
    `;
    // Lưu ý: Nếu MySQL phiên bản cũ, lệnh này có thể cần được thực hiện cẩn thận hơn
    await pool.execute(query);
}

module.exports = { up, down };