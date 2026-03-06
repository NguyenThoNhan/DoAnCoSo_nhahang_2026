// project/src/migrations/seed.js
const fs = require('fs');
const path = require('path');
// Tải .env từ thư mục gốc
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') }); 

// Thư mục chứa các file seed
const seedDir = path.join(__dirname, 'seed');

async function runSeeds() {
    console.log('============================================');
    console.log('   BẮT ĐẦU CHẠY DATABASE SEEDING');
    console.log('============================================');
    
    try {
        // 1. Kiểm tra kết nối DB (được handle bởi pool)
        
        // 2. Lấy tất cả các file seed theo thứ tự
        const seedFiles = fs.readdirSync(seedDir)
            .filter(file => file.endsWith('.js') && file.match(/^\d{3}_/))
            .sort();

        for (const file of seedFiles) {
            console.log(`\n> Đang chạy seed file: ${file}`);
            const seedModule = require(path.join(seedDir, file));
            
            if (seedModule.runSeed) {
                await seedModule.runSeed();
                console.log(`  ✅ Hoàn tất: ${file}`);
            } else {
                console.warn(`[Cảnh báo] File ${file} không có hàm 'runSeed'`);
            }
        }

        console.log('\n✅ TẤT CẢ SEEDING HOÀN TẤT.');
    } catch (error) {
        console.error('\n❌ SEEDING THẤT BẠI.', error.message);
        process.exit(1);
    }
}

// Chạy hàm main
runSeeds().then(() => process.exit(0)).catch(() => process.exit(1));