import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema({
  rideId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ride',
    required: [true, 'Ride ID is required'],
    index: true
  },
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Driver ID is required'],
    index: true
  },
  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Reporter ID is required'],
    index: true
  },
  reason: {
    type: String,
    required: [true, 'Report reason is required'],
    enum: [
  "Rude or unprofessional behavior",
  "Unsafe driving",
  "Vehicle condition issues",
  "Wrong route taken",
  "Driver asked for extra payment",
  "Driver cancelled without reason",
  "Late arrival",
  "Other",
    ]
  },
  comment: {
    type: String,
    maxLength: [500, 'Comment cannot exceed 500 characters'],
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'investigating', 'resolved', 'dismissed'],
    default: 'pending'
  },
  adminNotes: {
    type: String,
    maxLength: [1000, 'Admin notes cannot exceed 1000 characters'],
    trim: true
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  resolvedAt: {
    type: Date
  },
  reportType: {
    type: String,
    enum: ['driver', 'rider', 'vehicle'],
    default: 'driver'
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
reportSchema.index({ driverId: 1, status: 1 });
reportSchema.index({ reportedBy: 1, createdAt: -1 });
reportSchema.index({ rideId: 1, driverId: 1, reportedBy: 1 }, { unique: true });

// Virtual populate
reportSchema.virtual('ride', {
  ref: 'Ride',
  localField: 'rideId',
  foreignField: '_id',
  justOne: true
});

reportSchema.virtual('driver', {
  ref: 'User',
  localField: 'driverId',
  foreignField: '_id',
  justOne: true
});

reportSchema.virtual('reporter', {
  ref: 'User',
  localField: 'reportedBy',
  foreignField: '_id',
  justOne: true
});

// Prevent duplicate reports
// Remove async and next() - just throw the error directly
reportSchema.pre('save', async function() {
  const existingReport = await this.constructor.findOne({
    rideId: this.rideId,
    driverId: this.driverId,
    reportedBy: this.reportedBy,
    status: { $ne: 'dismissed' }
  });
  
  if (existingReport) {
    throw new Error('You have already reported this driver for this ride');
  }
  // No next() needed - just return normally
});

export const Report = mongoose.model('Report', reportSchema);
export default Report;