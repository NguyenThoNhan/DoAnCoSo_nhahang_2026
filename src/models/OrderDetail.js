// project/src/models/OrderDetail.js
const { pool } = require('../../config/database');

class OrderDetail {
    // [C] Chèn chi tiết đơn hàng
    // Yêu cầu: Bắt buộc chạy trong transaction
    static async create(orderId, foodId, quantity, priceAtOrder, itemName, connection) {
        const [result] = await connection.execute(
            'INSERT INTO order_items (order_id, food_id, quantity, price_at_order, item_name) VALUES (?, ?, ?, ?, ?)',
            [orderId, foodId, quantity, priceAtOrder, itemName]
        );
        return result.insertId;
    }

    // [R] Lấy chi tiết các món ăn trong đơn hàng
    static async findByOrderId(orderId) {
        const [rows] = await pool.execute(
            'SELECT * FROM order_items WHERE order_id = ?',
            [orderId]
        );
        return rows;
    }
}

module.exports = OrderDetail;