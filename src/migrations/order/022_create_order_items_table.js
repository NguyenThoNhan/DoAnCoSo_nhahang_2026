// migration / seed file
// project/src/migrations/order/022_create_order_items_table.js
const { pool } = require('../../../config/database');

async function up() {
    console.log('Tạo bảng order_items...');
    const query = `
        CREATE TABLE IF NOT EXISTS order_items (
            id INT AUTO_INCREMENT PRIMARY KEY,
            order_id INT NOT NULL,
            food_id INT NULL,
            quantity INT NOT NULL,
            price_at_order DECIMAL(10, 2) NOT NULL,
            item_name VARCHAR(255) NOT NULL, -- Lưu tên món ăn (phòng trường hợp món bị xóa)
            
            FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
            FOREIGN KEY (food_id) REFERENCES foods(id) ON DELETE SET NULL
        ) ENGINE=InnoDB;
    `;
    await pool.execute(query);
}

async function down() {
    console.log('Xóa bảng order_items...');
    await pool.execute('DROP TABLE IF EXISTS order_items;');
}

module.exports = { up, down };