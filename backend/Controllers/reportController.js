import { Report } from '../models/report.js';
import User from '../models/user.js';
import Ride from '../models/rideModel.js';

/**
 * Submit a driver report
 * @route POST /api/reports/driver
 * @access Private
 */
export const submitDriverReport = async (req, res) => {
  try {
    const { rideId, driverId, reason, comment, reportedBy } = req.body;

    // Validate required fields
    if (!rideId || !driverId || !reason || !reportedBy) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: rideId, driverId, reason, reportedBy'
      });
    }

    // Verify the ride exists
    const ride = await Ride.findById(rideId);
    if (!ride) {
      return res.status(404).json({
        success: false,
        message: 'Ride not found'
      });
    }

    // Check if user is allowed to report (was the passenger/user or is admin)
    const isPassenger = ride.userId.toString() === reportedBy;
    
    // Check if user is admin
    const reporter = await User.findById(reportedBy);
    const isAdmin = reporter?.role === 'admin';
    
    if (!isPassenger && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to report for this ride. Only the passenger or admin can submit reports.'
      });
    }

    // Check if driver exists
    const driver = await User.findById(driverId);
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    // Check if driver is actually a driver (optional)
    if (driver.role && driver.role !== 'driver') {
      return res.status(400).json({
        success: false,
        message: 'The reported user is not a driver'
      });
    }

    // Check if user is trying to report themselves
    if (driverId === reportedBy) {
      return res.status(400).json({
        success: false,
        message: 'You cannot report yourself'
      });
    }

    // Check if ride actually has a driver assigned
    if (!ride.driver || ride.driver.toString() !== driverId) {
      return res.status(400).json({
        success: false,
        message: 'This driver was not assigned to this ride'
      });
    }


    // Check if report already exists for this ride
    const existingReport = await Report.findOne({
      rideId,
      driverId,
      reportedBy,
      status: { $ne: 'dismissed' }
    });
    
    if (existingReport) {
      return res.status(400).json({
        success: false,
        message: 'You have already reported this driver for this ride'
      });
    }

    // Create the report
    const report = await Report.create({
      rideId,
      driverId,
      reportedBy,
      reason,
      comment: comment || '',
      reportType: 'driver'
    });

    // Populate references
    await report.populate([
      { 
        path: 'driver', 
        select: 'name email phone profilePicture' 
      },
      { 
        path: 'ride', 
        select: 'pickupLocation dropoffLocation fare status createdAt' 
      }
    ]);

    // Optional: Update driver's report count (if your User model has this field)
    try {
      await User.findByIdAndUpdate(driverId, {
        $inc: { reportCount: 1 }
      });
    } catch (error) {
      console.log('Note: reportCount field not updated (field may not exist)');
    }

    // Optional: Check for multiple reports in 24 hours for auto-suspension
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentReports = await Report.countDocuments({
      driverId,
      createdAt: { $gte: twentyFourHoursAgo },
      status: { $ne: 'dismissed' }
    });

    // Auto-suspend if 3+ reports in 24 hours (optional)
    if (recentReports >= 3 && driver.role === 'driver') {
      const suspensionEnd = new Date(Date.now() + 24 * 60 * 60 * 1000);
      
      await User.findByIdAndUpdate(driverId, {
        status: 'suspended',
        suspensionReason: 'Multiple reports in 24 hours',
        suspensionEnd
      });

      // You could add admin notification here
      console.log(`Driver ${driverId} auto-suspended due to ${recentReports} reports in 24 hours`);
    }

    return res.status(201).json({
      success: true,
      message: 'Report submitted successfully',
      data: {
        _id: report._id,
        rideId: report.rideId,
        driverId: report.driverId,
        reason: report.reason,
        comment: report.comment,
        status: report.status,
        createdAt: report.createdAt,
        driver: report.driver,
        ride: report.ride
      }
    });

  } catch (error) {
    console.error('Error submitting report:', error);
    
    if (error.message.includes('already reported')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get all reports (admin only)
 * @route GET /api/reports
 * @access Private/Admin
 */
export const getAllReports = async (req, res) => {
  try {
    const { status, driverId, page = 1, limit = 20 } = req.query;
    
    const query = {};
    if (status) query.status = status;
    if (driverId) query.driverId = driverId;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [reports, total] = await Promise.all([
      Report.find(query)
        .populate('driver', 'name email phone')
        .populate('reporter', 'name email')
        .populate('ride', 'pickupLocation dropoffLocation fare')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Report.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      data: reports,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching reports:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

/**
 * Update report status (admin only)
 * @route PATCH /api/reports/:id/status
 * @access Private/Admin
 */
export const updateReportStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNotes } = req.body;
    const adminId = req.user?.id; // Adjust based on your auth middleware

    if (!['pending', 'investigating', 'resolved', 'dismissed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value'
      });
    }

    const report = await Report.findById(id);
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    report.status = status;
    if (adminNotes) report.adminNotes = adminNotes;
    if (status === 'resolved' || status === 'dismissed') {
      report.resolvedBy = adminId;
      report.resolvedAt = new Date();
    }

    await report.save();

    return res.status(200).json({
      success: true,
      message: 'Report status updated',
      data: report
    });
  } catch (error) {
    console.error('Error updating report:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

/**
 * Get user's submitted reports
 * @route GET /api/reports/my-reports
 * @access Private
 */
export const getMyReports = async (req, res) => {
  try {
    const userId = req.user?.id; // Adjust based on your auth middleware
    
    const reports = await Report.find({ reportedBy: userId })
      .populate('driver', 'name profilePicture')
      .populate('ride', 'pickupLocation dropoffLocation createdAt')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: reports
    });
  } catch (error) {
    console.error('Error fetching user reports:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

/**
 * Get reports for a specific driver
 * @route GET /api/reports/driver/:driverId
 * @access Private/Admin
 */
export const getDriverReports = async (req, res) => {
  try {
    const { driverId } = req.params;
    
    const reports = await Report.find({ driverId })
      .populate('reporter', 'name email')
      .populate('ride', 'pickupLocation dropoffLocation createdAt')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: reports
    });
  } catch (error) {
    console.error('Error fetching driver reports:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

/**
 * Get reports for a specific ride
 * @route GET /api/reports/ride/:rideId
 * @access Private/Admin
 */
export const getRideReports = async (req, res) => {
  try {
    const { rideId } = req.params;
    
    const reports = await Report.find({ rideId })
      .populate('driver', 'name profilePicture')
      .populate('reporter', 'name email')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: reports
    });
  } catch (error) {
    console.error('Error fetching ride reports:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};