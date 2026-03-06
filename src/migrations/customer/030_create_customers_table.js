// migration / seed file
// project/src/migrations/customer/030_create_customers_table.js
const { pool } = require('../../../config/database');

async function up() {
    console.log('Tạo bảng customers...');
    const query = `
        CREATE TABLE IF NOT EXISTS customers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT UNIQUE NOT NULL, -- Liên kết 1-1 với bảng users
            address TEXT,
            last_order_at TIMESTAMP NULL,
            
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB;
    `;
    await pool.execute(query);
}

async function down() {
    console.log('Xóa bảng customers...');
    await pool.execute('DROP TABLE IF EXISTS customers;');
}

module.exports = { up, down };