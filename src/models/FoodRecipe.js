const { pool } = require('../../config/database');

class FoodRecipe {
    // 1. Lấy công thức của 1 món ăn cụ thể
    static async findByFoodId(foodId) {
        const query = `
            SELECT fr.*, i.name as ingredient_name, i.unit 
            FROM food_recipes fr
            JOIN ingredients i ON fr.ingredient_id = i.id
            WHERE fr.food_id = ?
        `;
        const [rows] = await pool.execute(query, [foodId]);
        return rows;
    }

    // 2. Thêm nguyên liệu vào công thức món ăn
    static async addIngredient(foodId, ingredientId, quantityRequired) {
        const query = `
            INSERT INTO food_recipes (food_id, ingredient_id, quantity_required)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE quantity_required = ?
        `;
        const [result] = await pool.execute(query, [foodId, ingredientId, quantityRequired, quantityRequired]);
        return result.insertId;
    }

    // 3. Xóa nguyên liệu khỏi công thức của món
    static async removeIngredient(foodId, ingredientId) {
        const query = 'DELETE FROM food_recipes WHERE food_id = ? AND ingredient_id = ?';
        const [result] = await pool.execute(query, [foodId, ingredientId]);
        return result.affectedRows;
    }
}

module.exports = FoodRecipe;