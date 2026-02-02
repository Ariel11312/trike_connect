import mongoose from 'mongoose';

const rideSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Must match your User model name
    required: true,
  },
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Changed from 'driver' to 'User'
  },
  firstname: {
    type: String,
    required: true,
  },
  lastname: {
    type: String,
    required: true,
  },
  pickupLocation: {
    name: String,
    latitude: Number,
    longitude: Number,
  },
  dropoffLocation: {
    name: String,
    latitude: Number,
    longitude: Number,
  },
  distance: {
    type: Number,
    required: true,
  },
  fare: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'in-progress', 'completed', 'cancelled'],
    default: 'pending',
  },
  cancelledBy: String,
  cancelledReason: String,
}, {
  timestamps: true,
});

export default mongoose.model('Ride', rideSchema);