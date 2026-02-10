import express from 'express';
import {
  submitDriverReport,
  getAllReports,
  updateReportStatus,
  getMyReports,
  getDriverReports,
  getRideReports
} from '../Controllers/reportController.js';

const router = express.Router();

// Submit driver report
router.post('/driver', submitDriverReport);

// Get user's own reports
router.get('/my-reports', getMyReports);

// Admin routes
router.get('/', getAllReports);
router.get('/driver/:driverId', getDriverReports);
router.get('/ride/:rideId', getRideReports);
router.patch('/:id/status', updateReportStatus);

export default router;