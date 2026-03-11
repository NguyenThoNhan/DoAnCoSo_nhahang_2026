// =============================================================
// src/controllers/admin.controller.js
// Phiên bản: FINAL — Đã sửa lỗi + chuẩn hoá toàn bộ
// =============================================================

'use strict';

const path    = require('path');
const fs      = require('fs');
const bcrypt  = require('bcryptjs');
const QRCode  = require('qrcode');
const os      = require('os');

const Category   = require('../models/Category');
const Food       = require('../models/Food');
const Table      = require('../models/Table');
const Staff      = require('../models/Staff');
const Customer   = require('../models/Customer');
const Combo      = require('../models/Combo');
const Ingredient = require('../models/Ingredient');
const FoodRecipe = require('../models/FoodRecipe');
const Inventory  = require('../models/Inventory');
const { pool }   = require('../../config/database');

// =============================================================
// HELPERS
// =============================================================

/**
 * Trả về địa chỉ IPv4 nội bộ của máy chủ.
 * @returns {string}
 */
const getLocalIP = () => {
    const interfaces = os.networkInterfaces();
    for (const devName of Object.keys(interfaces)) {
        for (const alias of interfaces[devName]) {
            if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
                return alias.address;
            }
        }
    }
    return 'localhost';
};

/**
 * Cộng điểm thành viên cho khách hàng sau khi đơn hàng hoàn tất.
 * Tỷ lệ: 1 điểm / 1.000 VND.
 * @param {object} connection - MySQL connection (trong transaction)
 * @param {number|null} userId
 * @param {number} totalAmount
 */
const addMemberPoints = async (connection, userId, totalAmount) => {
    if (!userId) return;
    const [customerRows] = await connection.execute(
        'SELECT id FROM customers WHERE user_id = ?',
        [userId]
    );
    if (customerRows.length === 0) return;
    const customerId   = customerRows[0].id;
    const earnedPoints = Math.floor(totalAmount / 1000);
    if (earnedPoints <= 0) return;
    await connection.execute(
        `INSERT INTO member_points (customer_id, current_points, total_earned)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           current_points = current_points + VALUES(current_points),
           total_earned   = total_earned   + VALUES(total_earned)`,
        [customerId, earnedPoints, earnedPoints]
    );
};

/**
 * Trừ tồn kho nguyên liệu sau khi đơn hàng hoàn tất
 * và tự động ẩn các món liên quan nếu nguyên liệu về 0.
 * Sử dụng chung logic trong Inventory model để đảm bảo nhất quán.
 * @param {object} connection - MySQL connection (trong transaction)
 * @param {number} orderId
 */
const deductInventory = async (connection, orderId) => {
    const [items] = await connection.execute(
        'SELECT food_id, quantity FROM order_items WHERE order_id = ?',
        [orderId]
    );
    for (const item of items) {
        // Giao cho Inventory xử lý trừ kho + auto-disable món khi nguyên liệu hết
        await Inventory.deductStock(item.food_id, item.quantity, connection);
    }
};

// =============================================================
// I. DANH MỤC (Categories)
// =============================================================

exports.getCategories = async (req, res) => {
    try {
        const categories = await Category.findAll();
        res.status(200).json(categories);
    } catch (error) {
        console.error('getCategories error:', error);
        res.status(500).json({ message: 'Lỗi lấy danh mục.' });
    }
};

exports.createCategory = async (req, res) => {
    const { name, description, image_url } = req.body;
    if (!name) return res.status(400).json({ message: 'Tên danh mục là bắt buộc.' });
    try {
        const newId = await Category.create(name, description, image_url);
        res.status(201).json({ message: 'Tạo danh mục thành công.', id: newId });
    } catch (error) {
        console.error('createCategory error:', error);
        res.status(500).json({ message: 'Lỗi tạo danh mục.' });
    }
};

