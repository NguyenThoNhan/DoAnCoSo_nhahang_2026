// migration / seed file
// project/src/migrations/promotion/040_create_promotions_table.js
const { pool } = require('../../../config/database');

async function up() {
    console.log('Tạo bảng promotions...');
    const query = `
        CREATE TABLE IF NOT EXISTS promotions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            code VARCHAR(50) UNIQUE,
            type ENUM('percent', 'fixed') NOT NULL,
            value DECIMAL(10, 2) NOT NULL,
            min_order_amount DECIMAL(10, 2) DEFAULT 0,
            start_date TIMESTAMP NOT NULL,
            end_date TIMESTAMP NOT NULL,
            is_active BOOLEAN DEFAULT TRUE
        ) ENGINE=InnoDB;
    `;
    await pool.execute(query);
}

async function down() {
    console.log('Xóa bảng promotions...');
    await pool.execute('DROP TABLE IF EXISTS promotions;');
}

module.exports = { up, down };