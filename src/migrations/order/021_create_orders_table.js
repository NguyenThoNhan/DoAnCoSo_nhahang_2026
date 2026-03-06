// project/src/migrations/order/021_create_orders_table.js
const { pool } = require('../../../config/database');

async function up() {
    console.log('Tạo bảng orders...');
    const query = `
        CREATE TABLE IF NOT EXISTS orders (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NULL,          
            table_id INT NULL,         
            total_amount DECIMAL(10, 2) NOT NULL,
            status ENUM('pending', 'processing', 'ready', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
            payment_status ENUM('pending', 'paid', 'failed') NOT NULL DEFAULT 'pending',
            is_delivery BOOLEAN DEFAULT FALSE,
            order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
            FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE SET NULL
        ) ENGINE=InnoDB;
    `;
    await pool.execute(query);
}

async function down() {
    console.log('Xóa bảng orders...');
    await pool.execute('DROP TABLE IF EXISTS orders;');
}

module.exports = { up, down };