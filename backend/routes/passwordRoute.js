import express from 'express';
import { 
  requestPasswordReset, 
  verifyResetCode, 
  resetPassword,
  resendResetCode
} from '../Controllers/PasswordResetController.js'

const router = express.Router();

// Password reset routes
router.post('/forgot-password', requestPasswordReset);
router.post('/verify-reset-code', verifyResetCode);
router.post('/reset-password', resetPassword);
router.post('/resend-reset-code', resendResetCode); // Optional

export default router;