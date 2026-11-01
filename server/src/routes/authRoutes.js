const express = require('express');
const router = express.Router();
const { check } = require('express-validator');
const { login, getMe, register, getSetupStatus } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');

router.get('/setup-status', getSetupStatus);

router.post(
  '/login',
  loginLimiter,
  validate([
    check('email', 'Please provide a valid email').isEmail(),
    check('password', 'Password is required').notEmpty()
  ]),
  login
);

router.post(
  '/register',
  validate([
    check('name', 'Name is required').trim().notEmpty(),
    check('email', 'Please provide a valid email').isEmail(),
    check('password', 'Password must be at least 6 characters').isLength({ min: 6 })
  ]),
  register
);

router.get('/me', protect, getMe);

module.exports = router;