exports.updateCategory = async (req, res) => {
    const { id } = req.params;
    const { name, description, image_url, is_active } = req.body;
    try {
        const affected = await Category.update(id, name, description, image_url, is_active);
        if (affected === 0) return res.status(404).json({ message: 'Không tìm thấy danh mục.' });
        res.status(200).json({ message: 'Cập nhật danh mục thành công.' });
    } catch (error) {
        console.error('updateCategory error:', error);
        res.status(500).json({ message: 'Lỗi cập nhật danh mục.' });
    }
};

exports.deleteCategory = async (req, res) => {
    try {
        await Category.delete(req.params.id);
        res.status(200).json({ message: 'Xóa danh mục thành công.' });
    } catch (error) {
        console.error('deleteCategory error:', error);
        res.status(500).json({ message: 'Lỗi xóa danh mục (Có thể đang chứa món ăn).' });
    }
};

// =============================================================
// II. MÓN ĂN (Foods)
// =============================================================

exports.getFoods = async (req, res) => {
    try {
        const foods = await Food.findAll();
        res.status(200).json(foods);
    } catch (error) {
        console.error('getFoods error:', error);
        res.status(500).json({ message: 'Lỗi lấy danh sách món ăn.' });
    }
};

exports.createFood = async (req, res) => {
    const { category_id, name, description, price, is_featured, image_url } = req.body;
    if (!name || !category_id || !price) {
        return res.status(400).json({ message: 'Tên, danh mục và giá là bắt buộc.' });
    }
    try {
        // Sanitize: undefined → null/default để tránh MySQL2 crash
        const safeDesc      = description      ?? null;
        const safeImageUrl  = image_url        ?? null;
        const safeIsFeatured = is_featured !== undefined ? Number(is_featured) : 0;
        const newId = await Food.create(category_id, name, safeDesc, price, safeIsFeatured, safeImageUrl);
        res.status(201).json({ message: 'Tạo món ăn thành công.', id: newId, image_url: safeImageUrl });
    } catch (error) {
        console.error('createFood error:', error);
        res.status(500).json({ message: 'Lỗi tạo món ăn.' });
    }
};

exports.updateFood = async (req, res) => {
    const { id } = req.params;
    const { category_id, name, description, price, is_available, is_featured, image_url: newImageUrl } = req.body;
    try {
        const currentFood = await Food.findById(id);
        if (!currentFood) return res.status(404).json({ message: 'Không tìm thấy món ăn.' });
        // Giữ giá trị cũ nếu không gửi lên
        const finalImageUrl  = newImageUrl   ?? currentFood.image_url;
        const finalAvail     = is_available  !== undefined ? Number(is_available)  : currentFood.is_available;
        const finalFeatured  = is_featured   !== undefined ? Number(is_featured)   : currentFood.is_featured;
        const finalCatId     = category_id   ?? currentFood.category_id;
        const finalName      = name          ?? currentFood.name;
        const finalDesc      = description   ?? currentFood.description;
        const finalPrice     = price         ?? currentFood.price;
        await Food.update(id, finalCatId, finalName, finalDesc, finalPrice, finalAvail, finalFeatured, finalImageUrl);
        res.status(200).json({ message: 'Cập nhật món ăn thành công.' });
    } catch (error) {
        console.error('updateFood error:', error);
        res.status(500).json({ message: 'Lỗi cập nhật món ăn.' });
    }
};

exports.deleteFood = async (req, res) => {
    try {
        await Food.delete(req.params.id);
        res.status(200).json({ message: 'Đã xóa món ăn.' });
    } catch (error) {
        console.error('deleteFood error:', error);
        res.status(500).json({ message: 'Lỗi xóa món ăn.' });
    }
};

exports.updateFoodAvailability = async (req, res) => {
    const { id } = req.params;
    const { is_available } = req.body;
    if (is_available === undefined) {
        return res.status(400).json({ message: 'Trường is_available là bắt buộc.' });
    }
    try {
        await Food.updateAvailability(id, is_available);
        res.status(200).json({ message: 'Cập nhật trạng thái món ăn thành công.' });
    } catch (error) {
        console.error('updateFoodAvailability error:', error);
        res.status(500).json({ message: 'Lỗi cập nhật trạng thái.' });
    }
};

