import express from 'express';
import {
  getAllReports,
  getReportById,
  updateReportStatus,
  getReportsByDriver,
  getReportStats,
  banDriver,
  unbanDriver,
} from '../Controllers/reportController.js';

// Import your auth middleware here
// import { protect, adminOnly } from '../middleware/auth.js';

const router = express.Router();

// Apply authentication middleware to all routes
// router.use(protect);
// router.use(adminOnly); // Uncomment to restrict to admins only

/**
 * @route   GET /api/reports
 * @desc    Get all reports with filters and pagination
 * @query   status, severity, reportType, driverId, page, limit
 * @access  Admin
 */
router.get('/', getAllReports);

/**
 * @route   GET /api/reports/stats
 * @desc    Get report statistics for dashboard
 * @access  Admin
 */
router.get('/stats', getReportStats);

/**
 * @route   GET /api/reports/driver/:driverId
 * @desc    Get all reports for a specific driver
 * @access  Admin
 */
router.get('/driver/:driverId', getReportsByDriver);

/**
 * @route   POST /api/reports/ban-driver/:driverId
 * @desc    Ban/suspend a driver
 * @body    reason, duration (in days, null for permanent)
 * @access  Admin
 */
router.post('/:driverId/ban', banDriver);

/**
 * @route   POST /api/reports/unban-driver/:driverId
 * @desc    Unban a driver
 * @access  Admin
 */
router.post('/unban-driver/:driverId', unbanDriver);

/**
 * @route   GET /api/reports/:id
 * @desc    Get single report by ID
 * @access  Admin
 */
router.get('/:id', getReportById);

/**
 * @route   PATCH /api/reports/:id
 * @desc    Update report status/details
 * @body    status, adminNotes, severity
 * @access  Admin
 */
router.patch('/:id', updateReportStatus);

export default router;