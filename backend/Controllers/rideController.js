import Ride from '../models/rideModel.js';
import User from '../models/user.js';

// @desc    Get available TODA names
// @route   GET /api/rides/toda-names
// @access  Private
export const getTodaNames = async (req, res) => {
  try {
    // Get unique TODA names from drivers
    const todaNames = await User.distinct('todaName', { 
      role: 'driver',
      todaName: { $exists: true, $ne: '' }
    });

    res.status(200).json({
      success: true,
      todaNames: todaNames.sort(),
    });
  } catch (error) {
    console.error('Error fetching TODA names:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching TODA names',
      error: error.message,
    });
  }
};

// @desc    Book a new ride
// @route   POST /api/rides/book
// @access  Private
export const bookRide = async (req, res) => {
  try {
    const {
      userId,
      firstname,
      lastname,
      pickupLocation,
      dropoffLocation,
      distance,
      fare,
      todaName,
    } = req.body;

    // Validate required fields
    if (!userId || !firstname || !lastname || !pickupLocation || !dropoffLocation || !distance || !fare || !todaName) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields including TODA name',
      });
    }

    // Validate pickup location
    if (!pickupLocation.name || !pickupLocation.latitude || !pickupLocation.longitude) {
      return res.status(400).json({
        success: false,
        message: 'Invalid pickup location data',
      });
    }

    // Validate dropoff location
    if (!dropoffLocation.name || !dropoffLocation.latitude || !dropoffLocation.longitude) {
      return res.status(400).json({
        success: false,
        message: 'Invalid dropoff location data',
      });
    }

    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Create new ride
    const ride = await Ride.create({
      userId,
      firstname,
      lastname,
      pickupLocation,
      dropoffLocation,
      distance,
      fare,
      todaName,
      status: 'pending',
    });

    res.status(201).json({
      success: true,
      message: 'Ride booked successfully',
      ride,
    });
  } catch (error) {
    console.error('Error booking ride:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while booking ride',
      error: error.message,
    });
  }
};

// @desc    Get all rides for a user
// @route   GET /api/rides/user/:userId
// @access  Private
export const getUserRides = async (req, res) => {
  try {
    const { userId } = req.params;

    const rides = await Ride.find({ userId })
      .sort({ createdAt: -1 })
      .populate('driver', 'firstname lastname phone role');

    res.status(200).json({
      success: true,
      count: rides.length,
      rides,
    });
  } catch (error) {
    console.error('Error fetching user rides:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching rides',
      error: error.message,
    });
  }
};

// @desc    Get a single ride by ID
// @route   GET /api/rides/:id
// @access  Private
export const getRideById = async (req, res) => {
  try {
    const { id } = req.params;

    const ride = await Ride.findById(id)
      .populate('userId', 'firstName lastName email')
      .populate('driver', 'firstName lastName phoneNumber todaName licensePlate role');

    if (!ride) {
      return res.status(404).json({
        success: false,
        message: 'Ride not found',
      });
    }

    res.status(200).json({
      success: true,
      ride,
    });
  } catch (error) {
    console.error('Error fetching ride:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching ride',
      error: error.message,
    });
  }
};

// @desc    Get all rides (Admin)
// @route   GET /api/rides
// @access  Private/Admin
export const getAllRides = async (req, res) => {
  try {
    const { status, todaName, page = 1, limit = 10 } = req.query;

    const query = {};

    if (status) query.status = status;
    if (todaName) query.todaName = todaName;
    
    const rides = await Ride.find(query)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .populate('userId', 'firstName lastName email')
      .populate(
        'driver',
        'firstName lastName phoneNumber todaName licensePlate role'
      );

    const total = await Ride.countDocuments(query);

    res.status(200).json({
      success: true,
      count: rides.length,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
      rides,
    });
  } catch (error) {
    console.error('Error fetching all rides:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching rides',
      error: error.message,
    });
  }
};

