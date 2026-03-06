const { pool } = require('../../config/database');

class Combo {
    // 1. Lấy toàn bộ combo kèm danh sách món ăn bên trong
    static async findAll() {
        const query = `
            SELECT c.*, GROUP_CONCAT(f.name SEPARATOR ', ') as food_names
            FROM combos c
            LEFT JOIN combo_items ci ON c.id = ci.combo_id
            LEFT JOIN foods f ON ci.food_id = f.id
            GROUP BY c.id
        `;
        const [rows] = await pool.execute(query);
        return rows;
    }

    // 2. Tạo Combo mới (Dùng Transaction)
    static async create(name, description, price, foodIds, connection) {
        // chèn vào bảng combos
        const [result] = await connection.execute(
            'INSERT INTO combos (name, description, price, is_active) VALUES (?, ?, ?, ?)',
            [name, description, price, 1]
        );
        const comboId = result.insertId;

        // chèn vào bảng combo_items
        for (const foodId of foodIds) {
            await connection.execute(
                'INSERT INTO combo_items (combo_id, food_id) VALUES (?, ?)',
                [comboId, foodId]
            );
        }
        return comboId;
    }
}

module.exports = Combo;