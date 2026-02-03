import mongoose from 'mongoose';

const rideSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
  },
  firstname: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
  },
  lastname: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
  },
  pickupLocation: {
    name: { type: String, required: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
  },
  dropoffLocation: {
    name: { type: String, required: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
  },
  distance: {
    type: Number,
    required: [true, 'Distance is required'],
  },
  fare: {
    type: Number,
    required: [true, 'Fare is required'],
  },
  todaName: {
    type: String,
    required: [true, 'TODA name is required'],
    trim: true,
  },
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'in-progress', 'completed', 'cancelled'],
    default: 'pending',
  },
  cancelledBy: {
    type: String,
    enum: ['user', 'driver', 'admin'],
  },
  cancelledReason: {
    type: String,
  },
}, { 
  timestamps: true 
});

// Index for faster queries
rideSchema.index({ userId: 1, createdAt: -1 });
rideSchema.index({ driver: 1, createdAt: -1 });
rideSchema.index({ status: 1 });
rideSchema.index({ todaName: 1 });

const Ride = mongoose.model('Ride', rideSchema);
export default Ride;