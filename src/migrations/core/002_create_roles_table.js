// migration / seed file
// project/src/migrations/core/002_create_roles_table.js
const { pool } = require('../../../config/database');

async function up() {
    console.log('Tạo bảng roles...');
    const query = `
        CREATE TABLE IF NOT EXISTS roles (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL UNIQUE,
            description TEXT
        ) ENGINE=InnoDB;
    `;
    await pool.execute(query);
}

async function down() {
    console.log('Xóa bảng roles...');
    await pool.execute('DROP TABLE IF EXISTS roles;');
}

module.exports = { up, down };