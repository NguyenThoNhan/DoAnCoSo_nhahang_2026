// project/src/routes/user.routes.js
const express = require('express');
// Sửa lỗi cú pháp: Chỉ require một lần duy nhất
const {
    verifyToken,
    isCustomer,
    verifyGuestToken,
    verifyGuestOrUser,
} = require('../middlewares/auth.middleware');
const userController = require('../controllers/user.controller');
const chatbotController = require('../controllers/chatbot.controller');
const router = express.Router();

// =======================================================
// 1. CÁC ROUTE CÔNG KHAI (PUBLIC - KHÔNG CẦN LOGIN)
// Tiền tố: /api/user/public/...
// =======================================================
const publicRouter = express.Router();

// Lấy sơ đồ/trạng thái bàn
publicRouter.get('/tables', userController.getAvailableTables);

// Xác thực bàn (sau khi quét QR/chọn bàn)
publicRouter.get('/table/verify/:id', userController.verifyTable);
publicRouter.get('/table/check-session/:tableNumber', userController.checkTableSession);

// Lấy Menu và Danh mục công khai
publicRouter.get('/menu', userController.getMenu);          
publicRouter.get('/categories', userController.getMenuCategories); 

// Tích hợp Public Router vào Router chính
router.use('/public', publicRouter);


// =======================================================
// 2. ROUTE ORDER (CẦN XÁC THỰC GUEST HOẶC USER)
// Tiền tố: /api/user/order/...
// =======================================================
const orderRouter = express.Router(); 

// API Gửi đơn hàng:
//  - Guest tại bàn: dùng guestToken (role: guest, có tableId)
//  - Customer đã đăng nhập: dùng authToken (role: customer) + body.table_id
orderRouter.post('/create', verifyGuestOrUser, userController.createOrder);

// API Hủy bàn (guest tại bàn)
orderRouter.delete('/cancel-table', verifyGuestToken, userController.cancelTable);

// API Lấy đơn hàng theo ID:
//  - Guest: xem lại đơn của đúng bàn mình (guestToken)
//  - Customer: xem đơn thuộc về tài khoản của mình (authToken)
orderRouter.get('/:id', verifyGuestOrUser, userController.getOrderById);

// API Gửi yêu cầu thanh toán: chỉ dành cho khách tại bàn (guestToken)
orderRouter.put('/request-checkout', verifyGuestToken, userController.requestCheckout);

// Tích hợp Order Router vào Router chính
router.use('/order', orderRouter);


// =======================================================
// 3. CÁC ROUTE KHÁCH HÀNG ĐÃ ĐĂNG NHẬP (CUSTOMER - CẦN LOGIN)
// Tiền tố: /api/user/...
// =======================================================
// Áp dụng middleware cho các route sau
router.use(verifyToken, isCustomer);
router.get('/profile-details', userController.getProfileDetails);
router.get('/order-history', userController.getOrderHistory);

router.get('/profile', userController.getProfile); 

publicRouter.get('/combos', userController.getPublicCombos);
publicRouter.post('/promotions/check', userController.checkCoupon);
publicRouter.post('/chatbot/ask', chatbotController.askChatbot);

module.exports = router;