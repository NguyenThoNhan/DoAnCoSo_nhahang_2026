// project/src/middlewares/auth.middleware.js
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET; // Lấy từ .env

// Middleware 1: Xác thực Token (Kiểm tra xem người dùng có đăng nhập không)
exports.verifyToken = (req, res, next) => {
    // 1. Lấy token từ Header (Thường là Authorization: Bearer <token>)
    const authHeader = req.headers['authorization'];
    
    // Kiểm tra xem header có tồn tại và bắt đầu bằng 'Bearer ' không
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ 
            message: 'Truy cập bị từ chối. Không tìm thấy token xác thực.' 
        });
    }

    const token = authHeader.split(' ')[1]; // Lấy phần token sau "Bearer "

    try {
        // 2. Xác thực token
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // 3. Gắn payload (user info) vào request để các controller sau sử dụng
        req.user = decoded; 
        
        next(); // Chuyển sang middleware/controller tiếp theo
    } catch (error) {
        // Token không hợp lệ (hết hạn, bị thay đổi,...)
        return res.status(403).json({ 
            message: 'Token không hợp lệ hoặc đã hết hạn.' 
        });
    }
};


// Middleware 2: Kiểm tra vai trò Admin
exports.isAdmin = (req, res, next) => {
    // Phải chạy sau verifyToken, vì req.user đã có dữ liệu
    if (req.user && req.user.role === 'admin') {
        next(); // Là Admin, cho phép đi tiếp
    } else {
        return res.status(403).json({ 
            message: 'Truy cập bị từ chối. Bạn không có quyền Admin.' 
        });
    }
};

// Middleware 3: Kiểm tra vai trò Customer (User thông thường)
exports.isCustomer = (req, res, next) => {
    // Phải chạy sau verifyToken
    if (req.user && req.user.role === 'customer') {
        next(); // Là Customer, cho phép đi tiếp
    } else {
        return res.status(403).json({ 
            message: 'Truy cập bị từ chối. Bạn không phải là khách hàng.' 
        });
    }
};

// Middleware 4: Xác thực Guest Token (cho khách vãng lai)
exports.verifyGuestToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Lỗi xác thực: Không tìm thấy Guest Token.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        if (decoded.role !== 'guest' || !decoded.tableId) {
             return res.status(403).json({ message: 'Token không phải là Guest Token hợp lệ.' });
        }
        
        req.guest = decoded; // Gắn thông tin guest vào request
        next();
    } catch (error) {
        return res.status(403).json({ message: 'Guest Token không hợp lệ hoặc đã hết hạn.' });
    }
};
// Middleware 5: Linh hoạt — chấp nhận EITHER Guest Token (khách vãng lai) HOẶC Auth Token (member)
// Dùng cho createOrder: cả guest lẫn member đều có thể đặt hàng
// - Guest token: { role:'guest', tableId, isGuest:true } → req.guest
// - Auth token:  { id, email, role:'customer' }          → req.user
// Nếu không có token nào hợp lệ → 401
exports.verifyGuestOrUser = (req, res, next) => {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Cần xác thực để đặt hàng.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        if (decoded.role === 'guest' && decoded.tableId) {
            // Khách vãng lai — gắn vào req.guest
            req.guest = decoded;
            return next();
        }

        if (decoded.role === 'customer' && decoded.id) {
            // Member đã đăng nhập — gắn vào req.user
            // Member cần gửi kèm table_id trong req.body
            req.user = decoded;
            return next();
        }

        return res.status(403).json({ message: 'Token không hợp lệ để đặt hàng.' });
    } catch (error) {
        return res.status(403).json({ message: 'Token hết hạn hoặc không hợp lệ.' });
    }
};