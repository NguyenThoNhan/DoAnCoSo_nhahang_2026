// migration / seed file
// project/src/migrations/menu/010_create_categories_table.js
const { pool } = require('../../../config/database');

async function up() {
    console.log('Tạo bảng categories...');
    const query = `
        CREATE TABLE IF NOT EXISTS categories (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL UNIQUE,
            description TEXT,
            image_url VARCHAR(255),
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB;
    `;
    await pool.execute(query);
}

async function down() {
    console.log('Xóa bảng categories...');
    await pool.execute('DROP TABLE IF EXISTS categories;');
}

module.exports = { up, down };