import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['id_front', 'id_back', 'driver_license', 'vehicle_registration', 'insurance'],
    required: true
  },
  url: {
    type: String,
    required: true
  },
  verified: {
    type: Boolean,
    default: false
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  }
});

const driverRegistrationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  driverName: {
    type: String,
    required: [true, 'Please provide driver name'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Please provide email'],
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    required: [true, 'Please provide phone number'],
    trim: true
  },
  vehicleType: {
    type: String,
    enum: ['Sedan', 'SUV', 'Hatchback', 'Van', 'Truck'],
    required: true
  },
  vehicleMake: {
    type: String,
    required: [true, 'Please provide vehicle make'],
    trim: true
  },
  vehicleModel: {
    type: String,
    required: [true, 'Please provide vehicle model'],
    trim: true
  },
  vehicleYear: {
    type: Number,
    required: [true, 'Please provide vehicle year'],
    min: 1900,
    max: new Date().getFullYear() + 1
  },
  licensePlate: {
    type: String,
    required: [true, 'Please provide license plate'],
    trim: true,
    uppercase: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  documentsVerified: {
    type: Boolean,
    default: false
  },
  backgroundCheckStatus: {
    type: String,
    enum: ['pending', 'approved', 'failed'],
    default: 'pending'
  },
  documents: [documentSchema],
  profileImage: {
    type: String,
    trim: true
  },
  rejectionReason: {
    type: String,
    trim: true
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: {
    type: Date
  },
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rejectedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Index for faster queries
driverRegistrationSchema.index({ status: 1, createdAt: -1 });
driverRegistrationSchema.index({ user: 1 });
driverRegistrationSchema.index({ email: 1 });

// Check if all required documents are uploaded
driverRegistrationSchema.methods.hasAllRequiredDocuments = function() {
  const requiredDocs = ['id_front', 'id_back', 'driver_license', 'vehicle_registration'];
  const uploadedTypes = this.documents.map(doc => doc.type);
  return requiredDocs.every(type => uploadedTypes.includes(type));
};

// Check if all documents are verified
driverRegistrationSchema.methods.areAllDocumentsVerified = function() {
  if (this.documents.length === 0) return false;
  return this.documents.every(doc => doc.verified);
};

// Auto-update documentsVerified field
driverRegistrationSchema.pre('save', function(next) {
  if (this.isModified('documents')) {
    this.documentsVerified = this.areAllDocumentsVerified();
  }
  next();
});

const DriverRegistration = mongoose.model('DriverRegistration', driverRegistrationSchema);

export default DriverRegistration;