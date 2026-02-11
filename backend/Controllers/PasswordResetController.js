import User from '../models/user.js';
import nodemailer from 'nodemailer';

// Configure nodemailer transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT || 587,
  secure: process.env.EMAIL_PORT == 465,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Helper function to send reset code email
const sendResetCodeEmail = async (email, code, firstName) => {
  const mailOptions = {
    from: `"Your App" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Password Reset Code',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; }
            .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .header { background: #007AFF; color: white; padding: 30px; text-align: center; }
            .content { padding: 30px; }
            .code-box { background: #f8f9fa; border: 2px dashed #007AFF; border-radius: 8px; padding: 20px; margin: 25px 0; text-align: center; }
            .code { font-size: 36px; font-weight: bold; color: #007AFF; letter-spacing: 5px; }
            .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px; }
            .warning { color: #dc3545; margin-top: 15px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">Password Reset</h1>
            </div>
            <div class="content">
              <p>Hi <strong>${firstName}</strong>,</p>
              <p>We received a request to reset your password. Use the verification code below to continue:</p>
              
              <div class="code-box">
                <div class="code">${code}</div>
              </div>
              
              <p><strong>This code will expire in 30 minutes.</strong></p>
              <p class="warning">⚠️ If you didn't request this password reset, please ignore this email and ensure your account is secure.</p>
            </div>
            <div class="footer">
              <p>This is an automated message, please do not reply.</p>
              <p>&copy; ${new Date().getFullYear()} Your App. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `,
  };

  await transporter.sendMail(mailOptions);
};

// 1. Request Password Reset
export const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    // Validate email
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please provide your email address' 
      });
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase().trim() });

    // Always return success to prevent email enumeration
    if (!user) {
      return res.status(200).json({ 
        success: true, 
        message: 'If an account exists with this email, a reset code has been sent' 
      });
    }

    // Check if user is banned
    if (user.isCurrentlyBanned()) {
      return res.status(403).json({ 
        success: false, 
        message: 'Account is suspended and cannot reset password' 
      });
    }

    // Generate 6-digit reset code
    const resetCode = user.generatePasswordResetToken();
    await user.save({ validateBeforeSave: false });

    // Send email with code
    try {
      await sendResetCodeEmail(user.email, resetCode, user.firstName);
      
      res.status(200).json({ 
        success: true, 
        message: 'Password reset code sent to your email' 
      });
    } catch (emailError) {
      // Rollback: clear reset token if email fails
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save({ validateBeforeSave: false });
      
      console.error('Email sending error:', emailError);
      return res.status(500).json({ 
        success: false, 
        message: 'Error sending email. Please try again later.' 
      });
    }

  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error. Please try again later.' 
    });
  }
};

// 2. Verify Reset Code (Optional - good for UX)
export const verifyResetCode = async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please provide email and verification code' 
      });
    }

    // Validate code format (6 digits)
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid code format' 
      });
    }

    // Find user with valid reset token
    const user = await User.findOne({ 
      email: email.toLowerCase().trim(),
      resetPasswordToken: code,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid or expired verification code' 
      });
    }

    res.status(200).json({ 
      success: true, 
      message: 'Code verified successfully' 
    });

  } catch (error) {
    console.error('Verify code error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error. Please try again.' 
    });
  }
};

// 3. Reset Password
export const resetPassword = async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    // Validation
    if (!email || !code || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please provide email, code, and new password' 
      });
    }

    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid code format' 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password must be at least 6 characters long' 
      });
    }

    // Find user with valid reset code
    const user = await User.findOne({ 
      email: email.toLowerCase().trim(),
      resetPasswordToken: code,
      resetPasswordExpires: { $gt: Date.now() }
    }).select('+password +resetPasswordToken +resetPasswordExpires');

    if (!user) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid or expired verification code' 
      });
    }

    // Check if user is banned
    if (user.isCurrentlyBanned()) {
      return res.status(403).json({ 
        success: false, 
        message: 'Account is suspended' 
      });
    }

    // Update password (will be hashed by pre-save hook)
    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.status(200).json({ 
      success: true, 
      message: 'Password has been reset successfully. You can now login with your new password.' 
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error. Please try again.' 
    });
  }
};

// 4. Resend Reset Code (Optional - good for UX)
export const resendResetCode = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please provide your email address' 
      });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      return res.status(200).json({ 
        success: true, 
        message: 'If an account exists with this email, a new code has been sent' 
      });
    }

    if (user.isCurrentlyBanned()) {
      return res.status(403).json({ 
        success: false, 
        message: 'Account is suspended' 
      });
    }

    // Generate new code
    const resetCode = user.generatePasswordResetToken();
    await user.save({ validateBeforeSave: false });

    // Send email
    await sendResetCodeEmail(user.email, resetCode, user.firstName);

    res.status(200).json({ 
      success: true, 
      message: 'New verification code sent to your email' 
    });

  } catch (error) {
    console.error('Resend code error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error. Please try again.' 
    });
  }
};