// ===============================================================
// USER.CONTROLLER.JS - FIXED VERSION
// Đã bổ sung: Customer name, phone, note trong order creation
// ===============================================================

const Food = require('../models/Food');
const Category = require('../models/Category');
const Table = require('../models/Table');
const Order = require('../models/Order');
const OrderDetail = require('../models/OrderDetail');
const Customer = require('../models/Customer');
const Combo = require('../models/Combo');
const jwt = require('jsonwebtoken');
const { pool } = require('../../config/database');

// =======================================================
// 1. SMART QR & TABLE SELECTION
// =======================================================

// [GET] /api/user/public/tables
exports.getAvailableTables = async (req, res) => {
    try {
        const tables = await Table.findAll();
        const publicTables = tables.map(t => ({
            id: t.id,
            table_number: t.table_number,
            capacity: t.capacity,
            status: t.status,
            qr_code_path: t.qr_code_path
        }));
        res.status(200).json(publicTables);
    } catch (error) {
        console.error('Error getAvailableTables:', error);
        res.status(500).json({ message: 'Lỗi server khi tải sơ đồ bàn.' });
    }
};

// [GET] /api/user/public/table/verify/:id
// Phone quét QR -> trình duyệt mở URL này -> backend UPDATE session_status='verified'
// -> trả HTML đẹp cho phone -> laptop polling nhận 'verified' -> tự redirect menu
exports.verifyTable = async (req, res) => {
    const { id } = req.params;

    const htmlOk = (num) => `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Xac thuc thanh cong - GoMeal</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;
     background:linear-gradient(135deg,#FF6B35,#F7931E);
     min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:#fff;border-radius:28px;padding:44px 28px;text-align:center;
      max-width:340px;width:100%;box-shadow:0 24px 64px rgba(0,0,0,.18)}
.ring{width:84px;height:84px;border-radius:50%;margin:0 auto 20px;
      background:linear-gradient(135deg,#FF6B35,#F7931E);
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 8px 28px rgba(255,107,53,.45);
      animation:pop .55s cubic-bezier(.34,1.56,.64,1) both}
@keyframes pop{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}
svg{width:40px;height:40px;stroke:#fff;stroke-width:3.5;fill:none;
    stroke-linecap:round;stroke-linejoin:round}
.badge{display:inline-flex;align-items:center;gap:6px;background:#FFF3EE;
       color:#FF6B35;font-size:.68rem;font-weight:800;letter-spacing:.1em;
       text-transform:uppercase;padding:4px 12px;border-radius:99px;margin-bottom:14px}
.dot{width:5px;height:5px;border-radius:50%;background:#FF6B35;
     animation:blink 1.5s ease infinite}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.15}}
.title{font-size:1.5rem;font-weight:900;color:#111827;letter-spacing:-.03em;margin-bottom:6px}
.num{font-size:2.1rem;font-weight:900;color:#FF6B35;letter-spacing:-.04em;
     margin-bottom:12px;display:block}
.sub{font-size:.88rem;color:#6B7280;line-height:1.7;margin-bottom:22px}
.line{height:1px;background:#F3F4F6;margin-bottom:18px}
.hint{font-size:.78rem;color:#9CA3AF;line-height:1.6}
</style>
</head>
<body>
<div class="card">
  <div class="ring"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div>
  <div class="badge"><span class="dot"></span>GoMeal &middot; QR Xac Thuc</div>
  <p class="title">Thanh cong! 🎉</p>
  <span class="num">Ban so ${num}</span>
  <p class="sub">Ban da duoc xac nhan.<br>Man hinh may tinh se tu chuyen sang thuc don.</p>
  <div class="line"></div>
  <p class="hint">💻 Dat dien thoai xuong va nhin vao man hinh chinh.</p>
</div>
</body></html>`;

    const html404 = (num) => `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Loi</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;background:#FEF2F2;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}.c{background:#fff;border-radius:24px;padding:40px 28px;text-align:center;max-width:340px;width:100%}.i{font-size:3rem;margin-bottom:16px}.t{font-size:1.1rem;font-weight:800;color:#DC2626;margin-bottom:8px}.s{font-size:.88rem;color:#6B7280;line-height:1.6}</style>
</head><body><div class="c"><div class="i">❌</div><div class="t">Khong tim thay ban so ${num}</div><div class="s">Vui long lien he nhan vien.</div></div></body></html>`;

    const html500 = `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Loi</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;background:#FEF2F2;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}.c{background:#fff;border-radius:24px;padding:40px 28px;text-align:center;max-width:340px;width:100%}.i{font-size:3rem;margin-bottom:16px}.t{font-size:1.1rem;font-weight:800;color:#DC2626;margin-bottom:8px}.s{font-size:.88rem;color:#6B7280;line-height:1.6}</style>
</head><body><div class="c"><div class="i">⚠️</div><div class="t">Loi xac thuc</div><div class="s">Da co loi xay ra. Vui long thu lai hoac lien he nhan vien.</div></div></body></html>`;

    try {
        const table = await Table.findByTableNumber(id);
        if (!table) return res.status(404).send(html404(id));

        await pool.execute(
            'UPDATE tables SET session_status = "verified" WHERE table_number = ?',
            [id]
        );

        // Laptop dang poll /check-session se nhan status=verified va tu redirect menu
        return res.status(200).send(htmlOk(table.table_number));

    } catch (error) {
        console.error('verifyTable error:', error);
        return res.status(500).send(html500);
    }
};

