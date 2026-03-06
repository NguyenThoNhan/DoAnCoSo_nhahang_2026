// project/src/migrations/system/051_create_migrations_table.js
const { pool } = require('../../../config/database');

async function up() {
    const query = `
        CREATE TABLE IF NOT EXISTS migrations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            filename VARCHAR(255) NOT NULL UNIQUE,
            ran_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB;
    `;
    await pool.execute(query);
}

// Ta không cần hàm down cho bảng migrations
module.exports = { up };