import User from '../models/user.js';
import DriverRegistration from '../models/DriverRegistration.js';

// @desc    Get all driver registrations (Admin only)
// @route   GET /api/driver-registrations
// @access  Private/Admin
export const getAllRegistrations = async (req, res) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;

    const filter = {
      role: 'driver',
      // Remove this line to show ALL registrations (pending, approved, rejected)
      // RegistrationStatus: 'pending'
    };

    // Search filter
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { licensePlate: { $regex: search, $options: 'i' } },
        { sapiId: { $regex: search, $options: 'i' } }
      ];
    }

    // Pagination
    const skip = (page - 1) * limit;

    const total = await User.countDocuments(filter);

    const users = await User.find(filter)
      .select('-password -emailVerificationCode -resetPasswordToken')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    // ==================== TRANSFORM DATA ====================
    // Map database fields to what frontend expects
    const transformedUsers = users.map(user => {
      const userObj = user.toObject();
      
      // Log original data for debugging
      console.log('Original user:', {
        id: userObj._id,
        firstName: userObj.firstName,
        driversLicense: userObj.driversLicense,
        idCardImage: userObj.idCardImage
      });
      
      // Use idCardImage if it exists (the correct field with actual filename)
      // Fall back to driversLicense if idCardImage doesn't exist
      if (!userObj.idCardImage && userObj.driversLicense) {
        userObj.idCardImage = userObj.driversLicense;
      }
      
      // Remove the old field to avoid confusion
      delete userObj.driversLicense;
      
      console.log('Transformed user:', {
        id: userObj._id,
        firstName: userObj.firstName,
        idCardImage: userObj.idCardImage
      });
      
      return userObj;
    });
    // ========================================================

    res.status(200).json({
      success: true,
      count: transformedUsers.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: Number(page),
      data: transformedUsers
    });

  } catch (error) {
    console.error('Fetch pending registrations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending registrations',
      error: error.message
    });
  }
};


// @desc    Get single driver registration by ID
// @route   GET /api/driver-registrations/:id
// @access  Private/Admin
export const getRegistrationById = async (req, res) => {
  try {
    const registration = await DriverRegistration.findById(req.params.id)
      .populate('user', 'firstName lastName email phoneNumber')
      .populate('approvedBy', 'firstName lastName email')
      .populate('rejectedBy', 'firstName lastName email');

    if (!registration) {
      return res.status(404).json({
        success: false,
        message: 'Driver registration not found'
      });
    }

    res.status(200).json({
      success: true,
      data: registration
    });
  } catch (error) {
    console.error('Error fetching registration:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching driver registration',
      error: error.message
    });
  }
};

// @desc    Create new driver registration
// @route   POST /api/driver-registrations
// @access  Private
export const createRegistration = async (req, res) => {
  try {
    const {
      driverName,
      email,
      phone,
      vehicleType,
      vehicleMake,
      vehicleModel,
      vehicleYear,
      licensePlate,
      profileImage
    } = req.body;

    // Check if user already has a pending or approved registration
    const existingRegistration = await DriverRegistration.findOne({
      user: req.user._id,
      status: { $in: ['pending', 'approved'] }
    });

    if (existingRegistration) {
      return res.status(400).json({
        success: false,
        message: 'You already have a pending or approved driver registration'
      });
    }

    const registration = await DriverRegistration.create({
      user: req.user._id,
      driverName,
      email,
      phone,
      vehicleType,
      vehicleMake,
      vehicleModel,
      vehicleYear,
      licensePlate,
      profileImage
    });

    res.status(201).json({
      success: true,
      message: 'Driver registration submitted successfully',
      data: registration
    });
  } catch (error) {
    console.error('Error creating registration:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating driver registration',
      error: error.message
    });
  }
};

// @desc    Upload document for registration
// @route   POST /api/driver-registrations/:id/documents
// @access  Private
export const uploadDocument = async (req, res) => {
  try {
    const { type, url } = req.body;

    const registration = await DriverRegistration.findById(req.params.id);

    if (!registration) {
      return res.status(404).json({
        success: false,
        message: 'Driver registration not found'
      });
    }

    // Check if user owns this registration
    if (registration.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to upload documents for this registration'
      });
    }

    // Check if document type already exists
    const existingDocIndex = registration.documents.findIndex(doc => doc.type === type);
    
    if (existingDocIndex !== -1) {
      // Update existing document
      registration.documents[existingDocIndex].url = url;
      registration.documents[existingDocIndex].uploadedAt = Date.now();
      registration.documents[existingDocIndex].verified = false;
    } else {
      // Add new document
      registration.documents.push({
        type,
        url,
        verified: false,
        uploadedAt: Date.now()
      });
    }

    await registration.save();

    res.status(200).json({
      success: true,
      message: 'Document uploaded successfully',
      data: registration
    });
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading document',
      error: error.message
    });
  }
};

