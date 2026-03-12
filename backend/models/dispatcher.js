// ============================================================
//  SCHEMAS — Dispatcher System
//  Stack: Mongoose (MongoDB) — ES Module version
// ============================================================

import mongoose from "mongoose";

const { Schema } = mongoose;

// ─────────────────────────────────────────────────────────────
//  1. DriverQueue
// ─────────────────────────────────────────────────────────────

const DriverQueueSchema = new Schema(
  {
    driverId:    { type: Schema.Types.ObjectId, ref: "User", required: true },
    firstname:   { type: String, required: true },
    lastname:    { type: String, required: true },
    plateNumber: { type: String, required: true },
    todaName:    { type: String, required: true, index: true },

    queuePosition: { type: Number, required: true, min: 1 },

    status: {
      type: String,
      enum: ["available", "assigned", "on-trip", "offline"],
      default: "available",
    },

    joinedAt:      { type: Date, default: Date.now },
    currentRideId: { type: Schema.Types.ObjectId, ref: "Ride", default: null },

    totalTripsToday:    { type: Number, default: 0 },
    totalEarningsToday: { type: Number, default: 0 },

    queueDate: { type: Date, required: true },
  },
  { timestamps: true }
);

DriverQueueSchema.index({ driverId: 1, queueDate: 1 }, { unique: true });
DriverQueueSchema.index({ todaName: 1, queueDate: 1, status: 1 });
DriverQueueSchema.index({ todaName: 1, queueDate: 1, queuePosition: 1 });

export const DriverQueue = mongoose.model("DriverQueue", DriverQueueSchema);

// ─────────────────────────────────────────────────────────────
//  2. DispatchLog
// ─────────────────────────────────────────────────────────────

const DispatchLogSchema = new Schema(
  {
    dispatcherId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    rideId:       { type: Schema.Types.ObjectId, ref: "Ride", required: true },
    driverId:     { type: Schema.Types.ObjectId, ref: "User", required: true },

    assignmentType: {
      type: String,
      enum: ["auto", "manual"],
      required: true,
    },

    driverQueuePositionAtAssignment: { type: Number, required: true },

    outcome: {
      type: String,
      enum: ["completed", "cancelled_by_driver", "cancelled_by_passenger", "pending"],
      default: "pending",
    },

    dispatchedAt: { type: Date, default: Date.now },
    completedAt:  { type: Date, default: null },
  },
  { timestamps: true }
);

DispatchLogSchema.index({ dispatcherId: 1, dispatchedAt: -1 });
DispatchLogSchema.index({ driverId: 1,    dispatchedAt: -1 });
DispatchLogSchema.index({ rideId: 1 });

export const DispatchLog = mongoose.model("DispatchLog", DispatchLogSchema);

// ─────────────────────────────────────────────────────────────
//  3. DispatcherConfig
// ─────────────────────────────────────────────────────────────

const DispatcherConfigSchema = new Schema(
  {
    userId:   { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    todaName: { type: String, required: true },

    autoAssignEnabled:       { type: Boolean, default: true },
    maxRidesShown:           { type: Number,  default: 50   },
    notifyOnNewRide:         { type: Boolean, default: true },
    notifyOnDriverJoinQueue: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const DispatcherConfig = mongoose.model("DispatcherConfig", DispatcherConfigSchema);

// ─────────────────────────────────────────────────────────────
//  4. QueueSession
// ─────────────────────────────────────────────────────────────

const QueueSessionSchema = new Schema(
  {
    driverId:    { type: Schema.Types.ObjectId, ref: "User", required: true },
    todaName:    { type: String, required: true },
    sessionDate: { type: Date,   required: true },

    joinedAt: { type: Date, required: true },
    leftAt:   { type: Date, default: null  },

    totalTrips:      { type: Number, default: 0 },
    totalEarnings:   { type: Number, default: 0 },
    totalDistanceKm: { type: Number, default: 0 },

    completedRideIds: [{ type: Schema.Types.ObjectId, ref: "Ride" }],
  },
  { timestamps: true }
);

QueueSessionSchema.index({ driverId: 1, sessionDate: -1 });
QueueSessionSchema.index({ todaName: 1, sessionDate: -1 });

export const QueueSession = mongoose.model("QueueSession", QueueSessionSchema);

// ─────────────────────────────────────────────────────────────
//  SERVICE HELPERS
// ─────────────────────────────────────────────────────────────

const getToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export async function joinQueue(driverId, driverData) {
  const today = getToday();

  const lastInQueue = await DriverQueue.findOne({
    todaName: driverData.todaName,
    queueDate: today,
    status: { $ne: "offline" },
  }).sort({ queuePosition: -1 });

  const nextPosition = lastInQueue ? lastInQueue.queuePosition + 1 : 1;

  const entry = await DriverQueue.findOneAndUpdate(
    { driverId, queueDate: today },
    {
      ...driverData,
      queuePosition: nextPosition,
      status: "available",
      joinedAt: new Date(),
      currentRideId: null,
      queueDate: today,
    },
    { upsert: true, new: true }
  );

  return entry;
}

export async function assignDriverToRide(queueEntryId, rideId) {
  await DriverQueue.findByIdAndUpdate(queueEntryId, {
    status: "assigned",
    currentRideId: rideId,
  });
}

export async function markDriverOnTrip(driverId) {
  await DriverQueue.findOneAndUpdate(
    { driverId, queueDate: getToday() },
    { status: "on-trip" }
  );
}

export async function markDriverAvailable(driverId, fare, todaName) {
  const today = getToday();

  const lastInQueue = await DriverQueue.findOne({
    todaName,
    queueDate: today,
    status: "available",
  }).sort({ queuePosition: -1 });

  const newPosition = lastInQueue ? lastInQueue.queuePosition + 1 : 1;

  await DriverQueue.findOneAndUpdate(
    { driverId, queueDate: today },
    {
      status: "available",
      currentRideId: null,
      queuePosition: newPosition,
      $inc: { totalTripsToday: 1, totalEarningsToday: fare },
    }
  );
}

export async function getNextAvailableDriver(todaName) {
  return DriverQueue.findOne({
    todaName,
    queueDate: getToday(),
    status: "available",
  }).sort({ queuePosition: 1 });
}