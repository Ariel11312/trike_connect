import Ride from '../models/rideModel.js';
import User from '../models/user.js';
import {
  DriverQueue,
  DispatchLog,
  DispatcherConfig,
  QueueSession,
  joinQueue,
  assignDriverToRide,
  markDriverOnTrip,
  markDriverAvailable,
  getNextAvailableDriver,
} from '../models/dispatcher.js'; // ← fixed: was "dispatcher,js"
import { io, emitToUser } from '../server.js';

// ─────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────

const getToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const emitToDriver = (req, driverId, event, data) => {
  try {
    const io = req.app.get('io');
    if (io) io.to(driverId.toString()).emit(event, data);
  } catch (e) {
    console.error('Socket emit error:', e.message);
  }
};

const emitToAll = (req, event, data) => {
  try {
    const io = req.app.get('io');
    if (io) io.emit(event, data);
  } catch (e) {
    console.error('Socket emit error:', e.message);
  }
};

// =============================================================
//  QUEUE CONTROLLERS
// =============================================================

// @desc    Get all drivers in queue for a TODA
// @route   GET /api/dispatcher/queue?todaName=
// @access  Private
export const getQueue = async (req, res) => {
  try {
    const { todaName } = req.query;
    if (!todaName) {
      return res.status(400).json({ success: false, message: 'todaName is required' });
    }

    const queue = await DriverQueue.find({
      todaName,
      queueDate: getToday(),
      status: { $ne: 'offline' },
    })
      .sort({ queuePosition: 1 })
      .lean();

    return res.status(200).json({ success: true, queue });
  } catch (error) {
    console.error('getQueue error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Get current queue entry for a specific driver today
// @route   GET /api/dispatcher/queue/driver/:driverId
// @access  Private
export const getDriverQueueEntry = async (req, res) => {
  try {
    const { driverId } = req.params;

    const entry = await DriverQueue.findOne({
      driverId,
      queueDate: getToday(),
      status: { $ne: 'offline' },
    }).lean();

    return res.status(200).json({ success: true, entry: entry || null });
  } catch (error) {
    console.error('getDriverQueueEntry error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Driver joins the TODA queue
// @route   POST /api/dispatcher/queue/join
// @access  Private
export const joinDriverQueue = async (req, res) => {
  try {
    const { driverId, firstname, lastname, plateNumber, todaName } = req.body;

    if (!driverId || !todaName) {
      return res.status(400).json({
        success: false,
        message: 'driverId and todaName are required',
      });
    }

    // Check if already in queue today
    const existing = await DriverQueue.findOne({
      driverId,
      queueDate: getToday(),
      status: { $ne: 'offline' },
    });

    if (existing) {
      return res.status(200).json({ success: true, entry: existing, message: 'Already in queue' });
    }

    // Join queue
    const entry = await joinQueue(driverId, { firstname, lastname, plateNumber, todaName });

    // Create or update QueueSession
    await QueueSession.findOneAndUpdate(
      { driverId, sessionDate: getToday() },
      { driverId, todaName, sessionDate: getToday(), joinedAt: new Date(), leftAt: null },
      { upsert: true, new: true }
    );

    emitToAll(req, 'driver-queue-update', { todaName });

    return res.status(201).json({
      success: true,
      entry,
      message: `Joined queue at position #${entry.queuePosition}`,
    });
  } catch (error) {
    console.error('joinDriverQueue error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Dispatcher manually assigns a queued driver to a ride
// @route   PUT /api/dispatcher/queue/:id/assign
// @access  Private
export const assignQueuedDriver = async (req, res) => {
  try {
    const { id }      = req.params;
    const { rideId }  = req.body;
    const dispatcherId = (req.user?.id || req.user?._id)?.toString();

    if (!rideId) {
      return res.status(400).json({ success: false, message: 'rideId is required' });
    }

    const queueEntry = await DriverQueue.findById(id);
    if (!queueEntry) {
      return res.status(404).json({ success: false, message: 'Queue entry not found' });
    }

    if (queueEntry.status !== 'available') {
      return res.status(400).json({
        success: false,
        message: `Driver is currently "${queueEntry.status}", not available`,
      });
    }

    const ride = await Ride.findById(rideId);
    if (!ride) {
      return res.status(404).json({ success: false, message: 'Ride not found' });
    }

    if (ride.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Ride is already "${ride.status}"`,
      });
    }

    // ── Assign driver to ride ──────────────────────────────────────────────
    ride.driver         = queueEntry.driverId;
    ride.status         = 'accepted';
    ride.dispatchedBy   = dispatcherId;
    ride.assignmentType = 'manual';
    await ride.save();

    // ── Update queue entry ─────────────────────────────────────────────────
    await DriverQueue.findByIdAndUpdate(id, {
      status:        'assigned',
      currentRideId: rideId,
    });

    // ── Audit log ──────────────────────────────────────────────────────────
    await DispatchLog.create({
      dispatcherId,
      rideId,
      driverId:                        queueEntry.driverId,
      assignmentType:                  'manual',
      driverQueuePositionAtAssignment: queueEntry.queuePosition,
      outcome:                         'pending',
      dispatchedAt:                    new Date(),
    });

    // ── Populate ride for socket payload ───────────────────────────────────
    await ride.populate('driver', 'firstName lastName phoneNumber todaName licensePlate role');
    await ride.populate('userId', 'firstName lastName phoneNumber');

    // ── Emit to driver ─────────────────────────────────────────────────────
    const emitted = emitToUser(queueEntry.driverId, 'ride-assigned-by-dispatcher', {
      rideId: ride._id.toString(),
      ride:   ride.toObject(),
    });

    // ── Broadcast queue update to dispatcher UI ────────────────────────────
    io.emit('driver-queue-update', { todaName: queueEntry.todaName });

    return res.status(200).json({
      success:        true,
      message:        `${queueEntry.firstname} ${queueEntry.lastname} assigned to ride`,
      driverNotified: emitted,
      ride,
    });

  } catch (error) {
    console.error('assignQueuedDriver error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error:   error.message,
    });
  }
};

// @desc    Auto-assign next available driver in queue to a ride
// @route   PUT /api/dispatcher/queue/auto-assign
// @access  Private
export const autoAssignDriver = async (req, res) => {
  try {
    const { rideId, todaName } = req.body;
    const dispatcherId = req.user?.id || req.user?._id;

    if (!rideId || !todaName) {
      return res.status(400).json({
        success: false,
        message: 'rideId and todaName are required',
      });
    }

    const nextDriver = await getNextAvailableDriver(todaName);
    if (!nextDriver) {
      return res.status(404).json({
        success: false,
        message: 'No available drivers in queue right now',
      });
    }

    const ride = await Ride.findById(rideId);
    if (!ride) {
      return res.status(404).json({ success: false, message: 'Ride not found' });
    }

    if (ride.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Ride is already ${ride.status}`,
      });
    }

    // Update ride — same pattern as rideController.assignDriver
    ride.driver = nextDriver.driverId;
    ride.status = 'accepted';
    ride.dispatchedBy = dispatcherId;
    ride.assignmentType = 'auto';
    await ride.save();

    // Update queue entry
    await assignDriverToRide(nextDriver._id, rideId);

    // Audit log
    await DispatchLog.create({
      dispatcherId,
      rideId,
      driverId: nextDriver.driverId,
      assignmentType: 'auto',
      driverQueuePositionAtAssignment: nextDriver.queuePosition,
      outcome: 'pending',
      dispatchedAt: new Date(),
    });

    // Populate and notify driver
    await ride.populate('driver', 'firstName lastName phoneNumber todaName licensePlate role');
    emitToDriver(req, nextDriver.driverId, 'ride-assigned-by-dispatcher', {
      rideId,
      ride: ride.toObject(),
    });
    emitToAll(req, 'driver-queue-update', { todaName });

    return res.status(200).json({
      success: true,
      message: `Auto-assigned to ${nextDriver.firstname} ${nextDriver.lastname} (Queue #${nextDriver.queuePosition})`,
      driver: {
        name: `${nextDriver.firstname} ${nextDriver.lastname}`,
        plateNumber: nextDriver.plateNumber,
        queuePosition: nextDriver.queuePosition,
      },
      ride,
    });
  } catch (error) {
    console.error('autoAssignDriver error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Remove a driver from the queue
// @route   DELETE /api/dispatcher/queue/:id
// @access  Private
export const removeFromQueue = async (req, res) => {
  try {
    const { id } = req.params;

    const entry = await DriverQueue.findById(id);
    if (!entry) {
      return res.status(404).json({ success: false, message: 'Queue entry not found' });
    }

    if (entry.status === 'on-trip') {
      return res.status(400).json({
        success: false,
        message: 'Cannot remove driver while on trip',
      });
    }

    // Mark offline (preserve daily stats)
    await DriverQueue.findByIdAndUpdate(id, { status: 'offline' });

    // Update session
    await QueueSession.findOneAndUpdate(
      { driverId: entry.driverId, sessionDate: getToday() },
      { leftAt: new Date() }
    );

    // Re-number remaining drivers
    const remaining = await DriverQueue.find({
      todaName: entry.todaName,
      queueDate: getToday(),
      status: { $ne: 'offline' },
    }).sort({ queuePosition: 1 });

    for (let i = 0; i < remaining.length; i++) {
      await DriverQueue.findByIdAndUpdate(remaining[i]._id, { queuePosition: i + 1 });
    }

    emitToAll(req, 'driver-queue-update', { todaName: entry.todaName });
    emitToDriver(req, entry.driverId, 'queue-position-updated', { entry: null });

    return res.status(200).json({ success: true, message: 'Driver removed from queue' });
  } catch (error) {
    console.error('removeFromQueue error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Mark driver as on-trip when they pick up a passenger
// @route   PUT /api/dispatcher/queue/driver/:driverId/on-trip
// @access  Private
export const markOnTrip = async (req, res) => {
  try {
    const { driverId } = req.params;

    await markDriverOnTrip(driverId);

    const entry = await DriverQueue.findOne({ driverId, queueDate: getToday() }).lean();
    emitToAll(req, 'driver-queue-update', { todaName: entry?.todaName });

    return res.status(200).json({ success: true, message: 'Driver marked as on-trip' });
  } catch (error) {
    console.error('markOnTrip error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Mark driver as available again after trip completes
// @route   PUT /api/dispatcher/queue/driver/:driverId/available
// @access  Private
export const markAvailable = async (req, res) => {
  try {
    const { driverId } = req.params;
    const { fare = 0, todaName, rideId } = req.body;

    await markDriverAvailable(driverId, fare, todaName);

    // Update session stats
    await QueueSession.findOneAndUpdate(
      { driverId, sessionDate: getToday() },
      {
        $inc: { totalTrips: 1, totalEarnings: fare },
        ...(rideId && { $push: { completedRideIds: rideId } }),
      }
    );

    // Mark dispatch log as completed
    if (rideId) {
      await DispatchLog.findOneAndUpdate(
        { rideId, driverId },
        { outcome: 'completed', completedAt: new Date() }
      );
    }

    const updatedEntry = await DriverQueue.findOne({ driverId, queueDate: getToday() }).lean();

    emitToAll(req, 'driver-queue-update', { todaName });
    emitToDriver(req, driverId, 'queue-position-updated', { entry: updatedEntry });

    return res.status(200).json({
      success: true,
      message: 'Driver is available again',
      entry: updatedEntry,
    });
  } catch (error) {
    console.error('markAvailable error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// =============================================================
//  CONFIG CONTROLLERS
// =============================================================

// @desc    Get dispatcher config
// @route   GET /api/dispatcher/config
// @access  Private
export const getDispatcherConfig = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;

    let config = await DispatcherConfig.findOne({ userId }).lean();
    if (!config) {
      config = await DispatcherConfig.create({
        userId,
        todaName: req.user?.todaName || '',
      });
    }

    return res.status(200).json({ success: true, config });
  } catch (error) {
    console.error('getDispatcherConfig error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Update dispatcher config
// @route   PUT /api/dispatcher/config
// @access  Private
export const updateDispatcherConfig = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { autoAssignEnabled, notifyOnNewRide, notifyOnDriverJoinQueue, maxRidesShown } = req.body;

    const config = await DispatcherConfig.findOneAndUpdate(
      { userId },
      { autoAssignEnabled, notifyOnNewRide, notifyOnDriverJoinQueue, maxRidesShown },
      { upsert: true, new: true }
    );

    return res.status(200).json({ success: true, config });
  } catch (error) {
    console.error('updateDispatcherConfig error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// =============================================================
//  LOGS & STATS CONTROLLERS
// =============================================================

// @desc    Get paginated dispatch logs
// @route   GET /api/dispatcher/logs?limit=50&page=1
// @access  Private
export const getDispatchLogs = async (req, res) => {
  try {
    const dispatcherId = req.user?.id || req.user?._id;
    const limit = parseInt(req.query.limit) || 50;
    const page  = parseInt(req.query.page)  || 1;
    const skip  = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      DispatchLog.find({ dispatcherId })
        .sort({ dispatchedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('rideId',   'pickupLocation dropoffLocation fare distance')
        .populate('driverId', 'firstName lastName plateNumber')
        .lean(),
      DispatchLog.countDocuments({ dispatcherId }),
    ]);

    return res.status(200).json({
      success: true,
      count: logs.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      logs,
    });
  } catch (error) {
    console.error('getDispatchLogs error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Get today's dispatcher stats
// @route   GET /api/dispatcher/stats?todaName=
// @access  Private
export const getDispatcherStats = async (req, res) => {
  try {
    const { todaName } = req.query;
    const today = getToday();

    const [totalDriversInQueue, availableDrivers, onTripDrivers, assignedDrivers, sessions] =
      await Promise.all([
        DriverQueue.countDocuments({ todaName, queueDate: today, status: { $ne: 'offline' } }),
        DriverQueue.countDocuments({ todaName, queueDate: today, status: 'available' }),
        DriverQueue.countDocuments({ todaName, queueDate: today, status: 'on-trip' }),
        DriverQueue.countDocuments({ todaName, queueDate: today, status: 'assigned' }),
        QueueSession.find({ todaName, sessionDate: today }).lean(),
      ]);

    const totalTripsToday    = sessions.reduce((sum, s) => sum + s.totalTrips, 0);
    const totalEarningsToday = sessions.reduce((sum, s) => sum + s.totalEarnings, 0);

    return res.status(200).json({
      success: true,
      stats: {
        totalDriversInQueue,
        availableDrivers,
        onTripDrivers,
        assignedDrivers,
        totalTripsToday,
        totalEarningsToday,
      },
    });
  } catch (error) {
    console.error('getDispatcherStats error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Get all driver queue sessions for today
// @route   GET /api/dispatcher/queue/sessions?todaName=
// @access  Private
export const getQueueSessions = async (req, res) => {
  try {
    const { todaName } = req.query;

    const sessions = await QueueSession.find({ todaName, sessionDate: getToday() })
      .populate('driverId', 'firstName lastName plateNumber')
      .lean();

    return res.status(200).json({ success: true, count: sessions.length, sessions });
  } catch (error) {
    console.error('getQueueSessions error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};