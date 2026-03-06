// project/src/models/Inventory.js
const { pool } = require('../../config/database');

class Inventory {
    // 1. Trừ kho khi hoàn thành đơn hàng (chạy trong transaction)
    static async deductStock(foodId, quantitySold, connection) {
        const [recipe] = await connection.execute(
            'SELECT ingredient_id, quantity_required FROM food_recipes WHERE food_id = ?',
            [foodId]
        );

        for (const item of recipe) {
            const totalDeduct = item.quantity_required * quantitySold;

            await connection.execute(
                'UPDATE ingredients SET stock_quantity = GREATEST(0, stock_quantity - ?) WHERE id = ?',
                [totalDeduct, item.ingredient_id]
            );

            // FIX: Truyền connection vào autoDisableFoods để ở trong cùng transaction
            // Trước đây dùng pool.execute → tạo connection mới ngoài transaction
            // → nếu rollback thì foods đã bị ẩn nhưng kho chưa trừ = inconsistent
            await this.autoDisableFoods(item.ingredient_id, connection);
        }
    }

    // 2. Tự động ẩn món khi nguyên liệu cạn kiệt
    // FIX: Nhận connection thay vì dùng pool trực tiếp
    static async autoDisableFoods(ingredientId, connection) {
        const [ingredient] = await connection.execute(
            'SELECT stock_quantity FROM ingredients WHERE id = ?',
            [ingredientId]
        );

        if (ingredient.length > 0 && ingredient[0].stock_quantity <= 0) {
            await connection.execute(
                `UPDATE foods f
                 JOIN food_recipes fr ON f.id = fr.food_id
                 SET f.is_available = 0
                 WHERE fr.ingredient_id = ?`,
                [ingredientId]
            );
            console.log(`⚠️ Nguyên liệu ID ${ingredientId} đã hết. Tự động ẩn các món liên quan.`);
        }
    }
}

module.exports = Inventory;