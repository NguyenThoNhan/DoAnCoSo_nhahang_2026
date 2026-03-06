// =============================================================
// src/routes/admin.routes.js
// Phiên bản: FINAL — Đã sửa lỗi + chuẩn hoá toàn bộ
// =============================================================

'use strict';

const express         = require('express');
const { verifyToken, isAdmin } = require('../middlewares/auth.middleware');
const { uploadMiddleware }     = require('../controllers/upload.controller');
const adminController          = require('../controllers/admin.controller');

const router = express.Router();

// =============================================================
// BẢO MẬT: Áp dụng verifyToken + isAdmin cho TOÀN BỘ route admin.
// Mọi request thiếu token hoặc không phải admin → 401/403 tại đây.
// =============================================================
router.use(verifyToken, isAdmin);

// =============================================================
// HEALTH CHECK
// GET /api/admin/dashboard
// =============================================================
router.get('/dashboard', (req, res) => {
    res.status(200).json({
        message: `Chào Admin ${req.user.email}, bạn đã truy cập thành công.`,
        user:    req.user
    });
});

// =============================================================
// THỐNG KÊ DASHBOARD
// GET /api/admin/stats/dashboard
// =============================================================
router.get('/stats/dashboard', adminController.getDashboardStats);

// =============================================================
// DANH MỤC (Categories)
// GET    /api/admin/categories
// POST   /api/admin/categories
// PUT    /api/admin/categories/:id
// DELETE /api/admin/categories/:id
// =============================================================
router.get   ('/categories',        adminController.getCategories);
router.post  ('/categories',        adminController.createCategory);
router.put   ('/categories/:id',    adminController.updateCategory);
router.delete('/categories/:id',    adminController.deleteCategory);

// =============================================================
// CÔNG THỨC MÓN ĂN (Food Recipes)
// ⚠️ PHẢI đặt TRƯỚC các route /foods/:id chung để tránh conflict.
//
// GET    /api/admin/foods/:id/recipe
// POST   /api/admin/foods/:id/recipe
// DELETE /api/admin/foods/:id/recipe/:ingredientId
// =============================================================
router.get   ('/foods/:id/recipe',                    adminController.getFoodRecipe);
router.post  ('/foods/:id/recipe',                    adminController.addIngredientToFood);
router.delete('/foods/:id/recipe/:ingredientId',      adminController.removeIngredientFromFood);

// =============================================================
// MÓN ĂN (Foods)
// GET    /api/admin/foods
// POST   /api/admin/foods                   (có upload ảnh)
// PUT    /api/admin/foods/:id               (có upload ảnh)
// DELETE /api/admin/foods/:id
// PUT    /api/admin/foods/:id/availability  (toggle trạng thái)
// =============================================================
router.get   ('/foods',                         adminController.getFoods);
router.post  ('/foods',        uploadMiddleware, adminController.createFood);
router.put   ('/foods/:id',    uploadMiddleware, adminController.updateFood);
router.delete('/foods/:id',                     adminController.deleteFood);
router.put   ('/foods/:id/availability',        adminController.updateFoodAvailability);

// =============================================================
// NGUYÊN LIỆU (Ingredients)
// GET    /api/admin/ingredients
// POST   /api/admin/ingredients
// PUT    /api/admin/ingredients/:id
// DELETE /api/admin/ingredients/:id
// =============================================================
router.get   ('/ingredients',        adminController.getIngredients);
router.post  ('/ingredients',        adminController.createIngredient);
router.put   ('/ingredients/:id',    adminController.updateIngredient);
router.delete('/ingredients/:id',    adminController.deleteIngredient);

// =============================================================
// ĐƠN HÀNG (Orders)
// ⚠️ Route cụ thể (/complete-and-release) PHẢI đặt TRƯỚC route chung (/status).
//
// GET /api/admin/orders
// GET /api/admin/orders/:id
// PUT /api/admin/orders/:id/complete-and-release
// PUT /api/admin/orders/:id/status
// =============================================================
router.get('/orders',                              adminController.getOrders);
router.get('/orders/:id',                          adminController.getOrderDetails);
router.put('/orders/:id/complete-and-release',     adminController.completeOrderAndReleaseTable);
router.put('/orders/:id/status',                   adminController.updateOrderStatus);

// =============================================================
// BÀN (Tables)
// ⚠️ Route cụ thể (/release) PHẢI đặt TRƯỚC route chung (/:id).
//
// GET    /api/admin/tables
// POST   /api/admin/tables
// PUT    /api/admin/tables/:id/release
// PUT    /api/admin/tables/:id
// DELETE /api/admin/tables/:id
// =============================================================
router.get   ('/tables',               adminController.getTables);
router.post  ('/tables',               adminController.createTable);
router.put   ('/tables/:id/release',   adminController.releaseTable);
router.put   ('/tables/:id',           adminController.updateTableStatus);
router.delete('/tables/:id',           adminController.deleteTable);

// =============================================================
// NHÂN VIÊN (Staff)
// GET  /api/admin/staff
// POST /api/admin/staff
// =============================================================
router.get ('/staff',  adminController.getAllStaff);
router.post('/staff',  adminController.createStaff);

// =============================================================
// KHÁCH HÀNG (Customers)
// GET /api/admin/customers
// =============================================================
router.get('/customers', adminController.getAllCustomers);

// =============================================================
// KHUYẾN MÃI & MÃ GIẢM GIÁ (Promotions)
// GET  /api/admin/promotions
// POST /api/admin/promotions
// =============================================================
router.get ('/promotions',  adminController.getPromotions);
router.post('/promotions',  adminController.createPromotion);

// =============================================================
// COMBO
// GET  /api/admin/combos
// POST /api/admin/combos
// =============================================================
router.get ('/combos',  adminController.getCombos);
router.post('/combos',  adminController.createCombo);

// =============================================================
// CHATBOT — QUẢN LÝ TRI THỨC
// GET    /api/admin/chatbot/rules
// POST   /api/admin/chatbot/rules
// PUT    /api/admin/chatbot/rules/:id
// DELETE /api/admin/chatbot/rules/:id
// =============================================================
router.get   ('/chatbot/rules',        adminController.getChatbotRules);
router.post  ('/chatbot/rules',        adminController.createChatbotRule);
router.put   ('/chatbot/rules/:id',    adminController.updateChatbotRule);
router.delete('/chatbot/rules/:id',    adminController.deleteChatbotRule);

// =============================================================
// CÀI ĐẶT HỆ THỐNG (Settings)
// GET /api/admin/settings
// PUT /api/admin/settings
// =============================================================
router.get('/settings', adminController.getSettings);
router.put('/settings', adminController.updateSettings);

module.exports = router;