// =============================================================
// III. ĐƠN HÀNG (Orders)
// =============================================================

/** Query dùng chung để lấy thông tin đơn hàng.
 *  Chỉ SELECT đúng các column tồn tại trong DB schema:
 *  orders: id, user_id, table_id, promo_id, total_amount, discount_amount, status, order_date
 *  tables: id, table_number, capacity, status, session_status
 *  users:  id, name, phone_number, email, role
 *
 *  KHÔNG có: completed_at, note, customer_name, customer_phone (trong bảng orders)
 *  Khách vãng lai (user_id = NULL) → u.name / u.phone_number = NULL — bình thường.
 */
const ORDER_SELECT = `
    SELECT
        o.id,
        o.order_date,
        o.total_amount,
        COALESCE(o.discount_amount, 0)  AS discount_amount,
        o.status,
        o.payment_method,
        o.cashier_id,
        t.table_number,
        t.status                        AS table_status,
        u.name                          AS customer_name,
        u.phone_number                  AS customer_phone
    FROM orders o
    LEFT JOIN tables t ON o.table_id = t.id
    LEFT JOIN users  u ON o.user_id  = u.id
`;

exports.getOrders = async (req, res) => {
    try {
        const [orders] = await pool.execute(`${ORDER_SELECT} ORDER BY o.order_date DESC`);
        for (const order of orders) {
            const [items] = await pool.execute(
                'SELECT * FROM order_items WHERE order_id = ?',
                [order.id]
            );
            order.items = items;
        }
        res.status(200).json(orders);
    } catch (error) {
        console.error('getOrders error:', error);
        res.status(500).json({ message: 'Lỗi tải danh sách đơn hàng.' });
    }
};

exports.getOrderDetails = async (req, res) => {
    try {
        const [orderRows] = await pool.execute(
            `${ORDER_SELECT} WHERE o.id = ?`,
            [req.params.id]
        );
        if (orderRows.length === 0) {
            return res.status(404).json({ message: 'Không tìm thấy đơn hàng.' });
        }
        const [items] = await pool.execute(
            'SELECT * FROM order_items WHERE order_id = ?',
            [req.params.id]
        );
        res.status(200).json({ ...orderRows[0], items });
    } catch (error) {
        console.error('getOrderDetails error:', error);
        res.status(500).json({ message: 'Lỗi lấy chi tiết đơn hàng.' });
    }
};

exports.updateOrderStatus = async (req, res) => {
    const { id }     = req.params;
    const { status } = req.body;
    const validStatuses = ['pending', 'processing', 'ready', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: `Trạng thái không hợp lệ. Cho phép: ${validStatuses.join(', ')}.` });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [orderRows] = await connection.execute(
            'SELECT user_id, table_id, total_amount FROM orders WHERE id = ?',
            [id]
        );
        if (orderRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Không tìm thấy đơn hàng.' });
        }

        const { user_id, table_id, total_amount } = orderRows[0];

        await connection.execute(
            `UPDATE orders SET status = ? WHERE id = ?`,
            [status, id]
        );

        if (status === 'completed') {
            await addMemberPoints(connection, user_id, total_amount);
            await deductInventory(connection, id);
            if (table_id) {
                await connection.execute(
                    `UPDATE tables
                     SET status           = 'available',
                         current_order_id = NULL,
                         session_status   = 'idle'
                     WHERE id = ?`,
                    [table_id]
                );
            }
        }

        await connection.commit();
        res.status(200).json({ message: 'Cập nhật trạng thái đơn hàng thành công.' });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('updateOrderStatus error:', error);
        res.status(500).json({ message: 'Lỗi cập nhật trạng thái.' });
    } finally {
        if (connection) connection.release();
    }
};

