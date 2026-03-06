// migration / seed file
// project/src/migrations/customer/031_create_members_table.js
const { pool } = require('../../../config/database');

async function up() {
    console.log('Tạo bảng members (Thành viên)...');
    const query = `
        CREATE TABLE IF NOT EXISTS members (
            id INT AUTO_INCREMENT PRIMARY KEY,
            customer_id INT UNIQUE NOT NULL, -- Liên kết 1-1 với bảng customers
            membership_level ENUM('silver', 'gold', 'platinum') DEFAULT 'silver',
            join_date DATE NOT NULL,
            
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
        ) ENGINE=InnoDB;
    `;
    await pool.execute(query);
}

async function down() {
    console.log('Xóa bảng members...');
    await pool.execute('DROP TABLE IF EXISTS members;');
}

module.exports = { up, down };