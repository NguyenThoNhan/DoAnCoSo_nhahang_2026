// project/src/models/Staff.js
const { pool } = require('../../config/database');

class Staff {
    // 1. Lấy danh sách toàn bộ nhân viên (Join với bảng users để lấy tên, email)
    static async findAll() {
        const query = `
            SELECT s.*, u.name, u.email, u.phone_number, r.name as role_name
            FROM staff s
            JOIN users u ON s.user_id = u.id
            LEFT JOIN roles r ON s.role_id = r.id
            ORDER BY s.id DESC
        `;
        const [rows] = await pool.execute(query);
        return rows;
    }

    // 2. Tạo nhân viên (Phải chạy trong Transaction cùng với tạo User)
    static async create(userId, roleId, employeeCode, hireDate, salary, connection) {
        const query = `
            INSERT INTO staff (user_id, role_id, employee_code, hire_date, salary)
            VALUES (?, ?, ?, ?, ?)
        `;
        const [result] = await connection.execute(query, [userId, roleId, employeeCode, hireDate, salary]);
        return result.insertId;
    }

    // 3. Xóa nhân viên
    static async delete(id) {
        const [result] = await pool.execute('DELETE FROM staff WHERE id = ?', [id]);
        return result.affectedRows;
    }
}

module.exports = Staff;