exports.completeOrderAndReleaseTable = async (req, res) => {
    const { id } = req.params;
    const paymentMethod = (req.body && req.body.payment_method) ? String(req.body.payment_method) : 'cash';
    const cashierId     = req.user && req.user.id ? req.user.id : null;
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [orderRows] = await connection.execute(
            'SELECT table_id, total_amount, user_id, status FROM orders WHERE id = ?',
            [id]
        );
        if (orderRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Không tìm thấy đơn hàng.' });
        }
        if (orderRows[0].status === 'completed') {
            await connection.rollback();
            return res.status(400).json({ message: 'Đơn hàng đã được hoàn tất trước đó.' });
        }

        const { table_id, total_amount, user_id } = orderRows[0];

        // Cập nhật trạng thái + lưu phương thức thanh toán (giả lập) + nhân viên thu ngân nếu DB hỗ trợ
        try {
            await connection.execute(
                `UPDATE orders 
                 SET status = 'completed',
                     payment_method = ?,
                     cashier_id     = ?
                 WHERE id = ?`,
                [paymentMethod, cashierId, id]
            );
        } catch (e) {
            // Nếu cột payment_method / cashier_id không tồn tại trong DB (môi trường demo),
            // fallback chỉ cập nhật status để tránh gãy hệ thống.
            await connection.execute(
                `UPDATE orders SET status = 'completed' WHERE id = ?`,
                [id]
            );
        }

        await addMemberPoints(connection, user_id, total_amount);
        await deductInventory(connection, id);

        if (table_id) {
            await connection.execute(
                `UPDATE tables
                 SET status           = 'available',
                     session_status   = 'idle',
                     current_order_id = NULL
                 WHERE id = ?`,
                [table_id]
            );
        }

        await connection.commit();
        res.status(200).json({ message: 'Đã hoàn tất đơn hàng và giải phóng bàn thành công.' });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('completeOrderAndReleaseTable error:', error);
        res.status(500).json({ message: 'Lỗi xử lý hệ thống.' });
    } finally {
        if (connection) connection.release();
    }
};

// =============================================================
// IV. BÀN (Tables)
// =============================================================

exports.getTables = async (req, res) => {
    try {
        const tables = await Table.findAll();
        res.status(200).json(tables);
    } catch (error) {
        console.error('getTables error:', error);
        res.status(500).json({ message: 'Lỗi tải danh sách bàn.' });
    }
};

exports.createTable = async (req, res) => {
    const { table_number, capacity } = req.body;
    if (!table_number || !capacity) {
        return res.status(400).json({ message: 'Số bàn và sức chứa là bắt buộc.' });
    }
    try {
        const tableId = await Table.create(table_number, capacity);

        const PORT    = process.env.PORT || 8080;
        const baseURL = `http://${getLocalIP()}:${PORT}`;

        const qrDir = path.join(__dirname, '../../uploads/qrcodes');
        if (!fs.existsSync(qrDir)) fs.mkdirSync(qrDir, { recursive: true });

        const qrFileName = `qr_table_${table_number}.png`;
        const qrFilePath = path.join(qrDir, qrFileName);
        // QR trỏ thẳng vào API verify — không cần file HTML trung gian
        // Phone quét → GET /api/user/public/table/verify/:id
        // → backend UPDATE session_status='verified' → trả HTML đẹp cho phone
        // → laptop polling (check-session) nhận verified → redirect menu
        const qrTargetURL = `${baseURL}/api/user/public/table/verify/${table_number}`;

        await QRCode.toFile(qrFilePath, qrTargetURL);

        const qrCodePath = `/uploads/qrcodes/qr_table_${table_number}.png`;
        await pool.execute(
            'UPDATE tables SET qr_code_path = ? WHERE id = ?',
            [qrCodePath, tableId]
        );

        res.status(201).json({ message: 'Tạo bàn thành công.', id: tableId, qr_code_path: qrCodePath });
    } catch (error) {
        console.error('createTable error:', error);
        res.status(500).json({ message: 'Lỗi tạo bàn.' });
    }
};

