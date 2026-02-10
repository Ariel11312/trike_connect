import { Router } from 'express';
const router = Router();
import Chat from '../models/chat.js';
import Message from '../models/message.js';
import {protect} from '../auth/auth.js';

// POST /api/messages/new-message
router.post('/new-message', protect, async (req, res) => {
  try {
    const { chatId, sender, text, type = 'text' } = req.body;

    // Validation
    if (!chatId || !sender || !text) {
      return res.status(400).json({ 
        error: 'Missing required fields: chatId, sender, and text are required',
        success: false 
      });
    }

    // Create new message
    const newMessage = new Message({
      chatId,
      sender,
      text,
      type,
      ...req.body
    });

    // Execute both operations in parallel
    const [savedMessage, updatedChat] = await Promise.all([
      newMessage.save(),
      Chat.findOneAndUpdate(
        { _id: chatId },
        { 
          lastMessage: newMessage._id,
          $inc: { unreadCount: 1 },
          updatedAt: new Date()
        },
        { new: true }
      )
    ]);

    // Verify chat exists
    if (!updatedChat) {
      return res.status(404).json({ 
        error: 'Chat not found', 
        success: false 
      });
    }

    return res.status(201).json({ 
      message: 'Message sent successfully', 
      data: savedMessage, 
      success: true 
    });

  } catch (error) {
    console.error('Error sending message:', error);
    
    // Handle specific error types
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        error: error.message, 
        success: false 
      });
    }
    
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        error: 'Invalid chat ID format', 
        success: false 
      });
    }
    
    return res.status(500).json({ 
      error: 'Internal server error', 
      success: false 
    });
  }
});

// GET /api/messages/get-all-messages/:chatId
router.get('/get-all-messages/:chatId', protect, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { limit = 50, page = 1, sort = '-createdAt' } = req.query;

    // Validate chatId
    if (!chatId) {
      return res.status(400).json({ 
        error: 'Chat ID is required',
        success: false 
      });
    }

    // Parse query parameters
    const limitNumber = parseInt(limit, 10);
    const pageNumber = parseInt(page, 10);
    const skip = (pageNumber - 1) * limitNumber;

    // Build query
    const query = { chatId };
    
    // Optional: Add any additional filters here
    // if (req.query.sender) query.sender = req.query.sender;

    // Fetch messages with pagination
    const messages = await Message.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limitNumber)
      .lean();

    // Get total count for pagination metadata
    const totalMessages = await Message.countDocuments(query);
    const totalPages = Math.ceil(totalMessages / limitNumber);

    return res.status(200).json({ 
      message: 'Messages fetched successfully', 
      data: messages,
      pagination: {
        total: totalMessages,
        page: pageNumber,
        limit: limitNumber,
        totalPages,
        hasNextPage: pageNumber < totalPages,
        hasPreviousPage: pageNumber > 1
      },
      success: true 
    });

  } catch (error) {
    console.error('Error fetching messages:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        error: 'Invalid chat ID format', 
        success: false 
      });
    }
    
    return res.status(500).json({ 
      error: 'Internal server error', 
      success: false 
    });
  }
});

// Optional: Add a route to mark messages as read
router.put('/mark-as-read/:chatId', protect, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { userId } = req.body;

    if (!chatId || !userId) {
      return res.status(400).json({ 
        error: 'Chat ID and User ID are required',
        success: false 
      });
    }

    // Update messages as read for this user in this chat
    const result = await Message.updateMany(
      { 
        chatId, 
        sender: { $ne: userId }, // Messages not sent by this user
        readBy: { $ne: userId }  // Not already read by this user
      },
      { 
        $addToSet: { readBy: userId },
        $set: { readAt: new Date() }
      }
    );

    // Reset unread count for this chat
    await Chat.findByIdAndUpdate(
      chatId,
      { unreadCount: 0 }
    );

    return res.status(200).json({ 
      message: 'Messages marked as read',
      modifiedCount: result.modifiedCount,
      success: true 
    });

  } catch (error) {
    console.error('Error marking messages as read:', error);
    return res.status(500).json({ 
      error: 'Internal server error', 
      success: false 
    });
  }
});

export default router;