// migration / seed file
// project/src/migrations/menu/012_create_food_images_table.js
const { pool } = require('../../../config/database');

async function up() {
    console.log('Tạo bảng food_images...');
    const query = `
        CREATE TABLE IF NOT EXISTS food_images (
            id INT AUTO_INCREMENT PRIMARY KEY,
            food_id INT NOT NULL,
            image_url VARCHAR(255) NOT NULL,
            is_main BOOLEAN DEFAULT FALSE,
            
            FOREIGN KEY (food_id) REFERENCES foods(id) ON DELETE CASCADE
        ) ENGINE=InnoDB;
    `;
    await pool.execute(query);
}

async function down() {
    console.log('Xóa bảng food_images...');
    await pool.execute('DROP TABLE IF EXISTS food_images;');
}

module.exports = { up, down };