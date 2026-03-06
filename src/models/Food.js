// project/src/models/Food.js
const { pool } = require('../../config/database');

class Food {
    // [R] Lấy tất cả món ăn
    // FIX: LEFT JOIN thay vì INNER JOIN để Admin thấy cả món có danh mục đã ẩn/xóa
    static async findAll() {
        const query = `
            SELECT 
                f.id, f.name, f.description, f.price, f.is_available, f.is_featured, f.image_url,
                c.id AS category_id, c.name AS category_name
            FROM foods f
            LEFT JOIN categories c ON f.category_id = c.id
            ORDER BY f.name ASC
        `;
        const [rows] = await pool.execute(query);
        return rows;
    }

    // [R] Lấy món ăn theo ID
    static async findById(id) {
        const query = `
            SELECT 
                f.id, f.name, f.description, f.price, f.is_available, f.is_featured, f.category_id, f.image_url
            FROM foods f
            WHERE f.id = ?
        `;
        const [rows] = await pool.execute(query, [id]);
        return rows[0];
    }

    // [C] Tạo món ăn mới
    static async create(categoryId, name, description, price, isFeatured = false, imageUrl = null) {
        const [result] = await pool.execute(
            'INSERT INTO foods (category_id, name, description, price, is_featured, image_url) VALUES (?, ?, ?, ?, ?, ?)',
            [categoryId, name, description, price, isFeatured, imageUrl]
        );
        return result.insertId;
    }

    // [U] Cập nhật món ăn
    static async update(id, categoryId, name, description, price, isAvailable, isFeatured, imageUrl) {
        const query = `
            UPDATE foods 
            SET category_id = ?, name = ?, description = ?, price = ?, is_available = ?, is_featured = ?, image_url = ?
            WHERE id = ?
        `;
        const [result] = await pool.execute(
            query,
            [categoryId, name, description, price, isAvailable, isFeatured, imageUrl, id]
        );
        return result.affectedRows;
    }

    // [D] Xóa món ăn
    static async delete(id) {
        const [result] = await pool.execute(
            'DELETE FROM foods WHERE id = ?',
            [id]
        );
        return result.affectedRows;
    }

    // [U] Cập nhật trạng thái có sẵn
    static async updateAvailability(id, isAvailable) {
        const [result] = await pool.execute(
            'UPDATE foods SET is_available = ? WHERE id = ?',
            [isAvailable, id]
        );
        return result.affectedRows;
    }
}

module.exports = Food;