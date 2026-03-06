const { pool } = require('../../../config/database');

async function up() {
    console.log('Migration 023: Thêm cột session_status vào bảng tables...');
    const query = `
        ALTER TABLE tables 
        ADD COLUMN session_status ENUM('idle', 'verified') DEFAULT 'idle';
    `;
    await pool.execute(query);
    console.log('✅ Cập nhật bảng tables thành công.');
}

async function down() {
    const query = `ALTER TABLE tables DROP COLUMN session_status;`;
    await pool.execute(query);
}

module.exports = { up, down };