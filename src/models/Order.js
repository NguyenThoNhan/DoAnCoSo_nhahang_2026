// project/src/models/Order.js
const { pool } = require('../../config/database');

class Order {
    // [C] Tạo đơn hàng mới (chạy trong transaction)
    static async create(userId, tableId, totalAmount, connection) {
        // Lưu ý: Database tự động điền order_date bằng CURRENT_TIMESTAMP
        const [result] = await connection.execute(
            'INSERT INTO orders (user_id, table_id, total_amount) VALUES (?, ?, ?)',
            [userId || null, tableId, totalAmount]
        );
        return result.insertId;
    }

    // [R] Lấy chi tiết 1 đơn hàng
    // FIX: Dùng order_date AS created_at để khớp với Frontend
    static async findById(orderId) {
        const query = `
            SELECT 
                o.id, 
                o.order_date AS created_at, 
                o.total_amount, 
                o.discount_amount,
                o.status, 
                t.table_number,
                u.name AS user_name
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id
            LEFT JOIN tables t ON o.table_id = t.id
            WHERE o.id = ?
        `;
        const [rows] = await pool.execute(query, [orderId]);
        return rows[0];
    }

    // [U] Cập nhật trạng thái đơn hàng
    static async updateStatus(orderId, newStatus) {
        const [result] = await pool.execute(
            'UPDATE orders SET status = ? WHERE id = ?',
            [newStatus, orderId]
        );
        return result.affectedRows;
    }

    // [R] Lấy danh sách đơn hàng (Admin)
    // FIX: Đổi o.created_at thành o.order_date
    static async findAll() {
        const query = `
            SELECT 
                o.id, 
                o.order_date AS created_at, 
                o.total_amount, 
                o.discount_amount,
                o.status, 
                t.table_number,
                u.name AS customer_name
            FROM orders o
            LEFT JOIN tables t ON o.table_id = t.id
            LEFT JOIN users u ON o.user_id = u.id
            ORDER BY o.order_date DESC
            LIMIT 100
        `;
        const [rows] = await pool.execute(query);
        return rows;
    }

    // [R] Lấy lịch sử đơn của 1 user (Customer)
    // FIX: Đây là chỗ gây lỗi 500 chính trong terminal của bạn
    static async findByUserId(userId) {
        const query = `
            SELECT 
                o.id, 
                o.order_date AS created_at, 
                o.total_amount, 
                o.status,
                t.table_number
            FROM orders o
            LEFT JOIN tables t ON o.table_id = t.id
            WHERE o.user_id = ?
            ORDER BY o.order_date DESC
        `;
        const [rows] = await pool.execute(query, [userId]);
        return rows;
    }
}

module.exports = Order;