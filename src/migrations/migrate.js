// project/src/migrations/migrate.js
const fs = require('fs');
const path = require('path');

// Đảm bảo môi trường được tải (database.js đã làm, nhưng an toàn hơn nếu script độc lập tải)
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') }); 
const { pool } = require('../../config/database');

const migrationDir = __dirname;
const systemDir = path.join(migrationDir, 'system');

// Hàm chạy Migration chính
async function runMigrations() {
    console.log('============================================');
    console.log('   BẮT ĐẦU CHẠY DATABASE MIGRATIONS');
    console.log('============================================');

    try {
        // 1. CHẠY MIGRATION LÕI: 051_create_migrations_table.js
        // Cần đảm bảo file này chạy thành công trước khi truy vấn nó.
        const migrationTablePath = path.join(systemDir, '051_create_migrations_table.js');
        if (fs.existsSync(migrationTablePath)) {
            await require(migrationTablePath).up();
            console.log('Migration system table initialized.');
        } else {
             console.error('❌ Lỗi: Không tìm thấy 051_create_migrations_table.js');
             process.exit(1);
        }

        // 2. LẤY TẤT CẢ CÁC FILE MIGRATION CẦN CHẠY
        // Lấy danh sách các thư mục (core, menu, order, ...) trừ seed/
        const subDirs = fs.readdirSync(migrationDir)
            .filter(name => 
                fs.statSync(path.join(migrationDir, name)).isDirectory() 
                && name !== 'seed'
            );
        
        // Tạo danh sách các file migration theo thứ tự tên
        let allMigrationFiles = [];
        for (const dir of subDirs) {
            const files = fs.readdirSync(path.join(migrationDir, dir))
                .filter(file => file.endsWith('.js') && file.match(/^\d{3}_/))
                .map(file => ({
                    filename: file,
                    filepath: path.join(migrationDir, dir, file)
                }));
            allMigrationFiles = allMigrationFiles.concat(files);
        }

        // Sắp xếp theo số thứ tự (đảm bảo thứ tự khóa ngoại)
        allMigrationFiles.sort((a, b) => {
            const numA = parseInt(a.filename.split('_')[0]);
            const numB = parseInt(b.filename.split('_')[0]);
            // Nếu số thứ tự bằng nhau, sắp xếp theo tên file
            if (numA === numB) {
                return a.filename.localeCompare(b.filename);
            }
            return numA - numB;
        });

        // ===================================================
        // 3. THỰC THI
        // ===================================================
        const connection = await pool.getConnection();

        for (const { filename, filepath } of allMigrationFiles) {
            // Bỏ qua file 051 vì đã chạy ở bước 1
            if (filename === '051_create_migrations_table.js') continue;
            
            // Kiểm tra xem migration này đã chạy chưa
            const [rows] = await connection.execute(
                'SELECT filename FROM migrations WHERE filename = ?', 
                [filename]
            );

            if (rows.length === 0) {
                console.log(`\n> Đang chạy migration: ${filename}`);
                const migration = require(filepath);
                
                if (migration.up) {
                    await migration.up(); 
                    
                    // Lưu lại vào bảng migrations
                    await connection.execute(
                        'INSERT INTO migrations (filename) VALUES (?)', 
                        [filename]
                    );
                    console.log(`  ✅ Hoàn tất: ${filename}`);
                } else {
                    console.warn(`[Cảnh báo] File ${filename} không có hàm 'up'`);
                }
            } else {
                console.log(`\n> Bỏ qua: ${filename} (Đã chạy)`);
            }
        }

        connection.release();
        console.log('\n✅ TẤT CẢ MIGRATIONS HỆ THỐNG HOÀN TẤT.');
        
    } catch (error) {
        console.error('\n❌ MIGRATION THẤT BẠI. Dừng lại.', error);
        process.exit(1);
    }
}

// Chạy hàm main và thoát process
runMigrations().then(() => process.exit(0)).catch(() => process.exit(1));