import User from '../models/user.js'; // Adjust the path based on your project structure
import mongoose from 'mongoose';

/**
 * Ban Controller
 * Handles user banning, unbanning, and ban status management
 */

/**
 * Ban a user (permanent or temporary)
 * @route POST /api/admin/users/:userId/ban
 */
export const banUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason, duration, permanent = false } = req.body;
    const adminId = req.user._id; // Assumes admin is authenticated

    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    // Validate ban reason
    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Ban reason is required'
      });
    }

    // Find the user to ban
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent banning admins (optional security measure)
    if (user.role === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Cannot ban admin users'
      });
    }

    // Check if user is already banned
    if (user.isBanned && user.isCurrentlyBanned()) {
      return res.status(400).json({
        success: false,
        message: 'User is already banned'
      });
    }

    // Set ban details
    user.isBanned = true;
    user.banReason = reason.trim();
    user.bannedAt = new Date();
    user.bannedBy = adminId;

    // Handle permanent vs temporary ban
    if (permanent) {
      user.banUntil = null; // null indicates permanent ban
    } else {
      // Validate duration for temporary ban
      if (!duration || duration <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Valid duration (in hours) is required for temporary ban'
        });
      }

      // Set ban expiration
      const banUntilDate = new Date();
      banUntilDate.setHours(banUntilDate.getHours() + duration);
      user.banUntil = banUntilDate;
    }

    await user.save();

    // Populate the bannedBy field for response
    await user.populate('bannedBy', 'firstName lastName email');

    res.status(200).json({
      success: true,
      message: `User has been ${permanent ? 'permanently' : 'temporarily'} banned`,
      data: {
        userId: user._id,
        userName: `${user.firstName} ${user.lastName}`,
        banStatus: permanent ? 'permanently_banned' : 'temporarily_banned',
        banReason: user.banReason,
        bannedAt: user.bannedAt,
        banUntil: user.banUntil,
        bannedBy: user.bannedBy
      }
    });

  } catch (error) {
    console.error('Error banning user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to ban user',
      error: error.message
    });
  }
};

/**
 * Unban a user
 * @route POST /api/admin/users/:userId/unban
 */
export const unbanUser = async (req, res) => {
  try {
    const { userId } = req.params;

    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user is actually banned
    if (!user.isBanned) {
      return res.status(400).json({
        success: false,
        message: 'User is not banned'
      });
    }

    // Clear ban details
    user.isBanned = false;
    user.banReason = null;
    user.bannedAt = null;
    user.banUntil = null;
    user.bannedBy = null;

    await user.save();

    res.status(200).json({
      success: true,
      message: 'User has been unbanned successfully',
      data: {
        userId: user._id,
        userName: `${user.firstName} ${user.lastName}`,
        banStatus: 'active'
      }
    });

  } catch (error) {
    console.error('Error unbanning user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unban user',
      error: error.message
    });
  }
};

/**
 * Get ban status for a specific user
 * @route GET /api/admin/users/:userId/ban-status
 */
export const getBanStatus = async (req, res) => {
  try {
    const { userId } = req.params;

    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    // Find the user
    const user = await User.findById(userId).populate('bannedBy', 'firstName lastName email');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check current ban status
    const isCurrentlyBanned = user.isCurrentlyBanned();

    res.status(200).json({
      success: true,
      data: {
        userId: user._id,
        userName: `${user.firstName} ${user.lastName}`,
        email: user.email,
        isBanned: isCurrentlyBanned,
        banStatus: user.banStatus,
        banReason: user.banReason || null,
        bannedAt: user.bannedAt || null,
        banUntil: user.banUntil || null,
        bannedBy: user.bannedBy || null,
        isPermanentBan: isCurrentlyBanned && !user.banUntil
      }
    });

  } catch (error) {
    console.error('Error getting ban status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get ban status',
      error: error.message
    });
  }
};

/**
 * Get all banned users
 * @route GET /api/admin/users/banned
 */
