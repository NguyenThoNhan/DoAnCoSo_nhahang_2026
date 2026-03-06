const { pool } = require('../../../config/database');

async function up() {
    const query = `
        ALTER TABLE orders 
        ADD COLUMN promo_id INT NULL AFTER table_id,
        ADD COLUMN discount_amount DECIMAL(10, 2) DEFAULT 0 AFTER total_amount,
        ADD FOREIGN KEY (promo_id) REFERENCES promotions(id);
    `;
    await pool.execute(query);
    console.log('✅ Cập nhật bảng orders cho marketing thành công.');
}

module.exports = { up };