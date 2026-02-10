import Report from '../models/report.js';
import User from '../models/user.js';
import Ride from '../models/rideModel.js';
import { mongoose } from 'mongoose';

/**
 * Generate initials from first and last name
 * @param {string} firstName 
 * @param {string} lastName 
 * @returns {string} Initials (e.g., "JD" for John Doe)
 */
const generateInitials = (firstName, lastName) => {
  const firstInitial = firstName?.charAt(0).toUpperCase() || '';
  const lastInitial = lastName?.charAt(0).toUpperCase() || '';
  return `${firstInitial}${lastInitial}`;
};

/**
 * Get all reports with populated user information
 * @route GET /api/reports
 * @access Admin only (add auth middleware)
 */
export const getAllReports = async (req, res) => {
  try {
    const { status, severity, reportType, driverId, page = 1, limit = 20 } = req.query;

    // Build filter query
    const filter = {};
    if (status) filter.status = status;
    if (severity) filter.severity = severity;
    if (reportType) filter.reportType = reportType;
    if (driverId) filter.driverId = driverId;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Fetch reports with pagination and populate references
    const [reports, totalReports] = await Promise.all([
      Report.find(filter)
        .populate('driverId', 'firstName lastName email phoneNumber idCardImage todaName licensePlate')
        .populate('reportedBy', 'firstName lastName email phoneNumber idCardImage')
        .populate('rideId', 'pickupLocation dropoffLocation fare distance todaName status')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Report.countDocuments(filter)
    ]);

    // Format the response with proper names and initials
    const formattedReports = reports.map(report => {
      const driver = report.driverId;
      const reporter = report.reportedBy;
      const ride = report.rideId;

      return {
        _id: report._id,
        rideId: report.rideId?._id || report.rideId,
        driverId: report.driverId?._id || report.driverId,
        reportedBy: report.reportedBy?._id || report.reportedBy,
        reason: report.reason,
        comment: report.comment,
        status: report.status,
        reportType: report.reportType,
        severity: report.severity,
        adminNotes: report.adminNotes,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        
        // Driver information
        driverName: driver ? `${driver.firstName} ${driver.lastName}` : 'Unknown Driver',
        driverEmail: driver?.email || '',
        driverPhone: driver?.phoneNumber || '',
        driverInitials: driver ? generateInitials(driver.firstName, driver.lastName) : '??',
        driverProfilePic: driver?.idCardImage || null,
        driverTodaName: driver?.todaName || '',
        driverLicensePlate: driver?.licensePlate || '',
        
        // Reporter information
        reporterName: reporter ? `${reporter.firstName} ${reporter.lastName}` : 'Unknown User',
        reporterEmail: reporter?.email || '',
        reporterPhone: reporter?.phoneNumber || '',
        reporterInitials: reporter ? generateInitials(reporter.firstName, reporter.lastName) : '??',
        reporterProfilePic: reporter?.idCardImage || null,
        
        // Ride information
        rideDetails: ride ? {
          pickupLocation: ride.pickupLocation,
          dropoffLocation: ride.dropoffLocation,
          fare: ride.fare,
          distance: ride.distance,
          todaName: ride.todaName,
          status: ride.status,
        } : null,
      };
    });

    res.status(200).json({
      success: true,
      data: formattedReports,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalReports,
        pages: Math.ceil(totalReports / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reports',
      error: error.message,
    });
  }
};

/**
 * Get a single report by ID with full details
 * @route GET /api/reports/:id
 * @access Admin only (add auth middleware)
 */
export const getReportById = async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch the report
    const report = await Report.findById(id).lean();

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found',
      });
    }

    // Fetch driver information
    const driver = await User.findById(report.driverId)
      .select('firstName lastName email phoneNumber todaName licensePlate driversLicense sapiId idCardImage address role')
      .lean();

    // Fetch reporter information
    const reporter = await User.findById(report.reportedBy)
      .select('firstName lastName email phoneNumber idCardImage role')
      .lean();

    // Fetch ride information
    const ride = await Ride.findById(report.rideId)
      .select('pickupLocation dropoffLocation fare distance todaName status createdAt completedAt')
      .lean();

    // Fetch resolved by admin (if resolved)
    let resolvedByAdmin = null;
    if (report.resolvedBy) {
      resolvedByAdmin = await User.findById(report.resolvedBy)
        .select('firstName lastName email')
        .lean();
    }

    const populatedReport = {
      ...report,
      driver: driver ? {
        id: driver._id,
        name: `${driver.firstName} ${driver.lastName}`,
        email: driver.email,
        phone: driver.phoneNumber,
        initials: generateInitials(driver.firstName, driver.lastName),
        profilePic: driver.idCardImage || null,
        todaName: driver.todaName,
        licensePlate: driver.licensePlate,
        driversLicense: driver.driversLicense,
        sapiId: driver.sapiId,
        address: driver.address,
        role: driver.role,
      } : null,
      
      reporter: reporter ? {
        id: reporter._id,
        name: `${reporter.firstName} ${reporter.lastName}`,
        email: reporter.email,
        phone: reporter.phoneNumber,
        initials: generateInitials(reporter.firstName, reporter.lastName),
        profilePic: reporter.idCardImage || null,
        role: reporter.role,
      } : null,
      
      ride: ride || null,
      
      resolvedBy: resolvedByAdmin ? {
        id: resolvedByAdmin._id,
        name: `${resolvedByAdmin.firstName} ${resolvedByAdmin.lastName}`,
        email: resolvedByAdmin.email,
      } : null,
    };

    res.status(200).json({
      success: true,
      data: populatedReport,
    });
  } catch (error) {
    console.error('Error fetching report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch report',
      error: error.message,
    });
  }
};

