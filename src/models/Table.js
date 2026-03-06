// project/src/models/Table.js
const { pool } = require('../../config/database');

class Table {
    // 1. Lấy tất cả danh sách bàn
    static async findAll() {
        const [rows] = await pool.execute(
            'SELECT * FROM tables ORDER BY table_number ASC'
        );
        return rows;
    }

    // 2. Tìm bàn theo ID
    static async findById(id) {
        const [rows] = await pool.execute(
            'SELECT * FROM tables WHERE id = ?',
            [id]
        );
        return rows[0];
    }

    // 3. Tìm bàn theo Số bàn (Dùng cho QR polling)
    static async findByTableNumber(tableNumber) {
        const [rows] = await pool.execute(
            'SELECT * FROM tables WHERE table_number = ?',
            [tableNumber]
        );
        return rows[0];
    }

    // 4. Tạo bàn mới
    // FIX: Bỏ tham số qrCodePath — controller sẽ generate QR sau khi có tableId
    // rồi UPDATE qr_code_path riêng, không truyền vào lúc INSERT
    static async create(tableNumber, capacity) {
        const [result] = await pool.execute(
            'INSERT INTO tables (table_number, capacity, status) VALUES (?, ?, ?)',
            [tableNumber, capacity, 'available']
        );
        return result.insertId;
    }

    // 5. Cập nhật trạng thái bàn
    // status: 'available' | 'occupied' | 'cleaning'
    static async updateStatus(id, status) {
        const [result] = await pool.execute(
            'UPDATE tables SET status = ? WHERE id = ?',
            [status, id]
        );
        return result.affectedRows;
    }

    // 6. Xóa bàn
    static async delete(id) {
        const [result] = await pool.execute(
            'DELETE FROM tables WHERE id = ?',
            [id]
        );
        return result.affectedRows;
    }
}

module.exports = Table;