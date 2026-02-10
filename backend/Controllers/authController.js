import User from '../models/user.js';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import Tesseract from 'tesseract.js';
import fs from 'fs';
import path from 'path';

const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

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

// Store verification codes temporarily (use Redis in production)
const verificationCodes = new Map();

export const sendVerification = async (req, res) => {
  try {
    const { email } = req.body;

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store code with 10 minute expiration
    verificationCodes.set(email, {
      code,
      expiresAt: Date.now() + 10 * 60 * 1000
    });

    // Send email using Nodemailer
    await transporter.sendMail({
      from: `"Trike Connect" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Verify Your Email',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Email Verification</h2>
          <p>Your Trike Connect verification code is:</p>
          <div style="background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px;">
            ${code}
          </div>
          <p>This code will expire in 10 minutes.</p>
        </div>
      `
    });

    res.json({ success: true, message: 'Verification code sent' });
  } catch (error) {
    console.error('Send verification error:', error);
    res.status(500).json({ message: 'Failed to send verification code' });
  }
};

// Verify code
export const verificationCode = async (req, res) => {
  try {
    const { email, code } = req.body;

    const stored = verificationCodes.get(email);

    if (!stored) {
      return res.status(400).json({ message: 'No verification code found' });
    }

    if (Date.now() > stored.expiresAt) {
      verificationCodes.delete(email);
      return res.status(400).json({ message: 'Verification code expired' });
    }

    if (stored.code !== code) {
      return res.status(400).json({ message: 'Invalid verification code' });
    }

    // Code is valid, remove it
    verificationCodes.delete(email);

    res.json({ success: true, message: 'Email verified' });
  } catch (error) {
    console.error('Verify code error:', error);
    res.status(500).json({ message: 'Verification failed' });
  }
};

// Generate JWT Token
const generateToken = (id) => 
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE,
  });

// Validate and format Philippine phone number
const validateAndFormatPhoneNumber = (phoneNumber) => {
  if (!phoneNumber) {
    throw new Error('Phone number is required');
  }

  // Remove all non-digit characters
  let cleanedPhone = phoneNumber.replace(/\D/g, '');
  
  // Remove leading 0 if present (e.g., 09171234567 -> 9171234567)
  if (cleanedPhone.startsWith('0')) {
    cleanedPhone = cleanedPhone.substring(1);
  }
  
  // Remove country code if present (e.g., 639171234567 -> 9171234567)
  if (cleanedPhone.startsWith('63')) {
    cleanedPhone = cleanedPhone.substring(2);
  }
  
  // Validate: must start with 9 and be exactly 10 digits
  if (!cleanedPhone.startsWith('9') || cleanedPhone.length !== 10) {
    throw new Error('Invalid Philippine mobile number. Must start with 9 and be 10 digits (e.g., 9171234567)');
  }
  
  // Return formatted number with country code
  return '63' + cleanedPhone;
};

