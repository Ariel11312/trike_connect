import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  firstName: { type: String, required: [true, 'Please provide first name'], trim: true },
  lastName: { type: String, required: [true, 'Please provide last name'], trim: true },
  email: { type: String, required: [true, 'Please provide email'], unique: true, lowercase: true, trim: true },
  phoneNumber: { type: String, required: [true, 'Please provide phone number'], trim: true },
  password: { type: String, required: [true, 'Please provide password'], minlength: 6, select: false },
  role: { type: String, enum: ['commuter', 'admin', 'driver'], default: 'commuter' },

  // Email verification
  isEmailVerified: { type: Boolean, default: false },
  emailVerificationCode: { type: String, select: false },
  emailVerificationExpires: { type: Date, select: false },

  // Password reset
  resetPasswordToken: { type: String, select: false },
  resetPasswordExpires: { type: Date, select: false },

  // Driver-specific
  todaName: { type: String, trim: true },
  licensePlate: { type: String, trim: true },
  driversLicense: { type: String, trim: true },
  sapiId: { type: String, trim: true },
  idCardImage: { type: String, trim: true }, // Stores the filename of the ID image (e.g., "id_1234567890_user_email_com.jpg")
  address: { type: String, trim: true }, // Extracted from OCR
 RegistrationStatus: { 
  type: String, 
  enum: ['pending', 'approved', 'rejected'], 
  default: 'pending' 
},

  // Ban/Suspension fields
  isBanned: { type: Boolean, default: false },
  banReason: { type: String, trim: true },
  bannedAt: { type: Date },
  banUntil: { type: Date }, // null for permanent ban
  bannedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Admin who banned the user

}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Generate verification code
userSchema.methods.generateVerificationCode = function() {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  this.emailVerificationCode = code;
  this.emailVerificationExpires = Date.now() + 10 * 60 * 1000; // 10 min
  return code;
};

// Verify email code
userSchema.methods.verifyEmailCode = function(code) {
  if (!this.emailVerificationCode || !this.emailVerificationExpires) return false;
  if (Date.now() > this.emailVerificationExpires) return false;
  if (this.emailVerificationCode !== code) return false;

  this.isEmailVerified = true;
  this.emailVerificationCode = undefined;
  this.emailVerificationExpires = undefined;
  return true;
};

// Generate password reset token
userSchema.methods.generatePasswordResetToken = function() {
  const resetToken = Math.floor(100000 + Math.random() * 900000).toString();
  this.resetPasswordToken = resetToken;
  this.resetPasswordExpires = Date.now() + 30 * 60 * 1000; // 30 min
  return resetToken;
};

// Check if user is currently banned
userSchema.methods.isCurrentlyBanned = function() {
  if (!this.isBanned) return false;
  
  // If banUntil is null, it's a permanent ban
  if (!this.banUntil) return true;
  
  // Check if temporary ban has expired
  if (new Date() > this.banUntil) {
    // Auto-unban if temporary ban expired
    this.isBanned = false;
    this.banReason = null;
    this.bannedAt = null;
    this.banUntil = null;
    this.bannedBy = null;
    this.save();
    return false;
  }
  
  return true;
};

// Virtual for ban status
userSchema.virtual('banStatus').get(function() {
  if (!this.isBanned) return 'active';
  if (!this.banUntil) return 'permanently_banned';
  if (new Date() > this.banUntil) return 'active';
  return 'temporarily_banned';
});

const User = mongoose.model('User', userSchema);
export default User;