// @desc    Update ride status
// @route   PUT /api/rides/:id/status
// @access  Private
export const updateRideStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'accepted', 'in-progress', 'completed', 'cancelled'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value',
      });
    }

    const ride = await Ride.findById(id);

    if (!ride) {
      return res.status(404).json({
        success: false,
        message: 'Ride not found',
      });
    }

    ride.status = status;
    await ride.save();

    res.status(200).json({
      success: true,
      message: 'Ride status updated successfully',
      ride,
    });
  } catch (error) {
    console.error('Error updating ride status:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating ride status',
      error: error.message,
    });
  }
};

// @desc    Cancel a ride
// @route   PUT /api/rides/:id/cancel
// @access  Private
export const cancelRide = async (req, res) => {
  try {
    const { id } = req.params;
    const { cancelledBy, cancelledReason } = req.body;

    const ride = await Ride.findById(id);

    if (!ride) {
      return res.status(404).json({
        success: false,
        message: 'Ride not found',
      });
    }

    if (ride.status === 'completed' || ride.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel a ride that is already ${ride.status}`,
      });
    }

    ride.status = 'cancelled';
    ride.cancelledBy = cancelledBy || 'user';
    ride.cancelledReason = cancelledReason || 'No reason provided';
    await ride.save();

    res.status(200).json({
      success: true,
      message: 'Ride cancelled successfully',
      ride,
    });
  } catch (error) {
    console.error('Error cancelling ride:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while cancelling ride',
      error: error.message,
    });
  }
};

// @desc    Assign driver to ride
// @route   PUT /api/rides/:id/assign-driver
// @access  Private/Admin
export const assignDriver = async (req, res) => {
  try {
    const { id } = req.params;
    const { driverId } = req.body;

    if (!driverId) {
      return res.status(400).json({
        success: false,
        message: 'Driver ID is required',
      });
    }

    // Verify the driver exists and has driver role
    const driver = await User.findById(driverId);
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found',
      });
    }

    if (driver.role !== 'driver') {
      return res.status(400).json({
        success: false,
        message: 'User is not a driver',
      });
    }

    const ride = await Ride.findById(id);

    if (!ride) {
      return res.status(404).json({
        success: false,
        message: 'Ride not found',
      });
    }

    ride.driver = driverId;
    ride.status = 'accepted';
    await ride.save();

    // Populate the driver info before sending response
    await ride.populate('driver', 'firstName lastName phoneNumber todaName licensePlate role');

    res.status(200).json({
      success: true,
      message: 'Driver assigned successfully',
      ride,
    });
  } catch (error) {
    console.error('Error assigning driver:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while assigning driver',
      error: error.message,
    });
  }
};

// @desc    Update driver field on ride
// @route   PUT /api/rides/:id/driver
// @access  Private
export const updateRideDriver = async (req, res) => {
  try {
    const { id } = req.params;
    const { driver: driverId } = req.body;

    console.log('📝 Updating ride driver:', { rideId: id, driverId });

    if (!driverId) {
      return res.status(400).json({
        success: false,
        message: 'Driver ID is required',
      });
    }

    // Verify the driver exists
    const driver = await User.findById(driverId);
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found',
      });
    }

    if (driver.role !== 'driver') {
      return res.status(400).json({
        success: false,
        message: 'User is not a driver',
      });
    }

    const ride = await Ride.findById(id);

    if (!ride) {
      return res.status(404).json({
        success: false,
        message: 'Ride not found',
      });
    }

    // Update the driver field
    ride.driver = driverId;
    await ride.save();

    // Populate the driver info before sending response
    await ride.populate('driver', 'firstName lastName phoneNumber todaName licensePlate role');

    console.log('✅ Driver updated successfully:', ride.driver);

    res.status(200).json({
      success: true,
      message: 'Driver updated successfully',
      ride,
    });
  } catch (error) {
    console.error('❌ Error updating ride driver:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating driver',
      error: error.message,
    });
  }
};

// @desc    Delete a ride
// @route   DELETE /api/rides/:id
// @access  Private/Admin
export const deleteRide = async (req, res) => {
  try {
    const { id } = req.params;

    const ride = await Ride.findById(id);

    if (!ride) {
      return res.status(404).json({
        success: false,
        message: 'Ride not found',
      });
    }

    await ride.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Ride deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting ride:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting ride',
      error: error.message,
    });
  }
};