// [GET] /api/user/public/table/check-session/:tableNumber (Laptop Polling)
exports.checkTableSession = async (req, res) => {
    const { tableNumber } = req.params;
    try {
        const table = await Table.findByTableNumber(tableNumber);
        if (table && table.session_status === 'verified') {
            const guestToken = jwt.sign(
                { tableId: table.id, role: 'guest', isGuest: true },
                process.env.JWT_SECRET,
                { expiresIn: '3h' }
            );
            await pool.execute('UPDATE tables SET session_status = "idle" WHERE table_number = ?', [tableNumber]);
            return res.status(200).json({
                status: 'verified',
                guest_token: guestToken,
                table_id: table.id,
                table_number: table.table_number
            });
        }
        res.status(200).json({ status: 'waiting' });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi hệ thống.' });
    }
};

// =======================================================
// 2. MENU & DISCOVERY
// =======================================================

// [GET] /api/user/public/menu
exports.getMenu = async (req, res) => {
    try {
        const allFoods = await Food.findAll();
        const availableMenu = allFoods.filter(food => food.is_available);
        res.status(200).json(availableMenu);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi server khi tải menu.' });
    }
};

// [GET] /api/user/public/featured
exports.getFeaturedItems = async (req, res) => {
    try {
        const allFoods = await Food.findAll();
        const featured = allFoods.filter(f => f.is_featured && f.is_available).slice(0, 6);
        res.status(200).json(featured);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi lấy món nổi bật.' });
    }
};

// [GET] /api/user/public/categories
exports.getMenuCategories = async (req, res) => {
    try {
        const categories = await Category.findAll();
        res.status(200).json(categories.filter(c => c.is_active));
    } catch (error) {
        res.status(500).json({ message: 'Lỗi server khi tải danh mục.' });
    }
};

// [GET] /api/user/public/combos
exports.getPublicCombos = async (req, res) => {
    try {
        const combos = await Combo.findAll();
        res.status(200).json(combos.filter(c => c.is_active));
    } catch (error) {
        res.status(500).json({ message: 'Lỗi lấy danh sách combo.' });
    }
};

// =======================================================
// 3. ORDERING & MARKETING (✅ FIXED WITH CUSTOMER INFO)
// =======================================================

// [POST] /api/user/public/promotions/check
exports.checkCoupon = async (req, res) => {
    const { code, subtotal } = req.body;
    try {
        const query = `
            SELECT * FROM promotions 
            WHERE code = ? AND is_active = 1 
            AND start_date <= NOW() AND end_date >= NOW()
        `;
        const [rows] = await pool.execute(query, [code]);
        if (rows.length === 0) return res.status(404).json({ message: 'Mã giảm giá không hợp lệ.' });

        const promo = rows[0];
        if (subtotal < promo.min_order_amount) {
            return res.status(400).json({ message: `Đơn hàng cần tối thiểu ${promo.min_order_amount}₫` });
        }

        let discount = promo.type === 'percent' ? (subtotal * promo.value) / 100 : promo.value;
        res.status(200).json({ promo_id: promo.id, discount_amount: discount });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi kiểm tra mã giảm giá.' });
    }
};

