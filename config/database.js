// project/config/database.js
const mysql = require('mysql2/promise');
const path = require('path');

// Kiểm tra nếu các biến môi trường chưa được tải (ví dụ: khi chạy script độc lập)
// Ta sẽ tải thủ công từ thư mục gốc của dự án.
if (!process.env.DB_HOST) {
    // Tải .env từ thư mục gốc dự án
    require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
}

// Khởi tạo Connection Pool
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function checkDatabaseConnection() {
    try {
        await pool.getConnection();
        console.log('✅ Kết nối Database MySQL thành công!');
    } catch (error) {
        console.error('❌ Lỗi kết nối Database: ', error.message);
        // Nếu lỗi Access Denied, thường là do thông tin đăng nhập sai hoặc biến môi trường chưa được thiết lập
        if (error.code === 'ER_ACCESS_DENIED_ERROR' || error.errno === 1045) {
             console.error('Vui lòng kiểm tra lại DB_USER, DB_PASSWORD trong file .env');
        }
        process.exit(1); 
    }
}

module.exports = {
    pool,
    checkDatabaseConnection
};