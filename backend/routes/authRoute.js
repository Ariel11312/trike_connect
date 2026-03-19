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
  updateProfile,
  changePassword,
  getUsersByRole,           // ← new
  updateRegistrationStatus, // ← new
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

router.patch('/update-profile',  protect, updateProfile);
router.patch('/change-password', protect, changePassword);

// ── User Management (dispatcher / driver registration approval) ──────────────
// GET  /api/auth/users?role=dispatcher
// GET  /api/auth/users?role=driver&status=pending
router.get('/users',                          protect, getUsersByRole);

// PATCH /api/auth/users/:id/registration-status
// body: { RegistrationStatus: 'approved' | 'rejected', rejectionReason?: string }
router.patch('/users/:id/registration-status', protect, updateRegistrationStatus);

export default router;