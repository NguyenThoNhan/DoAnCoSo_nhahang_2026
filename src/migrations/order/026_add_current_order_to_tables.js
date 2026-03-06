const { pool } = require('../../../config/database');

async function up() {
    console.log('Migration 026: Thêm cột current_order_id vào bảng tables...');
    
    // Thêm cột current_order_id để theo dõi đơn hàng đang phục vụ tại bàn
    const query = `
        ALTER TABLE tables 
        ADD COLUMN current_order_id INT NULL AFTER session_status,
        ADD FOREIGN KEY (current_order_id) REFERENCES orders(id) ON DELETE SET NULL;
    `;
    
    try {
        await pool.execute(query);
        console.log('✅ Cập nhật bảng tables thành công.');
    } catch (error) {
        console.error('❌ Lỗi Migration 026:', error.message);
    }
}

module.exports = { up };