/**
 * Update report status (resolve, dismiss, investigate)
 * @route PATCH /api/reports/:id
 * @access Admin only (add auth middleware)
 */
export const updateReportStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNotes, severity } = req.body;
    const adminId = req.user._id; // Assuming auth middleware attaches user

    // Validate status
    const validStatuses = ['pending', 'investigating', 'resolved', 'dismissed'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value',
      });
    }

    const updateData = {};
    if (status) updateData.status = status;
    if (adminNotes) updateData.adminNotes = adminNotes;
    if (severity) updateData.severity = severity;

    // If resolving, add resolved metadata
    if (status === 'resolved' || status === 'dismissed') {
      updateData.resolvedBy = adminId;
      updateData.resolvedAt = new Date();
    }

    const report = await Report.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Report updated successfully',
      data: report,
    });
  } catch (error) {
    console.error('Error updating report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update report',
      error: error.message,
    });
  }
};

/**
 * Get reports by driver ID
 * @route GET /api/reports/driver/:driverId
 * @access Admin only
 */
export const getReportsByDriver = async (req, res) => {
  try {
    const { driverId } = req.params;

    const reports = await Report.find({ driverId })
      .sort({ createdAt: -1 })
      .lean();

    // Populate reporter names
    const populatedReports = await Promise.all(
      reports.map(async (report) => {
        const reporter = await User.findById(report.reportedBy)
          .select('firstName lastName')
          .lean();

        return {
          ...report,
          reporterName: reporter ? `${reporter.firstName} ${reporter.lastName}` : 'Unknown User',
          reporterInitials: reporter ? generateInitials(reporter.firstName, reporter.lastName) : '??',
        };
      })
    );

    // Calculate statistics
    const stats = {
      total: reports.length,
      pending: reports.filter(r => r.status === 'pending').length,
      resolved: reports.filter(r => r.status === 'resolved').length,
      dismissed: reports.filter(r => r.status === 'dismissed').length,
      high: reports.filter(r => r.severity === 'high').length,
      medium: reports.filter(r => r.severity === 'medium').length,
      low: reports.filter(r => r.severity === 'low').length,
    };

    res.status(200).json({
      success: true,
      data: populatedReports,
      stats,
    });
  } catch (error) {
    console.error('Error fetching driver reports:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch driver reports',
      error: error.message,
    });
  }
};

/**
 * Get report statistics/dashboard data
 * @route GET /api/reports/stats
 * @access Admin only
 */
