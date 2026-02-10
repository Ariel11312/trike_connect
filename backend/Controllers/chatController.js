import mongoose from 'mongoose'; // Add this import at the top
import express from 'express';
import Chat from '../models/chat.js';
import Message from '../models/message.js';
import {protect}  from '../auth/auth.js';

const router = express.Router();

// Create new message
router.post('/new-message', protect, async (req, res) => {
  try {
    const newMessage = new Message(req.body);
    
    // Update chat with last message before saving
    const currentChat = await Chat.findOneAndUpdate(
      { _id: req.body.chatId },
      { 
        lastMessage: newMessage._id,
        $inc: { unreadCount: 1 }
      },
      { new: true }
    );

    const savedMessage = await newMessage.save();

    res.status(201).json({ 
      message: 'Message sent successfully', 
      data: savedMessage, 
      success: true 
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      success: false 
    });
  }
});

// Get all messages for a chat
router.get('/get-all-messages/:chatId', protect, async (req, res) => {
  try {
    const messages = await Message.find({ chatId: req.params.chatId })
      .populate('sender', 'firstname lastname email')
      .sort({ createdAt: 1 });
    
    res.status(200).json({ 
      message: 'Messages fetched successfully', 
      data: messages, 
      success: true 
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      success: false 
    });
  }
});

// Get all chats for current user
router.get('/get-all-chats', protect, async (req, res) => {
  try {
    const chats = await Chat.find({ members: { $in: [req.user._id] } })
      .populate('members', 'firstname lastname email')
      .populate({
        path: 'lastMessage',
        populate: {
          path: 'sender',
          select: 'firstname lastname email'
        }
      })
      .sort({ updatedAt: -1 });
    
    res.status(200).json({ 
      message: 'Chats fetched successfully', 
      data: chats, 
      success: true 
    });
  } catch (error) {
    console.error('Error fetching chats:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      success: false 
    });
  }
});

// Create new chat
router.post('/create-new-chat', protect, async (req, res) => {
  try {
    const { members } = req.body;
    
    // Validate exactly 2 members for 1:1 chat
    if (!members || !Array.isArray(members) || members.length !== 2) {
      return res.status(400).json({
        message: 'Exactly 2 members are required for 1:1 chat',
        success: false
      });
    }
    
    // Validate both are valid ObjectIds
    if (!members.every(id => mongoose.Types.ObjectId.isValid(id))) {
      return res.status(400).json({
        message: 'Invalid member IDs',
        success: false
      });
    }
    
    // Ensure users are different
    if (members[0] === members[1]) {
      return res.status(400).json({
        message: 'Cannot create chat with yourself',
        success: false
      });
    }
    
    // ✅ Use the static method from the model
    const chat = await Chat.findOrCreate(members);
    
    res.status(200).json({
      message: chat.isNew ? 'Chat created successfully' : 'Chat already exists',
      data: chat,
      success: true
    });
    
  } catch (error) {
    console.error('Error creating chat:', error);
    
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      success: false
    });
  }
});

export default router;