// @desc    Approve driver registration
// @route   PUT /api/driver-registrations/:id/approve
// @access  Private/Admin
export const approveRegistration = async (req, res) => {
  try {
    // Get userId from params (this matches the frontend call)
    const userId = req.params.id || req.params.userId;
    
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.role !== 'driver') {
      return res.status(400).json({
        success: false,
        message: 'User is not a driver'
      });
    }

    if (user.RegistrationStatus === 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Registration is already approved'
      });
    }

    // Update user status
    user.RegistrationStatus = 'approved';
    user.backgroundCheckStatus = 'approved';
    user.documentsVerified = true;
    user.rejectionReason = undefined;

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Driver registration approved successfully',
      data: user
    });
  } catch (error) {
    console.error('Error approving registration:', error);
    res.status(500).json({
      success: false,
      message: 'Error approving driver registration',
      error: error.message
    });
  }
};

// @desc    Reject driver registration
// @route   PUT /api/driver-registrations/:id/reject
// @access  Private/Admin
export const rejectRegistration = async (req, res) => {
  try {
    const { reason } = req.body;
    
    // Get userId from params (this matches the frontend call)
    const userId = req.params.id || req.params.userId;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.role !== 'driver') {
      return res.status(400).json({
        success: false,
        message: 'User is not a driver'
      });
    }

    if (user.RegistrationStatus === 'rejected') {
      return res.status(400).json({
        success: false,
        message: 'Registration is already rejected'
      });
    }

    // Update user status
    user.RegistrationStatus = 'rejected';
    user.backgroundCheckStatus = 'failed';
    user.rejectionReason = reason || 'Registration did not meet requirements';

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Driver registration rejected',
      data: user
    });
  } catch (error) {
    console.error('Error rejecting registration:', error);
    res.status(500).json({
      success: false,
      message: 'Error rejecting driver registration',
      error: error.message
    });
  }
};

// @desc    Verify/Unverify a document
// @route   PUT /api/driver-registrations/:id/documents/:documentId/verify
// @access  Private/Admin
export const verifyDocument = async (req, res) => {
  try {
    const { verified } = req.body;

    const registration = await DriverRegistration.findById(req.params.id);

    if (!registration) {
      return res.status(404).json({
        success: false,
        message: 'Driver registration not found'
      });
    }

    const document = registration.documents.id(req.params.documentId);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    document.verified = verified;
    await registration.save();

    res.status(200).json({
      success: true,
      message: `Document ${verified ? 'verified' : 'unverified'} successfully`,
      data: registration
    });
  } catch (error) {
    console.error('Error verifying document:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying document',
      error: error.message
    });
  }
};

// @desc    Get registration statistics
// @route   GET /api/driver-registrations/stats
// @access  Private/Admin
export const getRegistrationStats = async (req, res) => {
  try {
    const stats = await DriverRegistration.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const formattedStats = {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0
    };

    stats.forEach(stat => {
      formattedStats[stat._id] = stat.count;
      formattedStats.total += stat.count;
    });

    res.status(200).json({
      success: true,
      data: formattedStats
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching registration statistics',
      error: error.message
    });
  }
};

// @desc    Delete driver registration
// @route   DELETE /api/driver-registrations/:id
// @access  Private/Admin
export const deleteRegistration = async (req, res) => {
  try {
    const registration = await DriverRegistration.findById(req.params.id);

    if (!registration) {
      return res.status(404).json({
        success: false,
        message: 'Driver registration not found'
      });
    }

    await registration.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Driver registration deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting registration:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting driver registration',
      error: error.message
    });
  }
};

// @desc    Get my driver registration (for authenticated users)
// @route   GET /api/driver-registrations/my-registration
// @access  Private
export const getMyRegistration = async (req, res) => {
  try {
    const registration = await DriverRegistration.findOne({ user: req.user._id })
      .sort({ createdAt: -1 });

    if (!registration) {
      return res.status(404).json({
        success: false,
        message: 'No registration found for your account'
      });
    }

    res.status(200).json({
      success: true,
      data: registration
    });
  } catch (error) {
    console.error('Error fetching registration:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching your registration',
      error: error.message
    });
  }
};