export const getReportStats = async (req, res) => {
  try {
    const totalReports = await Report.countDocuments();
    const pendingReports = await Report.countDocuments({ status: 'pending' });
    const resolvedReports = await Report.countDocuments({ status: 'resolved' });
    const dismissedReports = await Report.countDocuments({ status: 'dismissed' });
    
    const highSeverity = await Report.countDocuments({ severity: 'high' });
    const mediumSeverity = await Report.countDocuments({ severity: 'medium' });
    const lowSeverity = await Report.countDocuments({ severity: 'low' });

    // Most reported drivers
    const mostReportedDrivers = await Report.aggregate([
      { $group: { _id: '$driverId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);

    // Populate driver names
    const driversWithNames = await Promise.all(
      mostReportedDrivers.map(async (item) => {
        const driver = await User.findById(item._id)
          .select('firstName lastName todaName')
          .lean();
        return {
          driverId: item._id,
          driverName: driver ? `${driver.firstName} ${driver.lastName}` : 'Unknown',
          todaName: driver?.todaName || '',
          reportCount: item.count,
          initials: driver ? generateInitials(driver.firstName, driver.lastName) : '??',
        };
      })
    );

    res.status(200).json({
      success: true,
      data: {
        overview: {
          total: totalReports,
          pending: pendingReports,
          resolved: resolvedReports,
          dismissed: dismissedReports,
        },
        severity: {
          high: highSeverity,
          medium: mediumSeverity,
          low: lowSeverity,
        },
        mostReportedDrivers: driversWithNames,
      },
    });
  } catch (error) {
    console.error('Error fetching report stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch report statistics',
      error: error.message,
    });
  }
};

/**
 * Ban/suspend a driver
 * @route POST /api/reports/ban-driver/:driverId
 * @access Admin only
 */
export const banDriver = async (req, res) => {
  try {
    const { driverId } = req.params;
    const { reason, duration, rideId } = req.body;
    const adminId = req.user?._id;

    console.log('Attempting to ban driver with ID:', driverId);
    console.log('ID type:', typeof driverId);

    // Try to find the driver - MongoDB should auto-convert string to ObjectId
    const driver = await User.findById(driverId);
    
    console.log('Driver found:', driver ? 'Yes' : 'No');
    
    if (!driver) {
      // Try alternative search by converting to string explicitly
      const driverByString = await User.findOne({ _id: driverId });
      console.log('Driver found by string search:', driverByString ? 'Yes' : 'No');
      return res.status(404).json({
        success: false,
        message: 'Driver not found',
        searchedId: driverId,
      });
    }

    if (driver.role !== 'driver') {
      return res.status(400).json({
        success: false,
        message: 'User is not a driver',
      });
    }

    const banUntil = duration ? new Date(Date.now() + duration * 24 * 60 * 60 * 1000) : null;
    
    driver.isBanned = true;
    driver.banReason = reason || 'Multiple violations';
    driver.bannedAt = new Date();
    driver.banUntil = banUntil;
    driver.bannedBy = adminId;

    const ride = await Report.findOneAndUpdate(
       { rideId: new mongoose.Types.ObjectId(rideId) },
    { status: 'resolved' },
    { new: true }
);

if (!ride) {
    return res.status(404).json({ message: 'Ride report not found' });
}
    await driver.save();

    await Ride.updateMany(
      { driver: driverId, status: { $in: ['pending', 'accepted'] } },
      { 
        status: 'cancelled',
        cancelledBy: 'admin',
        cancelledReason: 'Driver has been suspended'
      }
    );

    res.status(200).json({
      success: true,
      message: `Driver ${driver.firstName} ${driver.lastName} has been ${banUntil ? 'suspended' : 'banned permanently'}`,
      data: {
        driverId: driver._id,
        driverName: `${driver.firstName} ${driver.lastName}`,
        isBanned: driver.isBanned,
        bannedAt: driver.bannedAt,
        banUntil: driver.banUntil,
        banReason: driver.banReason,
      },
    });
  } catch (error) {
    console.error('Error banning driver:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to ban driver',
      error: error.message,
    });
  }
};

/**
 * Unban a driver
 * @route POST /api/reports/unban-driver/:driverId
 * @access Admin only
 */
export const unbanDriver = async (req, res) => {
  try {
    const { driverId } = req.params;

    const driver = await User.findById(driverId);
    
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found',
      });
    }

    driver.isBanned = false;
    driver.banReason = null;
    driver.bannedAt = null;
    driver.banUntil = null;
    driver.bannedBy = null;
    
    await driver.save();

    res.status(200).json({
      success: true,
      message: `Driver ${driver.firstName} ${driver.lastName} has been unbanned`,
      data: {
        driverId: driver._id,
        driverName: `${driver.firstName} ${driver.lastName}`,
        isBanned: driver.isBanned,
      },
    });
  } catch (error) {
    console.error('Error unbanning driver:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unban driver',
      error: error.message,
    });
  }
};

export default {
  getAllReports,
  getReportById,
  updateReportStatus,
  getReportsByDriver,
  getReportStats,
  banDriver,
  unbanDriver,
};