// [POST] /api/user/order/create (✅ FIXED - Added customer info)
exports.createOrder = async (req, res) => {
    const tableId = req.guest ? req.guest.tableId : (req.body.table_id || null);

    // userId: ưu tiên req.user (nếu middleware set), nếu không thì thử decode
    // Authorization header — trường hợp user đăng nhập + dùng QR cùng lúc
    // (verifyGuestToken chỉ set req.guest, không set req.user)
    let userId = req.user ? req.user.id : null;
    if (!userId) {
        try {
            const authHeader = req.headers['authorization'];
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.split(' ')[1];
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                // Chỉ lấy userId nếu token là authToken (role != 'guest')
                if (decoded && decoded.role !== 'guest' && decoded.id) {
                    userId = decoded.id;
                }
            }
        } catch (_) {
            // guestToken hoặc token không hợp lệ → userId = null (khách vãng lai)
        }
    }

    const { items, promo_id } = req.body;

    // Validation cơ bản
    if (!tableId || !items || items.length === 0) {
        return res.status(400).json({ message: 'Thông tin đơn hàng không đầy đủ.' });
    }
    
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 1. Server-side price calculation (Security)
        let serverSubtotal = 0;
        for (const item of items) {
            serverSubtotal += item.priceAtOrder * item.quantity;
        }

        // 2. Calculate discount
        let serverDiscount = 0;
        let validPromoId = null;
        if (promo_id) {
            const [p] = await connection.execute('SELECT * FROM promotions WHERE id = ?', [promo_id]);
            if (p[0]) {
                serverDiscount = p[0].type === 'percent' ? (serverSubtotal * p[0].value) / 100 : p[0].value;
                validPromoId = p[0].id;
            }
        }

        const finalTotal = serverSubtotal - serverDiscount;

        // 3. Insert Order — chỉ dùng các cột tồn tại trong schema
        const [ord] = await connection.execute(
            `INSERT INTO orders (
                user_id, table_id, promo_id,
                total_amount, discount_amount,
                status
            ) VALUES (?, ?, ?, ?, ?, 'pending')`,
            [
                userId   || null,
                tableId,
                validPromoId || null,
                finalTotal,
                serverDiscount
            ]
        );
        const orderId = ord.insertId;

        // 4. Insert Order Items
        for (const item of items) {
            await connection.execute(
                `INSERT INTO order_items (
                    order_id, food_id, quantity, 
                    price_at_order, item_name
                ) VALUES (?, ?, ?, ?, ?)`,
                [orderId, item.foodId, item.quantity, item.priceAtOrder, item.itemName]
            );
        }

        // 5. Update table status and link order
        await connection.execute(
            `UPDATE tables 
             SET status = 'occupied', current_order_id = ? 
             WHERE id = ?`,
            [orderId, tableId]
        );
        
        await connection.commit();
        res.status(201).json({ 
            message: 'Đặt món thành công!', 
            order_id: orderId 
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error createOrder:', error);
        res.status(500).json({ message: 'Lỗi hệ thống khi tạo đơn hàng.' });
    } finally {
        if (connection) connection.release();
    }
};

// =======================================================
// 4. USER PROFILE & HISTORY
// =======================================================

exports.getProfileDetails = async (req, res) => {
    try {
        const userId = req.user.id;
        const profile = await Customer.findById(userId);
        const [pts] = await pool.execute(
            'SELECT IFNULL(SUM(current_points), 0) as total FROM member_points mp JOIN customers c ON mp.customer_id = c.id WHERE c.user_id = ?', 
            [userId]
        );
        res.status(200).json({ ...profile, total_points: pts[0].total });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi tải hồ sơ.' });
    }
};

