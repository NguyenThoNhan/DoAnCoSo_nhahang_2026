// project/src/controllers/upload.controller.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Cấu hình nơi lưu trữ và tên file
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, '../../uploads/foods');
        // Kiểm tra thư mục có tồn tại không, nếu không thì tạo
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        // Tên file: food_timestamp_originalName.ext
        const ext = path.extname(file.originalname);
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `food_${uniqueSuffix}${ext}`);
    }
});

// Filter file: chỉ chấp nhận ảnh
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(null, false);
    }
};

// Cấu hình Multer chính
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // Giới hạn 5MB
    fileFilter: fileFilter
}).single('imageFile'); // Tên field trong form là 'imageFile'

// Middleware xử lý upload (chúng ta sẽ dùng nó trong Food Controller)
exports.uploadMiddleware = (req, res, next) => {
    upload(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ message: `Lỗi Multer: ${err.message}` });
        } else if (err) {
            return res.status(500).json({ message: `Lỗi upload không xác định: ${err.message}` });
        }
        
        if (req.file) {
             // Lưu đường dẫn công khai vào req.body để Food Controller sử dụng
             // Ví dụ: /uploads/foods/food_timestamp.jpg
             req.body.image_url = `/uploads/foods/${req.file.filename}`;
        }
        
        next();
    });
};