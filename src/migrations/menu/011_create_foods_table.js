// migration / seed file
// project/src/migrations/menu/011_create_foods_table.js
const { pool } = require('../../../config/database');

async function up() {
    console.log('Tạo bảng foods...');
    const query = `
        CREATE TABLE IF NOT EXISTS foods (
            id INT AUTO_INCREMENT PRIMARY KEY,
            category_id INT NOT NULL,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            price DECIMAL(10, 2) NOT NULL,
            is_available BOOLEAN DEFAULT TRUE, -- Hết nguyên liệu / có sẵn
            is_featured BOOLEAN DEFAULT FALSE, -- Món nổi bật
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            
            FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
        ) ENGINE=InnoDB;
    `;
    await pool.execute(query);
}

async function down() {
    console.log('Xóa bảng foods...');
    await pool.execute('DROP TABLE IF EXISTS foods;');
}

module.exports = { up, down };