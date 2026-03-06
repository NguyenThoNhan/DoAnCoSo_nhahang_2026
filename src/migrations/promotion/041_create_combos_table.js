// migration / seed file
// project/src/migrations/promotion/041_create_combos_table.js
const { pool } = require('../../../config/database');

async function up() {
    console.log('Tạo bảng combos...');
    const query = `
        CREATE TABLE IF NOT EXISTS combos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            price DECIMAL(10, 2) NOT NULL,
            start_date TIMESTAMP,
            end_date TIMESTAMP,
            is_active BOOLEAN DEFAULT TRUE
            -- Có thể thêm bảng combo_items để liên kết với foods sau
        ) ENGINE=InnoDB;
    `;
    await pool.execute(query);
}

async function down() {
    console.log('Xóa bảng combos...');
    await pool.execute('DROP TABLE IF EXISTS combos;');
}

module.exports = { up, down };