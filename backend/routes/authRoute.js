import express from 'express';
const router = express.Router();

// Remember to include the .js extension for local files!
import { signup, login, getMe, sendVerification, verificationCode, verifyID } from '../Controllers/authController.js';
import { protect } from '../auth/auth.js';

// Public routes
router.post('/signup', signup);
router.post('/login', login);
router.post('/send-verification', sendVerification);
router.post('/verify-code', verificationCode);
router.post('/verify-id', verifyID);


// Protected routes
router.get('/me', protect, getMe);

export default router;