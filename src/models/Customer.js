// project/src/models/Customer.js
const { pool } = require('../../config/database');

class Customer {
    // 1. Lấy danh sách khách hàng kèm hạng thành viên và điểm
    // FIX: LEFT JOIN customers thay vì INNER JOIN
    // Lý do: Nếu user vừa đăng ký chưa có record trong customers (chưa đặt món lần nào)
    // INNER JOIN sẽ làm họ "biến mất" khỏi danh sách
    static async findAll() {
        const query = `
            SELECT 
                u.id, u.name, u.email, u.phone_number, u.status,
                c.address,
                IFNULL(m.membership_level, 'none') as membership_level,
                IFNULL(SUM(mp.current_points), 0) as total_points
            FROM users u
            LEFT JOIN customers c ON u.id = c.user_id
            LEFT JOIN members m ON c.id = m.customer_id
            LEFT JOIN member_points mp ON c.id = mp.customer_id
            WHERE u.role = 'customer'
            GROUP BY u.id
            ORDER BY total_points DESC
        `;
        const [rows] = await pool.execute(query);
        return rows;
    }

    // 2. Lấy chi tiết 1 khách hàng theo user_id
    // FIX: LEFT JOIN customers — tránh crash nếu chưa có customer record
    static async findById(userId) {
        const query = `
            SELECT 
                u.id, u.name, u.email, u.phone_number, u.status, u.created_at,
                c.address,
                IFNULL(m.membership_level, 'none') as membership_level
            FROM users u
            LEFT JOIN customers c ON u.id = c.user_id
            LEFT JOIN members m ON c.id = m.customer_id
            WHERE u.id = ?
        `;
        const [rows] = await pool.execute(query, [userId]);
        return rows[0];
    }
}

module.exports = Customer;

// ============================================================
// ⚠️ LƯU Ý QUAN TRỌNG CHO auth.controller.js:
// Hiện tại khi register, chỉ INSERT vào bảng users.
// Cần bổ sung INSERT vào bảng customers ngay sau đó để:
//   1. Customer.findAll() hiển thị đúng
//   2. addMemberPoints() trong admin.controller tìm được customer_id
//
// Thêm vào auth.controller.js sau dòng User.create():
//   await pool.execute(
//       'INSERT INTO customers (user_id) VALUES (?)',
//       [userId]
//   );
// ============================================================