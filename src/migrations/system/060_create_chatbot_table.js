const { pool } = require('../../../config/database');

async function up() {
    console.log('Migration 060: Tạo bảng chatbot_rules...');
    const query = `
        CREATE TABLE IF NOT EXISTS chatbot_rules (
            id INT AUTO_INCREMENT PRIMARY KEY,
            keywords VARCHAR(255) NOT NULL, -- Các từ khóa cách nhau bởi dấu phẩy
            response TEXT NOT NULL,         -- Câu trả lời tương ứng
            is_active BOOLEAN DEFAULT TRUE
        ) ENGINE=InnoDB;
    `;
    await pool.execute(query);

    // Chèn một số dữ liệu mẫu (Seeding ngay trong migration cho tiện)
    const seedQuery = `
        INSERT INTO chatbot_rules (keywords, response) VALUES 
        ('chào, hi, hello', 'Xin chào! Tôi có thể giúp gì cho bạn trong việc đặt món hôm nay?'),
        ('thực đơn, món ăn, menu', 'Bạn có thể xem đầy đủ thực đơn tại trang Menu. Chúng tôi có các món đặc sắc như Phở bò, Bún chả...'),
        ('khuyến mãi, giảm giá, coupon', 'Hiện tại chúng tôi đang có mã giảm giá GIAM20 cho hóa đơn trên 200k đấy!'),
        ('giờ, mở cửa, đóng cửa', 'Nhà hàng mở cửa từ 8:00 đến 22:00 tất cả các ngày trong tuần.'),
        ('điện thoại, liên hệ, hotline', 'Bạn có thể gọi số hotline 090.123.4567 để được hỗ trợ gấp nhé!')
    `;
    await pool.execute(seedQuery);
}

module.exports = { up };