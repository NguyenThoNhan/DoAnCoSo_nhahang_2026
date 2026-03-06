// project/src/migrations/promotion/042_create_combo_items_table.js
const { pool } = require('../../../config/database');

async function up() {
    console.log('Tạo bảng combo_items...');
    const query = `
        CREATE TABLE IF NOT EXISTS combo_items (
            combo_id INT NOT NULL,
            food_id INT NOT NULL,
            quantity INT NOT NULL DEFAULT 1,
            PRIMARY KEY (combo_id, food_id), -- Khóa chính kép
            
            FOREIGN KEY (combo_id) REFERENCES combos(id) ON DELETE CASCADE,
            FOREIGN KEY (food_id) REFERENCES foods(id) ON DELETE CASCADE
        ) ENGINE=InnoDB;
    `;
    await pool.execute(query);
}

async function down() {
    console.log('Xóa bảng combo_items...');
    await pool.execute('DROP TABLE IF EXISTS combo_items;');
}

module.exports = { up, down };