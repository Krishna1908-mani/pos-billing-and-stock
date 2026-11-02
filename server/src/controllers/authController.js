const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const userRepository = require('../repositories/userRepository');

const generateToken = (id) => {
  return jwt.sign(
    { id },
    process.env.JWT_SECRET || 'stockwise_super_secret_jwt_key_2026_secure',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      console.warn(`[Auth Warning] Login attempt missing credentials: email=${Boolean(email)}, password=${Boolean(password)} (IP: ${req.ip || 'unknown'})`);
      return res.status(400).json({
        success: false,
        message: 'Please provide both email and password'
      });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const user = await userRepository.findByEmail(trimmedEmail);
    if (!user) {
      console.warn(`[Auth Audit] Login failed: User not found for email "${trimmedEmail}" (IP: ${req.ip || 'unknown'})`);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    if (!user.isActive) {
      console.warn(`[Auth Audit] Login blocked: Account deactivated for user "${trimmedEmail}" (ID: ${user.id}, Role: ${user.role})`);
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact an admin.'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.warn(`[Auth Audit] Login failed: Invalid password for user "${trimmedEmail}" (ID: ${user.id}, IP: ${req.ip || 'unknown'})`);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    console.log(`[Auth Audit] Login successful for user "${trimmedEmail}" (Role: ${user.role}, ID: ${user.id})`);
    const token = generateToken(user.id);

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user.id,
        _id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res, next) => {
  try {
    const user = await userRepository.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.status(200).json({
      success: true,
      user: {
        id: user.id,
        _id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Register a new user (Staff or Admin)
// @route   POST /api/auth/register
// @access  Private (Admin only) or Public if no users exist
const register = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;

    const allUsers = await userRepository.getAllUsers();
    const count = allUsers.length;

    // Allow public registration only for the very first user (First-run bootstrap)
    if (count > 0) {
      if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Only administrators can create new user accounts.'
        });
      }
    }

    const existingUser = await userRepository.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'A user with this email address already exists.'
      });
    }

    // First user is automatically admin
    const userRole = count === 0 ? 'admin' : (role === 'admin' ? 'admin' : 'staff');

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = await userRepository.createUser({
      name,
      email,
      passwordHash,
      role: userRole,
      isActive: true
    });

    const token = generateToken(newUser.id);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: newUser.id,
        _id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get system status / first-run status
// @route   GET /api/auth/setup-status
// @access  Public
const getSetupStatus = async (req, res, next) => {
  try {
    const allUsers = await userRepository.getAllUsers();
    res.status(200).json({
      success: true,
      isSetupRequired: allUsers.length === 0
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  login,
  getMe,
  register,
  getSetupStatus
};
