// project/src/migrations/order/026_add_payment_info_to_orders.js
const { pool } = require('../../../config/database');

async function up() {
    console.log('Migration 026: Đang thêm cột thanh toán vào bảng orders...');
    
    // Câu lệnh thêm cột và tạo Index
    // Chúng ta dùng nhiều lệnh ALTER nhỏ hoặc gộp lại để đảm bảo tính ổn định
    try {
        const query = `
            ALTER TABLE orders
            ADD COLUMN payment_method VARCHAR(50) NULL DEFAULT NULL 
                COMMENT 'Phương thức thanh toán: cash, card, e-wallet' AFTER status,
            ADD COLUMN cashier_id INT NULL DEFAULT NULL 
                COMMENT 'ID nhân viên thu ngân' AFTER payment_method,
            ADD INDEX idx_orders_cashier_id (cashier_id);
        `;
        
        await pool.execute(query);
        
        // Thêm khóa ngoại cho cashier_id trỏ đến bảng users (role admin/staff)
        await pool.execute(`
            ALTER TABLE orders
            ADD CONSTRAINT fk_orders_cashier
            FOREIGN KEY (cashier_id) REFERENCES users(id) ON DELETE SET NULL;
        `);

        console.log('✅ Cập nhật bảng orders thành công (thêm payment_method, cashier_id).');
    } catch (error) {
        // Nếu cột đã tồn tại (do bạn lỡ chạy tay trước đó), nó sẽ báo lỗi, ta cần catch để không dừng cả hệ thống
        if (error.code === 'ER_DUP_COLUMN_NAME') {
            console.log('⚠️ Cột đã tồn tại, bỏ qua migration này.');
        } else {
            throw error;
        }
    }
}

async function down() {
    console.log('Revert Migration 026: Xóa các cột thanh toán...');
    await pool.execute('ALTER TABLE orders DROP FOREIGN KEY fk_orders_cashier');
    await pool.execute('ALTER TABLE orders DROP COLUMN payment_method, DROP COLUMN cashier_id');
}

module.exports = { up, down };