exports.updateTableStatus = async (req, res) => {
    const { id }     = req.params;
    const { status } = req.body;
    const validStatuses = ['available', 'occupied', 'reserved', 'maintenance'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: `Trạng thái không hợp lệ. Cho phép: ${validStatuses.join(', ')}.` });
    }
    try {
        await pool.execute('UPDATE tables SET status = ? WHERE id = ?', [status, id]);
        res.status(200).json({ message: 'Cập nhật trạng thái bàn thành công.' });
    } catch (error) {
        console.error('updateTableStatus error:', error);
        res.status(500).json({ message: 'Lỗi cập nhật trạng thái bàn.' });
    }
};

exports.releaseTable = async (req, res) => {
    const { id } = req.params;
    try {
        await pool.execute(
            `UPDATE tables
             SET status           = 'available',
                 session_status   = 'idle',
                 current_order_id = NULL
             WHERE id = ?`,
            [id]
        );
        res.status(200).json({ message: 'Bàn đã sẵn sàng phục vụ khách mới.' });
    } catch (error) {
        console.error('releaseTable error:', error);
        res.status(500).json({ message: 'Lỗi giải phóng bàn.' });
    }
};

exports.deleteTable = async (req, res) => {
    try {
        await Table.delete(req.params.id);
        res.status(200).json({ message: 'Xóa bàn thành công.' });
    } catch (error) {
        console.error('deleteTable error:', error);
        res.status(500).json({ message: 'Lỗi xóa bàn.' });
    }
};

// =============================================================
// V. NHÂN SỰ & KHÁCH HÀNG
// =============================================================

exports.getAllStaff = async (req, res) => {
    try {
        const list = await Staff.findAll();
        res.status(200).json(list);
    } catch (error) {
        console.error('getAllStaff error:', error);
        res.status(500).json({ message: 'Lỗi lấy danh sách nhân viên.' });
    }
};

exports.createStaff = async (req, res) => {
    const { name, email, password, phone_number, role_id, employee_code, hire_date, salary } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ message: 'Tên, email và mật khẩu là bắt buộc.' });
    }
    // MySQL2 không chấp nhận undefined — chuyển tất cả giá trị tuỳ chọn sang null
    const safePhone    = phone_number  ?? null;
    const safeRoleId   = role_id       ? Number(role_id) : null;
    const safeEmpCode  = employee_code ?? null;
    const safeHireDate = hire_date     ?? null;
    const safeSalary   = (salary !== undefined && salary !== '') ? Number(salary) : null;

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        const hashedPassword = await bcrypt.hash(password, 10);
        const [uRes] = await connection.execute(
            'INSERT INTO users (name, email, password, phone_number, role) VALUES (?, ?, ?, ?, ?)',
            [name, email, hashedPassword, safePhone, 'admin']
        );
        await Staff.create(uRes.insertId, safeRoleId, safeEmpCode, safeHireDate, safeSalary, connection);
        await connection.commit();
        res.status(201).json({ message: 'Tạo nhân viên thành công.' });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('createStaff error:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Email này đã được sử dụng.' });
        }
        res.status(500).json({ message: 'Lỗi tạo nhân viên.' });
    } finally {
        if (connection) connection.release();
    }
};

exports.getAllCustomers = async (req, res) => {
    try {
        const list = await Customer.findAll();
        res.status(200).json(list);
    } catch (error) {
        console.error('getAllCustomers error:', error);
        res.status(500).json({ message: 'Lỗi lấy danh sách khách hàng.' });
    }
};

// =============================================================
// VI. MARKETING — KHUYẾN MÃI & COMBO
// =============================================================

exports.getPromotions = async (req, res) => {
    try {
        // ORDER BY id DESC — promotions INSERT không set created_at nên không ORDER BY đó
        // để tránh lỗi "Unknown column 'created_at'" nếu schema chưa có column này.
        const [rows] = await pool.execute('SELECT * FROM promotions ORDER BY id DESC');
        res.status(200).json(rows);
    } catch (error) {
        console.error('getPromotions error:', error);
        res.status(500).json({ message: 'Lỗi lấy danh sách khuyến mãi.' });
    }
};

