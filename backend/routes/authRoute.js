import express from 'express';
const router = express.Router();

// Remember to include the .js extension for local files!
import { signup, login, getMe, sendVerification, verificationCode, verifyID, getUserById, getAllUsers } from '../Controllers/authController.js';
import { protect } from '../auth/auth.js';

// Public routes
router.post('/signup', signup);
router.post('/login', login);
router.post('/send-verification', sendVerification);
router.post('/verify-code', verificationCode);
router.post('/verify-id', verifyID);

router.get('/me', protect, getMe);
router.get('/user/:id', protect, getUserById); 
router.get('/get-all-user', protect, getAllUsers); 

export default router;