const express = require('express');
const path = require('path');
const { checkDatabaseConnection } = require('./config/database'); 

// Import các định tuyến (Routes)
const authRoutes = require('./src/routes/auth.routes');
const adminRoutes = require('./src/routes/admin.routes');
const userRoutes = require('./src/routes/user.routes');

const app = express();

// Sử dụng Port từ file .env hoặc mặc định 8080
const PORT = process.env.PORT || 8080;

// =======================================================
// MIDDLEWARES CƠ BẢN
// =======================================================
// Cho phép đọc dữ liệu JSON (từ fetch API)
app.use(express.json({ limit: '50mb' })); 
// Cho phép đọc dữ liệu từ Form (urlencoded)
app.use(express.urlencoded({ extended: true, limit: '50mb' }));


// =======================================================
// PHỤC VỤ FILE TĨNH (STATIC FILES)
// =======================================================

// 1. Phục vụ thư mục HOME (Trang giới thiệu Landing Page) tại đường dẫn gốc "/"
// Điều này giúp index.html trong /home truy cập được css/js bằng đường dẫn tương đối
app.use(express.static(path.join(__dirname, 'home')));

// 2. Phục vụ thư mục PUBLIC (CSS, JS dùng chung, Assets của Admin/User)
app.use('/public', express.static(path.join(__dirname, 'public'))); 

// 3. Phục vụ thư mục UPLOADS (Quan trọng để hiển thị ảnh món ăn và mã QR)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 4. Phục vụ thư mục VIEWS (Cho phép trình duyệt truy cập trực tiếp các file .html)
app.use('/views', express.static(path.join(__dirname, 'views')));


// =======================================================
// ĐỊNH TUYẾN TRANG CHỦ (LANDING PAGE)
// =======================================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'home', 'index.html'));
});


// =======================================================
// TÍCH HỢP CÁC ROUTES API
// =======================================================

// Quản lý xác thực (Login/Register)
app.use('/api/auth', authRoutes); 

// Quản lý Admin (CRUD, Staff, Tables, Stats...) - Được bảo vệ bởi isAdmin
app.use('/api/admin', adminRoutes);

// Quản lý Khách hàng (Menu public, Order, Profile...)
app.use('/api/user', userRoutes);


// =======================================================
// XỬ LÝ LỖI (ERROR HANDLING)
// =======================================================

// Xử lý lỗi 404 cho API hoặc trang không tồn tại
app.use((req, res, next) => {
    if (req.accepts('json')) {
        return res.status(404).json({ message: "Lỗi 404: API Endpoint không tồn tại." });
    }
    res.status(404).send("Lỗi 404: Không tìm thấy tài nguyên yêu cầu.");
});


// =======================================================
// KẾT NỐI DATABASE VÀ KHỞI ĐỘNG SERVER
// =======================================================
checkDatabaseConnection()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`--------------------------------------------------`);
            console.log(`🚀 SERVER ĐANG CHẠY TẠI: http://localhost:${PORT}`);
            console.log(`📂 Trang chủ: http://localhost:${PORT}`);
            console.log(`📂 Admin: http://localhost:${PORT}/views/admin/index.html`);
            console.log(`--------------------------------------------------`);
        });
    })
    .catch(err => {
        console.error("❌ KHÔNG THỂ KHỞI ĐỘNG SERVER DO LỖI KẾT NỐI DATABASE!");
        console.error(err);
        process.exit(1);
    });