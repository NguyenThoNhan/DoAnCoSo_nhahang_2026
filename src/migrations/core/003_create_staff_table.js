// migration / seed file
// project/src/migrations/core/003_create_staff_table.js
const { pool } = require('../../../config/database');

async function up() {
    console.log('Tạo bảng staff...');
    const query = `
        CREATE TABLE IF NOT EXISTS staff (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT UNIQUE,           -- Liên kết tới user (admin, thu ngân, quản lý...)
            role_id INT,                  -- Vai trò cụ thể (Quản lý, Thu ngân, Phục vụ)
            employee_code VARCHAR(50) UNIQUE,
            hire_date DATE,
            salary DECIMAL(10, 2),
            is_active BOOLEAN DEFAULT TRUE,
            
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL
        ) ENGINE=InnoDB;
    `;
    await pool.execute(query);
}

async function down() {
    console.log('Xóa bảng staff...');
    await pool.execute('DROP TABLE IF EXISTS staff;');
}

module.exports = { up, down };