export const getBannedUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, permanent } = req.query;

    // Build query
    const query = { isBanned: true };
    
    // Filter by permanent/temporary bans if specified
    if (permanent === 'true') {
      query.banUntil = null;
    } else if (permanent === 'false') {
      query.banUntil = { $ne: null };
    }

    // Get total count
    const total = await User.countDocuments(query);

    // Get banned users with pagination
    const bannedUsers = await User.find(query)
      .populate('bannedBy', 'firstName lastName email')
      .select('firstName lastName email phoneNumber role isBanned banReason bannedAt banUntil')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ bannedAt: -1 });

    // Filter out expired temporary bans and format response
    const activeBannedUsers = bannedUsers
      .filter(user => user.isCurrentlyBanned())
      .map(user => ({
        userId: user._id,
        userName: `${user.firstName} ${user.lastName}`,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
        banStatus: user.banStatus,
        banReason: user.banReason,
        bannedAt: user.bannedAt,
        banUntil: user.banUntil,
        bannedBy: user.bannedBy,
        isPermanentBan: !user.banUntil
      }));

    res.status(200).json({
      success: true,
      data: activeBannedUsers,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Error getting banned users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get banned users',
      error: error.message
    });
  }
};

/**
 * Update ban details (extend/shorten duration, update reason)
 * @route PATCH /api/admin/users/:userId/ban
 */
export const updateBan = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason, duration, permanent } = req.body;

    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user is banned
    if (!user.isBanned || !user.isCurrentlyBanned()) {
      return res.status(400).json({
        success: false,
        message: 'User is not currently banned'
      });
    }

    // Update ban reason if provided
    if (reason) {
      user.banReason = reason.trim();
    }

    // Update ban duration/type if provided
    if (permanent !== undefined) {
      if (permanent) {
        user.banUntil = null; // Convert to permanent ban
      } else if (duration && duration > 0) {
        // Convert to temporary ban or extend/shorten duration
        const banUntilDate = new Date();
        banUntilDate.setHours(banUntilDate.getHours() + duration);
        user.banUntil = banUntilDate;
      }
    } else if (duration && duration > 0 && user.banUntil) {
      // Just update duration for existing temporary ban
      const banUntilDate = new Date();
      banUntilDate.setHours(banUntilDate.getHours() + duration);
      user.banUntil = banUntilDate;
    }

    await user.save();
    await user.populate('bannedBy', 'firstName lastName email');

    res.status(200).json({
      success: true,
      message: 'Ban details updated successfully',
      data: {
        userId: user._id,
        userName: `${user.firstName} ${user.lastName}`,
        banStatus: user.banStatus,
        banReason: user.banReason,
        bannedAt: user.bannedAt,
        banUntil: user.banUntil,
        bannedBy: user.bannedBy,
        isPermanentBan: !user.banUntil
      }
    });

  } catch (error) {
    console.error('Error updating ban:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update ban',
      error: error.message
    });
  }
};

/**
 * Middleware to check if user is banned (use in protected routes)
 */
export const checkBanStatus = async (req, res, next) => {
  try {
    const userId = req.user._id; // Assumes user is authenticated

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.isCurrentlyBanned()) {
      const banMessage = user.banUntil 
        ? `Your account is temporarily banned until ${user.banUntil.toLocaleString()}. Reason: ${user.banReason}`
        : `Your account has been permanently banned. Reason: ${user.banReason}`;

      return res.status(403).json({
        success: false,
        message: banMessage,
        banDetails: {
          isBanned: true,
          banReason: user.banReason,
          bannedAt: user.bannedAt,
          banUntil: user.banUntil,
          isPermanentBan: !user.banUntil
        }
      });
    }

    next();
  } catch (error) {
    console.error('Error checking ban status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check ban status',
      error: error.message
    });
  }
};

export default {
  banUser,
  unbanUser,
  getBanStatus,
  getBannedUsers,
  updateBan,
  checkBanStatus
};