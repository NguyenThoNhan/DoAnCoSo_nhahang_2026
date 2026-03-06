// migration / seed file
// project/src/migrations/order/020_create_tables_table.js
const { pool } = require('../../../config/database');

async function up() {
    console.log('Tạo bảng tables...');
    const query = `
        CREATE TABLE IF NOT EXISTS tables (
            id INT AUTO_INCREMENT PRIMARY KEY,
            table_number VARCHAR(100) NOT NULL UNIQUE,
            capacity INT NOT NULL DEFAULT 4,
            qr_code_path VARCHAR(255),  -- Đường dẫn đến file QR Code được tạo
            status ENUM('available', 'occupied', 'cleaning') DEFAULT 'available',
            last_order_id INT NULL      -- Lượt order gần nhất (optional)
        ) ENGINE=InnoDB;
    `;
    await pool.execute(query);
}

async function down() {
    console.log('Xóa bảng tables...');
    await pool.execute('DROP TABLE IF EXISTS tables;');
}

module.exports = { up, down };