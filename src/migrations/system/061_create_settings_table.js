const { pool } = require('../../../config/database');

async function up() {
    console.log('Migration 061: Tạo bảng settings...');
    const query = `
        CREATE TABLE IF NOT EXISTS settings (
            id INT PRIMARY KEY DEFAULT 1,
            restaurant_name VARCHAR(255) NOT NULL,
            address TEXT,
            phone VARCHAR(20),
            email VARCHAR(100),
            opening_hours VARCHAR(255),
            logo_url VARCHAR(255),
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB;
    `;
    await pool.execute(query);

    // Chèn dữ liệu mặc định ban đầu
    const seedQuery = `
        INSERT IGNORE INTO settings (id, restaurant_name, address, phone, email, opening_hours) 
        VALUES (1, 'Nhà Hàng Thông Minh', '123 Đường ABC, Hà Nội', '0901234567', 'contact@nhahang.com', '08:00 - 22:00');
    `;
    await pool.execute(seedQuery);
}

module.exports = { up };