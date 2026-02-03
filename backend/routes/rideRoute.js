import express from 'express';
import {
  bookRide,
  getUserRides,
  getRideById,
  getAllRides,
  updateRideStatus,
  cancelRide,
  assignDriver,
  updateRideDriver,
  deleteRide,
  getTodaNames,
} from '../Controllers/rideController.js';
import { protect } from '../auth/auth.js';

const router = express.Router();

// Public routes (with auth)
router.post('/book', protect, bookRide);
router.get('/toda-names', getTodaNames);
router.get('/user/:userId', protect, getUserRides);
router.get('/:id', protect, getRideById);
router.get('/', protect, getAllRides);

// Update routes
router.put('/:id/status', protect, updateRideStatus);
router.put('/:id/driver', protect, updateRideDriver); // NEW ROUTE
router.put('/:id/cancel', protect, cancelRide);
router.put('/:id/assign-driver', protect, assignDriver);

// Delete route
router.delete('/:id', protect, deleteRide);

export default router;