const { pool } = require('../../config/database');

class User {
    // Tìm người dùng bằng email
    static async findByEmail(email) {
        const [rows] = await pool.execute(
            'SELECT * FROM users WHERE email = ?', 
            [email]
        );
        return rows[0]; // Trả về đối tượng user hoặc undefined
    }

    // Tạo người dùng mới
    static async create(name, email, passwordHash, role = 'customer') {
        const [result] = await pool.execute(
            'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
            [name, email, passwordHash, role]
        );
        return result.insertId; // Trả về ID của người dùng vừa tạo
    }
    
    // Tìm người dùng bằng ID (sẽ dùng cho middleware sau)
    static async findById(id) {
        const [rows] = await pool.execute(
            'SELECT id, name, email, role FROM users WHERE id = ?', 
            [id]
        );
        return rows[0];
    }
}

module.exports = User;