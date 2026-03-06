// migration / seed file
// project/src/migrations/seed/102_seed_categories.js
const { pool } = require('../../../config/database');

async function runSeed() {
    console.log('Chèn dữ liệu mẫu cho categories...');
    
    const categories = [
        { name: 'Món Chính', description: 'Các món ăn no bụng truyền thống.' },
        { name: 'Khai Vị', description: 'Các món ăn nhẹ kích thích vị giác.' },
        { name: 'Hải Sản', description: 'Các món từ tôm, cua, cá tươi ngon.' },
        { name: 'Đồ Uống', description: 'Các loại nước ngọt, bia, rượu.' },
        { name: 'Tráng Miệng', description: 'Các món ngọt kết thúc bữa ăn.' },
    ];
    
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        for (const cat of categories) {
            const [rows] = await connection.execute('SELECT id FROM categories WHERE name = ?', [cat.name]);
            if (rows.length === 0) {
                await connection.execute(
                    'INSERT INTO categories (name, description) VALUES (?, ?)',
                    [cat.name, cat.description]
                );
            }
        }
        await connection.commit();
        console.log('✅ Seeding categories thành công.');
    } catch (error) {
        await connection.rollback();
        console.error('❌ Lỗi khi seeding categories:', error);
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = { runSeed };