const { pool } = require('../../../config/database');

async function up() {
    console.log('Migration 025: Tạo bảng quản lý kho và định lượng...');
    
    // 1. Bảng nguyên liệu thô
    await pool.execute(`
        CREATE TABLE IF NOT EXISTS ingredients (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL UNIQUE,
            unit VARCHAR(50) NOT NULL,       -- kg, g, lít, quả, lon...
            stock_quantity DECIMAL(10, 2) DEFAULT 0,
            min_stock_level DECIMAL(10, 2) DEFAULT 0, -- Ngưỡng báo động sắp hết
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB;
    `);

    // 2. Bảng định lượng (Công thức món ăn)
    await pool.execute(`
        CREATE TABLE IF NOT EXISTS food_recipes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            food_id INT NOT NULL,
            ingredient_id INT NOT NULL,
            quantity_required DECIMAL(10, 2) NOT NULL, -- Lượng cần cho 1 suất ăn
            FOREIGN KEY (food_id) REFERENCES foods(id) ON DELETE CASCADE,
            FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE
        ) ENGINE=InnoDB;
    `);
    
    console.log('✅ Tạo bảng kho và định lượng thành công.');
}

module.exports = { up };