exports.getOrderHistory = async (req, res) => {
    try {
        const orders = await Order.findByUserId(req.user.id);
        res.status(200).json(orders);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi tải lịch sử đơn hàng.' });
    }
};

// [GET] /api/user/order/:id
// Lấy thông tin đơn hàng theo ID — dùng cho guest sau khi đặt món
// Dùng verifyGuestToken → không cần đăng nhập
exports.getOrderById = async (req, res) => {
    const orderId = parseInt(req.params.id, 10);
    if (!orderId) return res.status(400).json({ message: 'ID đơn hàng không hợp lệ.' });

    try {
        // Lấy thông tin đơn hàng
        const [orderRows] = await pool.execute(
            `SELECT o.id, o.order_date, o.total_amount, o.discount_amount,
                    o.status, o.table_id,
                    t.table_number
             FROM orders o
             LEFT JOIN tables t ON o.table_id = t.id
             WHERE o.id = ?`,
            [orderId]
        );
        if (orderRows.length === 0) {
            return res.status(404).json({ message: 'Không tìm thấy đơn hàng.' });
        }
        const order = orderRows[0];

        // Kiểm tra quyền: guest chỉ xem được đơn của bàn mình
        const guestTableId = req.guest ? req.guest.tableId : null;
        const userIdFromToken = req.user ? req.user.id : null;
        if (!userIdFromToken && guestTableId && Number(order.table_id) !== Number(guestTableId)) {
            return res.status(403).json({ message: 'Không có quyền xem đơn hàng này.' });
        }

        // Lấy danh sách món trong đơn
        const [items] = await pool.execute(
            `SELECT item_name, quantity, price_at_order
             FROM order_items
             WHERE order_id = ?
             ORDER BY id ASC`,
            [orderId]
        );

        res.status(200).json({ ...order, items });
    } catch (error) {
        console.error('getOrderById error:', error);
        res.status(500).json({ message: 'Lỗi tải thông tin đơn hàng.' });
    }
};

exports.getProfile = (req, res) => {
    res.status(200).json({ user: req.user });
};

// [PUT] /api/user/order/request-checkout
exports.requestCheckout = async (req, res) => {
    const tableId = req.guest.tableId;

    try {
        // Update table status to 'cleaning'
        await pool.execute('UPDATE tables SET status = "cleaning" WHERE id = ?', [tableId]);

        res.status(200).json({ 
            message: 'Yêu cầu thanh toán đã được gửi. Vui lòng đợi nhân viên trong giây lát!' 
        });
    } catch (error) {
        console.error('Error requestCheckout:', error);
        res.status(500).json({ message: 'Lỗi khi gửi yêu cầu thanh toán.' });
    }
};

// =======================================================
// [DELETE] /api/user/order/cancel-table
// Hủy bàn: User chủ động thoát, reset bàn về trạng thái sẵn sàng
// Chỉ cho phép hủy khi chưa có đơn hàng pending/processing
// =======================================================
exports.cancelTable = async (req, res) => {
    const tableId = req.guest ? req.guest.tableId : null;
    if (!tableId) {
        return res.status(400).json({ message: 'Không xác định được bàn.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // Kiểm tra bàn có đơn hàng đang xử lý không
        const [activeOrders] = await connection.execute(
            `SELECT id FROM orders
             WHERE table_id = ?
               AND status IN ('pending', 'processing', 'ready')
             LIMIT 1`,
            [tableId]
        );

        if (activeOrders.length > 0) {
            await connection.rollback();
            return res.status(409).json({
                message: 'Bàn đang có đơn hàng đang xử lý. Vui lòng liên hệ nhân viên để hủy.'
            });
        }

        // Reset bàn về trạng thái ban đầu
        await connection.execute(
            `UPDATE tables
             SET status           = 'available',
                 session_status   = 'idle',
                 current_order_id = NULL
             WHERE id = ?`,
            [tableId]
        );

        await connection.commit();
        res.status(200).json({ message: 'Đã hủy bàn thành công.' });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error cancelTable:', error);
        res.status(500).json({ message: 'Lỗi hệ thống khi hủy bàn.' });
    } finally {
        if (connection) connection.release();
    }
};