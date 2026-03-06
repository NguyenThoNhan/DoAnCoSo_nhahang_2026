const express = require('express');
const authController = require('../controllers/auth.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
const router = express.Router();

// POST /api/auth/register
router.post('/register', authController.register);

// POST /api/auth/login
router.post('/login', authController.login);

// GET /api/auth/verify — kiểm tra token còn hợp lệ không (dùng bởi login.html)
router.get('/verify', verifyToken, authController.verify);

module.exports = router;