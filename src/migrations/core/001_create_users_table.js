// migration / seed file
// project/src/migrations/core/001_create_users_table.js
const { pool } = require('../../../config/database');

async function up() {
    console.log('Tạo bảng users (Auth Users)...');
    const query = `
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL UNIQUE,
            phone_number VARCHAR(20),  
            password VARCHAR(255) NOT NULL,
            role ENUM('customer', 'admin') NOT NULL DEFAULT 'customer',
            status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB;
    `;
    await pool.execute(query);
}

async function down() {
    console.log('Xóa bảng users...');
    await pool.execute('DROP TABLE IF EXISTS users;');
}

module.exports = { up, down };