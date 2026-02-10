import express from 'express';
import {
  getAllRegistrations,
  getRegistrationById,
  createRegistration,
  uploadDocument,
  approveRegistration,
  rejectRegistration,
  verifyDocument,
  getRegistrationStats,
  deleteRegistration,
  getMyRegistration
} from '../Controllers/driverRegController.js';
import { protect } from '../auth/auth.js';

const router = express.Router();

// Public routes (none for this resource)

// Protected routes - require authentication
router.use(protect);

// User routes - for drivers/commuters applying
router.get('/my-registration', getMyRegistration);
router.post('/', createRegistration);
router.post('/:id/documents', uploadDocument);

// Admin only routes
router.get('/stats',  getRegistrationStats);
router.get('/',  getAllRegistrations);
router.get('/:id',  getRegistrationById);
router.put('/:id/approve',  approveRegistration);
router.put('/:id/reject',  rejectRegistration);
router.put('/:id/documents/:documentId/verify',  verifyDocument);
router.delete('/:id',  deleteRegistration);

export default router;