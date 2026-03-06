// migration / seed file
// project/src/migrations/seed/101_seed_admin_user.js
const { pool } = require('../../../config/database');
const bcrypt = require('bcryptjs');

async function runSeed() {
    console.log('Chèn dữ liệu mẫu cho Admin và Customer...');

    // Hash mật khẩu
    const adminPasswordHash = await bcrypt.hash('admin123', 10); 
    const customerPasswordHash = await bcrypt.hash('customer123', 10); 

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Chèn Admin mẫu: admin@gmail.com / admin123
        const [adminRows] = await connection.execute('SELECT id FROM users WHERE email = ?', ['admin@gmail.com']);
        if (adminRows.length === 0) {
            await connection.execute(
                'INSERT INTO users (name, email, phone_number, password, role) VALUES (?, ?, ?, ?, ?)',
                ['Admin Hệ Thống', 'admin@gmail.com', '0901234567', adminPasswordHash, 'admin']
            );
            console.log('   -> Đã chèn Admin mẫu: admin@gmail.com / admin123');
        } else {
            console.log('   -> Admin mẫu đã tồn tại.');
        }

        // 2. Chèn Customer mẫu: customer1@gmail.com / customer123
        const [customerRows] = await connection.execute('SELECT id FROM users WHERE email = ?', ['customer1@gmail.com']);
        if (customerRows.length === 0) {
            await connection.execute(
                'INSERT INTO users (name, email, phone_number, password, role) VALUES (?, ?, ?, ?, ?)',
                ['Nguyễn Văn Khách', 'customer1@gmail.com', '0987654321', customerPasswordHash, 'customer']
            );
            console.log('   -> Đã chèn Customer mẫu: customer1@gmail.com / customer123');
        } else {
            console.log('   -> Customer mẫu đã tồn tại.');
        }

        await connection.commit();
        console.log('✅ Seeding Admin/Customer thành công.');

    } catch (error) {
        await connection.rollback();
        console.error('❌ Lỗi khi seeding users:', error);
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = { runSeed };