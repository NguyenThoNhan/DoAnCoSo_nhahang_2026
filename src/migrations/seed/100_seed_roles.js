// migration / seed file
// project/src/migrations/seed/100_seed_roles.js
const { pool } = require('../../../config/database');

async function runSeed() {
    console.log('Chèn dữ liệu mẫu cho bảng roles...');
    
    const roles = [
        { name: 'Admin', description: 'Quản lý toàn bộ hệ thống' },
        { name: 'Manager', description: 'Quản lý vận hành chi nhánh' },
        { name: 'Cashier', description: 'Thu ngân và xử lý thanh toán' },
        { name: 'Waiter', description: 'Phục vụ bàn' },
    ];
    
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        for (const role of roles) {
            const [rows] = await connection.execute('SELECT id FROM roles WHERE name = ?', [role.name]);
            if (rows.length === 0) {
                await connection.execute(
                    'INSERT INTO roles (name, description) VALUES (?, ?)',
                    [role.name, role.description]
                );
            }
        }
        await connection.commit();
        console.log('✅ Seeding roles thành công.');
    } catch (error) {
        await connection.rollback();
        console.error('❌ Lỗi khi seeding roles:', error);
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = { runSeed };