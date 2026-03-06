// src/controllers/auth.controller.js

const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

// ─────────────────────────────────────────────
// HELPER: Tạo JWT token
// ─────────────────────────────────────────────
const generateToken = (user) => {
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: '1d' }
    );
};


// ─────────────────────────────────────────────
// [POST] /api/auth/register
// Body: { name, email, password }
//
// FIX: role trả về đúng là 'customer', không phải 'user'
// (File gốc trả role: 'user' → gây lỗi auth guard vì
//  common.js kiểm tra role === 'admin' | 'customer')
// ─────────────────────────────────────────────
exports.register = async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ message: 'Vui lòng điền đầy đủ thông tin.' });
    }

    // Validate email format cơ bản
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ message: 'Email không hợp lệ.' });
    }

    // Validate password tối thiểu 6 ký tự
    if (password.length < 6) {
        return res.status(400).json({ message: 'Mật khẩu phải có ít nhất 6 ký tự.' });
    }

    try {
        // 1. Kiểm tra email đã tồn tại chưa
        const existingUser = await User.findByEmail(email);
        if (existingUser) {
            return res.status(409).json({ message: 'Email này đã được sử dụng.' });
        }

        // 2. Hash mật khẩu
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 3. Tạo user với role mặc định 'customer'
        const userId = await User.create(name, email, hashedPassword, 'customer');

        // 4. Trả về — KHÔNG cấp token ngay, bắt buộc login sau đăng ký
        //    role trả về đúng là 'customer' ← FIX (file gốc trả 'user')
        return res.status(201).json({
            message: 'Đăng ký thành công! Vui lòng đăng nhập.',
            user: {
                id:    userId,
                name,
                email,
                role: 'customer',
            }
        });

    } catch (error) {
        console.error('Lỗi khi đăng ký:', error);
        return res.status(500).json({ message: 'Lỗi hệ thống.' });
    }
};


// ─────────────────────────────────────────────
// [POST] /api/auth/login
// Body: { email, password }
//
// Response: { message, token, user: { id, name, email, role } }
//
// Frontend (login.html) sẽ lưu:
//   localStorage.setItem('authToken', token)
//   localStorage.setItem('userRole',  user.role)   ← 'admin' | 'customer'
//   localStorage.setItem('adminInfo', JSON.stringify({ name, role, email }))
//     (chỉ khi role === 'admin', dùng bởi admin/layout.js _injectAdminInfo())
// ─────────────────────────────────────────────
exports.login = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Vui lòng nhập Email và Mật khẩu.' });
    }

    try {
        // 1. Tìm user theo email
        const user = await User.findByEmail(email);
        if (!user) {
            return res.status(401).json({ message: 'Sai Email hoặc Mật khẩu.' });
        }

        // 2. Kiểm tra mật khẩu
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Sai Email hoặc Mật khẩu.' });
        }

        // 3. Tạo JWT token (payload: { id, email, role })
        const token = generateToken(user);

        // 4. Trả về — role luôn là giá trị thực từ DB ('admin' | 'customer')
        return res.status(200).json({
            message: 'Đăng nhập thành công!',
            token,
            user: {
                id:    user.id,
                name:  user.name,
                email: user.email,
                role:  user.role,
            }
        });

    } catch (error) {
        console.error('Lỗi khi đăng nhập:', error);
        return res.status(500).json({ message: 'Lỗi hệ thống.' });
    }
};


// ─────────────────────────────────────────────
// [GET] /api/auth/verify
// Header: Authorization: Bearer <token>
//
// Dùng bởi login.html và register.html để kiểm tra
// token localStorage còn hợp lệ không trước khi
// auto-redirect (tránh bỏ qua trang login).
//
// Middleware verifyToken đã xác thực trước khi vào đây.
// Nếu token hết hạn / sai → verifyToken trả 401/403 ngay,
// handler này không bao giờ chạy.
// ─────────────────────────────────────────────
exports.verify = (req, res) => {
    return res.status(200).json({
        valid: true,
        user: {
            id:    req.user.id,
            email: req.user.email,
            role:  req.user.role,
        }
    });
};