// project/src/models/Category.js
const { pool } = require('../../config/database');

class Category {
    // [R] Lấy tất cả danh mục
    static async findAll() {
        const [rows] = await pool.execute(
            'SELECT id, name, description, image_url, is_active FROM categories ORDER BY name ASC'
        );
        return rows;
    }

    // [R] Lấy danh mục theo ID
    static async findById(id) {
        const [rows] = await pool.execute(
            'SELECT id, name, description, image_url, is_active FROM categories WHERE id = ?',
            [id]
        );
        return rows[0];
    }

    // [C] Tạo danh mục mới
    static async create(name, description, imageUrl = null) {
        const [result] = await pool.execute(
            'INSERT INTO categories (name, description, image_url) VALUES (?, ?, ?)',
            [name, description, imageUrl]
        );
        return result.insertId;
    }

    // [U] Cập nhật danh mục
    static async update(id, name, description, imageUrl, isActive) {
        const query = `
            UPDATE categories 
            SET name = ?, description = ?, image_url = ?, is_active = ?
            WHERE id = ?
        `;
        const [result] = await pool.execute(
            query, 
            [name, description, imageUrl, isActive, id]
        );
        return result.affectedRows;
    }

    // [D] Xóa danh mục
    static async delete(id) {
        const [result] = await pool.execute(
            'DELETE FROM categories WHERE id = ?',
            [id]
        );
        return result.affectedRows;
    }
}

module.exports = Category;