exports.createPromotion = async (req, res) => {
    const { code, type, value, min_order_amount, start_date, end_date } = req.body;
    if (!code || !type || !value || !start_date || !end_date) {
        return res.status(400).json({ message: 'Vui lòng điền đầy đủ thông tin mã giảm giá.' });
    }
    try {
        await pool.execute(
            `INSERT INTO promotions (code, type, value, min_order_amount, start_date, end_date)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [code, type, value, min_order_amount || 0, start_date, end_date]
        );
        res.status(201).json({ message: 'Tạo mã giảm giá thành công.' });
    } catch (error) {
        console.error('createPromotion error:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Mã giảm giá này đã tồn tại.' });
        }
        res.status(500).json({ message: 'Lỗi tạo khuyến mãi.' });
    }
};

exports.getCombos = async (req, res) => {
    try {
        const combos = await Combo.findAll();
        res.status(200).json(combos);
    } catch (error) {
        console.error('getCombos error:', error);
        res.status(500).json({ message: 'Lỗi lấy danh sách combo.' });
    }
};

exports.createCombo = async (req, res) => {
    const { name, description, price, food_ids } = req.body;
    if (!name || !price) {
        return res.status(400).json({ message: 'Tên và giá combo là bắt buộc.' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        await Combo.create(name, description, price, food_ids, connection);
        await connection.commit();
        res.status(201).json({ message: 'Tạo combo thành công.' });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('createCombo error:', error);
        res.status(500).json({ message: 'Lỗi tạo combo.' });
    } finally {
        if (connection) connection.release();
    }
};

// =============================================================
// VII. NGUYÊN LIỆU & CÔNG THỨC MÓN ĂN
// =============================================================

exports.getIngredients = async (req, res) => {
    try {
        const list = await Ingredient.findAll();
        res.status(200).json(list);
    } catch (error) {
        console.error('getIngredients error:', error);
        res.status(500).json({ message: 'Lỗi lấy danh sách nguyên liệu.' });
    }
};

exports.createIngredient = async (req, res) => {
    const { name, unit, stock_quantity, min_stock_level } = req.body;
    if (!name || !unit) {
        return res.status(400).json({ message: 'Tên và đơn vị nguyên liệu là bắt buộc.' });
    }
    try {
        const newId = await Ingredient.create(name, unit, stock_quantity || 0, min_stock_level || 0);
        res.status(201).json({ message: 'Thêm nguyên liệu thành công.', id: newId });
    } catch (error) {
        console.error('createIngredient error:', error);
        res.status(500).json({ message: 'Lỗi thêm nguyên liệu.' });
    }
};

exports.updateIngredient = async (req, res) => {
    const { id } = req.params;
    const { name, unit, stock_quantity, min_stock_level } = req.body;
    try {
        await Ingredient.update(id, name, unit, stock_quantity, min_stock_level);
        res.status(200).json({ message: 'Cập nhật nguyên liệu thành công.' });
    } catch (error) {
        console.error('updateIngredient error:', error);
        res.status(500).json({ message: 'Lỗi cập nhật nguyên liệu.' });
    }
};

exports.deleteIngredient = async (req, res) => {
    const { id } = req.params;
    try {
        await Ingredient.delete(id);
        res.status(200).json({ message: 'Xóa nguyên liệu thành công.' });
    } catch (error) {
        console.error('deleteIngredient error:', error);
        res.status(500).json({ message: 'Lỗi xóa nguyên liệu (Có thể đang được dùng trong công thức).' });
    }
};

exports.getFoodRecipe = async (req, res) => {
    try {
        const recipe = await FoodRecipe.findByFoodId(req.params.id);
        res.status(200).json(recipe);
    } catch (error) {
        console.error('getFoodRecipe error:', error);
        res.status(500).json({ message: 'Lỗi lấy công thức món ăn.' });
    }
};

exports.addIngredientToFood = async (req, res) => {
    const foodId = req.params.id;
    const { ingredient_id, quantity_required } = req.body;
    if (!ingredient_id || !quantity_required) {
        return res.status(400).json({ message: 'Nguyên liệu và định lượng là bắt buộc.' });
    }
    try {
        await FoodRecipe.addIngredient(foodId, ingredient_id, quantity_required);
        res.status(200).json({ message: 'Đã cập nhật công thức món ăn.' });
    } catch (error) {
        console.error('addIngredientToFood error:', error);
        res.status(500).json({ message: 'Lỗi cập nhật công thức.' });
    }
};

exports.removeIngredientFromFood = async (req, res) => {
    const { id, ingredientId } = req.params;
    try {
        await FoodRecipe.removeIngredient(id, ingredientId);
        res.status(200).json({ message: 'Đã xóa nguyên liệu khỏi công thức.' });
    } catch (error) {
        console.error('removeIngredientFromFood error:', error);
        res.status(500).json({ message: 'Lỗi xóa nguyên liệu khỏi công thức.' });
    }
};

// =============================================================
// VIII. CHATBOT — QUẢN LÝ TRI THỨC
// =============================================================

exports.getChatbotRules = async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM chatbot_rules ORDER BY id DESC');
        res.status(200).json(rows);
    } catch (error) {
        console.error('getChatbotRules error:', error);
        res.status(500).json({ message: 'Lỗi lấy tri thức Bot.' });
    }
};

exports.createChatbotRule = async (req, res) => {
    const { keywords, response } = req.body;
    if (!keywords || !response) {
        return res.status(400).json({ message: 'Keywords và Response là bắt buộc.' });
    }
    try {
        await pool.execute(
            'INSERT INTO chatbot_rules (keywords, response) VALUES (?, ?)',
            [keywords, response]
        );
        res.status(201).json({ message: 'Dạy Bot thành công.' });
    } catch (error) {
        console.error('createChatbotRule error:', error);
        res.status(500).json({ message: 'Lỗi dạy Bot.' });
    }
};

exports.updateChatbotRule = async (req, res) => {
    const { id } = req.params;
    const { keywords, response, is_active } = req.body;
    if (!keywords || !response) {
        return res.status(400).json({ message: 'Keywords và Response là bắt buộc.' });
    }
    try {
        await pool.execute(
            'UPDATE chatbot_rules SET keywords = ?, response = ?, is_active = ? WHERE id = ?',
            [keywords, response, is_active, id]
        );
        res.status(200).json({ message: 'Cập nhật tri thức Bot thành công.' });
    } catch (error) {
        console.error('updateChatbotRule error:', error);
        res.status(500).json({ message: 'Lỗi cập nhật Bot.' });
    }
};

exports.deleteChatbotRule = async (req, res) => {
    try {
        await pool.execute('DELETE FROM chatbot_rules WHERE id = ?', [req.params.id]);
        res.status(200).json({ message: 'Đã xóa quy tắc Bot.' });
    } catch (error) {
        console.error('deleteChatbotRule error:', error);
        res.status(500).json({ message: 'Lỗi xóa quy tắc Bot.' });
    }
};

// =============================================================
// IX. THỐNG KÊ & CÀI ĐẶT HỆ THỐNG
// =============================================================

exports.getDashboardStats = async (req, res) => {
    // Mỗi sub-query được bảo vệ bởi try/catch riêng với fallback value.
    // Điều này đảm bảo nếu 1 query thất bại (table chưa có data, column thiếu...)
    // các query còn lại vẫn chạy và endpoint trả 200 thay vì 500.

    // 1. Doanh thu hôm nay
    let revenueToday = 0;
    try {
        const [[rev]] = await pool.execute(
            `SELECT IFNULL(SUM(total_amount), 0) AS total
             FROM orders
             WHERE status = 'completed'
               AND DATE(order_date) = CURDATE()`
        );
        revenueToday = Number(rev.total) || 0;
    } catch (e) {
        console.error('getDashboardStats [revenueToday] error:', e.message);
    }

    // 2. Số đơn đang chờ
    let pendingCount = 0;
    try {
        const [[pend]] = await pool.execute(
            `SELECT COUNT(*) AS count FROM orders WHERE status = 'pending'`
        );
        pendingCount = Number(pend.count) || 0;
    } catch (e) {
        console.error('getDashboardStats [pendingCount] error:', e.message);
    }

    // 3. Số bàn đang có khách
    let occupiedTables = 0;
    try {
        const [[occ]] = await pool.execute(
            `SELECT COUNT(*) AS count FROM tables WHERE status = 'occupied'`
        );
        occupiedTables = Number(occ.count) || 0;
    } catch (e) {
        console.error('getDashboardStats [occupiedTables] error:', e.message);
    }

    // 4. Biểu đồ doanh thu 7 ngày gần nhất
    let revenueChart = [];
    try {
        const [chart] = await pool.execute(
            `SELECT DATE_FORMAT(order_date, '%d/%m') AS date,
                    SUM(total_amount)                 AS daily_revenue
             FROM orders
             WHERE status = 'completed'
             GROUP BY DATE(order_date)
             ORDER BY DATE(order_date) DESC
             LIMIT 7`
        );
        revenueChart = chart.reverse();
    } catch (e) {
        console.error('getDashboardStats [revenueChart] error:', e.message);
    }

    // 5. Top món bán chạy (order_items.item_name)
    let topSelling = [];
    try {
        const [top] = await pool.execute(
            `SELECT item_name, SUM(quantity) AS total_qty
             FROM order_items
             WHERE item_name IS NOT NULL AND item_name != ''
             GROUP BY item_name
             ORDER BY total_qty DESC
             LIMIT 5`
        );
        topSelling = top;
    } catch (e) {
        console.error('getDashboardStats [topSelling] error:', e.message);
    }

    // 6. Nguyên liệu sắp hết / dưới ngưỡng
    let lowStockIngredients = [];
    try {
        const [lowStock] = await pool.execute(
            `SELECT id, name, unit, stock_quantity, min_stock_level
             FROM ingredients
             WHERE stock_quantity <= min_stock_level
               AND min_stock_level > 0
             ORDER BY (stock_quantity / GREATEST(min_stock_level, 1)) ASC
             LIMIT 10`
        );
        lowStockIngredients = lowStock;
    } catch (e) {
        console.error('getDashboardStats [lowStock] error:', e.message);
    }

    // Luôn trả 200 kể cả khi có sub-query lỗi — frontend nhận được dữ liệu fallback
    res.status(200).json({
        cards: {
            revenueToday,
            pendingCount,
            occupiedTables
        },
        revenueChart,
        topSelling,
        lowStockIngredients
    });
};

exports.getSettings = async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM settings WHERE id = 1');
        if (rows.length === 0) return res.status(404).json({ message: 'Chưa có cài đặt.' });
        res.status(200).json(rows[0]);
    } catch (error) {
        console.error('getSettings error:', error);
        res.status(500).json({ message: 'Lỗi tải cài đặt.' });
    }
};

exports.updateSettings = async (req, res) => {
    const { restaurant_name, address, phone, email, opening_hours } = req.body;
    try {
        await pool.execute(
            `UPDATE settings
             SET restaurant_name = ?,
                 address         = ?,
                 phone           = ?,
                 email           = ?,
                 opening_hours   = ?
             WHERE id = 1`,
            [restaurant_name, address, phone, email, opening_hours]
        );
        res.status(200).json({ message: 'Cập nhật cài đặt thành công.' });
    } catch (error) {
        console.error('updateSettings error:', error);
        res.status(500).json({ message: 'Lỗi cập nhật cài đặt.' });
    }
};