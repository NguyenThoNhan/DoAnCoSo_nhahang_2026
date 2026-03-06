const { pool } = require('../../config/database');

class Ingredient {
    static async findAll() {
        const [rows] = await pool.execute('SELECT * FROM ingredients ORDER BY name ASC');
        return rows;
    }

    static async create(name, unit, stock_quantity, min_stock_level) {
        const [result] = await pool.execute(
            'INSERT INTO ingredients (name, unit, stock_quantity, min_stock_level) VALUES (?, ?, ?, ?)',
            [name, unit, stock_quantity, min_stock_level]
        );
        return result.insertId;
    }

    static async update(id, name, unit, stock_quantity, min_stock_level) {
        const query = `
            UPDATE ingredients 
            SET name = ?, unit = ?, stock_quantity = ?, min_stock_level = ?
            WHERE id = ?
        `;
        const [result] = await pool.execute(query, [name, unit, stock_quantity, min_stock_level, id]);
        return result.affectedRows;
    }

    static async delete(id) {
        const [result] = await pool.execute('DELETE FROM ingredients WHERE id = ?', [id]);
        return result.affectedRows;
    }
}

module.exports = Ingredient;