// @desc    Register user
// @route   POST /api/auth/signup
// @access  Public
export const signup = async (req, res) => {
  try {
    const { firstName, lastName, email, phoneNumber, password, role, todaName, licensePlate, driversLicense, sapiId, idCardImage, address } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email || !phoneNumber || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields',
      });
    }

    // Validate and format phone number
    let formattedPhone;
    try {
      formattedPhone = validateAndFormatPhoneNumber(phoneNumber);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    // Check if user already exists with email
    const existingUserEmail = await User.findOne({ email });
    if (existingUserEmail) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered',
      });
    }

    // Check if user already exists with phone number
    const existingUserPhone = await User.findOne({ phoneNumber: formattedPhone });
    if (existingUserPhone) {
      return res.status(400).json({
        success: false,
        message: 'Phone number already registered',
      });
    }

    // Prepare user data
    const userData = {
      firstName,
      lastName,
      email,
      phoneNumber: formattedPhone,
      password,
      role: role || 'commuter',
    };

    // If driver, save ID image and add driver-specific fields
    if (role === 'driver') {
      if (!todaName || !licensePlate || !idCardImage || !address || !driversLicense || !sapiId) {
        return res.status(400).json({
          success: false,
          message: 'Driver registration requires TODA name, license plate, ID image, and verified address',
        });
      }

      // Save ID image to uploads folder
      const imageBuffer = Buffer.from(idCardImage.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      const filename = `id_${Date.now()}_${email.replace(/[^a-z0-9]/gi, '_')}.jpg`;
      const filepath = path.join(uploadDir, filename);
      fs.writeFileSync(filepath, imageBuffer);

      // Add driver-specific fields
      userData.todaName = todaName;
      userData.licensePlate = licensePlate.toUpperCase();
      userData.driversLicense = driversLicense.toUpperCase();
      userData.sapiId = sapiId.toUpperCase();
      userData.idCardImage = filename; // Save filename only
      userData.address = address;
    }

    // Create new user
    const user = await User.create(userData);

    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
        ...(role === 'driver' && {
          todaName: user.todaName,
          licensePlate: user.licensePlate,
          driversLicense: driversLicense.licensePlate,
          sapiId: sapiId.licensePlate,
          address: user.address,
        }),
      },
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during registration',
    });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password',
      });
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    const token = generateToken(user._id);

    // Set cookie with the token
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: { 
        id: user._id, 
        firstName: user.firstName,  
        lastName: user.lastName,    
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
        RegistrationStatus:user.RegistrationStatus
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
    });
  }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }
    
    console.log("User data:", JSON.stringify(user, null, 2));
    
    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
        createdAt: user.createdAt,
        ...(user.role === 'driver' && {
          todaName: user.todaName,
          plateNumber: user.licensePlate,
          address: user.address,
          idCardImage: user.idCardImage,
        }),
      },
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// @desc    Verify ID card
// @route   POST /api/auth/verify-id
// @access  Public
export const verifyID = async (req, res) => {
  try {
    const { idImage } = req.body;
    
    if (!idImage) {
      return res.status(400).json({ 
        success: false, 
        message: 'ID image is required' 
      });
    }

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(idImage.replace(/^data:image\/\w+;base64,/, ''), 'base64');

    // Save temporary image for OCR
    const tempFilename = `temp_${Date.now()}.jpg`;
    const tempFilepath = path.join(uploadDir, tempFilename);
    fs.writeFileSync(tempFilepath, imageBuffer);

    try {
      // Perform OCR
      const { data: { text } } = await Tesseract.recognize(imageBuffer, 'eng');

      // Normalize text
      const normalizedText = text.toLowerCase();
      const isValidResident = 
        (normalizedText.includes('baliwag') || normalizedText.includes('baliuag')) &&
        normalizedText.includes('bulacan');

      // Extract address
      let detectedAddress = '';
      for (const line of text.split('\n')) {
        const lower = line.toLowerCase();
        if (lower.includes('baliwag') || lower.includes('baliuag') || lower.includes('bulacan')) {
          detectedAddress = line.trim();
          break;
        }
      }

      // If no specific address line found, use a default
      if (!detectedAddress && isValidResident) {
        detectedAddress = 'Baliwag, Bulacan';
      }

      // Delete temporary file
      fs.unlinkSync(tempFilepath);

      res.json({
        success: true,
        isValidResident,
        address: detectedAddress || 'Address not detected',
        message: isValidResident 
          ? 'Valid Baliwag, Bulacan resident' 
          : 'Invalid address - must be from Baliwag, Bulacan'
      });
    } catch (ocrError) {
      // Delete temporary file even if OCR fails
      if (fs.existsSync(tempFilepath)) {
        fs.unlinkSync(tempFilepath);
      }
      throw ocrError;
    }
  } catch (error) {
    console.error('ID verification error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to verify ID card' 
    });
  }
};
export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id).select('-password -emailVerificationCode -resetPasswordToken');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching user',
      error: error.message,
    });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    // Get logged-in user
    const findType = await User.findById(req.user._id);

    if (!findType) {
      return res.status(404).json({ error: "User not found" });
    }

    let targetType;
    if (findType.userType === "student") {
      targetType = "teacher";
      console.log("Logged in as student, fetching teachers...");
    } else if (findType.userType === "teacher") {
      targetType = "student";
      console.log("Logged in as teacher, fetching students...");
    }

    // Fetch only the opposite usertype, excluding the logged-in user
    const users = await User.find({ 
      _id: { $ne: req.user._id },
      userType: targetType
    });

    res.send({
      message: "Users fetched successfully",
      success: true,
      data: users
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};