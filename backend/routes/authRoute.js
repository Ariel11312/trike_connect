import express from 'express';
const router = express.Router();

import {
  signup,
  login,
  getMe,
  sendVerification,
  verificationCode,
  verifyID,
  getUserById,
  getAllUsers,
  updateProfile,   // ← new
  changePassword,  // ← new
} from '../Controllers/authController.js';
import { protect } from '../auth/auth.js';

// ── Public ───────────────────────────────────────────────────────────────────
router.post('/signup',            signup);
router.post('/login',             login);
router.post('/send-verification', sendVerification);
router.post('/verify-code',       verificationCode);
router.post('/verify-id',         verifyID);

// ── Private ──────────────────────────────────────────────────────────────────
router.get('/me',           protect, getMe);
router.get('/user/:id',     protect, getUserById);
router.get('/get-all-user', protect, getAllUsers);

router.patch('/update-profile', protect, updateProfile);   // ← new
router.patch('/change-password',protect, changePassword);  // ← new

export default router;