const { pool } = require('../../config/database');

// [POST] /api/public/chatbot/ask
exports.askChatbot = async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ message: 'Vui lòng nhập tin nhắn.' });

    try {
        const lowerMsg = message.toLowerCase();
        // Lấy tất cả rules
        const [rules] = await pool.execute('SELECT * FROM chatbot_rules WHERE is_active = 1');
        
        let bestResponse = "Xin lỗi, tôi chưa hiểu ý bạn. Bạn có thể hỏi về 'thực đơn', 'giờ mở cửa' hoặc 'khuyến mãi' được không?";

        // Logic khớp từ khóa đơn giản
        for (const rule of rules) {
            const keywords = rule.keywords.split(',').map(k => k.trim().toLowerCase());
            const match = keywords.some(k => lowerMsg.includes(k));
            if (match) {
                bestResponse = rule.response;
                break;
            }
        }

        res.status(200).json({ response: bestResponse });

    } catch (error) {
        res.status(500).json({ message: 'Lỗi chatbot.' });
    }
};