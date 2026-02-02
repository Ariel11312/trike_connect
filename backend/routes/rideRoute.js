import express from 'express';
import {
  bookRide,
  getUserRides,
  getRideById,
  getAllRides,
  updateRideStatus,
  cancelRide,
  assignDriver,
  deleteRide,
} from '../Controllers/rideController.js';
import { protect } from '../auth/auth.js';

const router = express.Router();

// Public routes (with authentication)
router.post('/book', protect, bookRide);
router.get('/user/:userId', protect, getUserRides);
router.get('/:id', getRideById);
router.put('/:id/status', protect, updateRideStatus);
router.put('/:id/cancel', protect, cancelRide);

// Admin routes (add admin middleware if you have one)
router.get('/', protect, getAllRides);
router.put('/:id/assign-driver', protect, assignDriver);
router.delete('/:id', protect, deleteRide);

export default router;