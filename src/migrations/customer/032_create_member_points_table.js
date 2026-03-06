// migration / seed file
// project/src/migrations/customer/032_create_member_points_table.js
const { pool } = require('../../../config/database');

async function up() {
    console.log('Tạo bảng member_points (Điểm tích lũy)...');
    const query = `
        CREATE TABLE IF NOT EXISTS member_points (
            id INT AUTO_INCREMENT PRIMARY KEY,
            customer_id INT NOT NULL,
            points_gained INT NOT NULL DEFAULT 0,
            points_used INT NOT NULL DEFAULT 0,
            current_points INT NOT NULL DEFAULT 0,
            transaction_type VARCHAR(100),
            transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
        ) ENGINE=InnoDB;
    `;
    await pool.execute(query);
}

async function down() {
    console.log('Xóa bảng member_points...');
    await pool.execute('DROP TABLE IF EXISTS member_points;');
}

module.exports = { up, down };