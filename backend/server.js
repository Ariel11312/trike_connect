import dns from "node:dns/promises";
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import chatRoutes from './Controllers/chatController.js';
import messageRoutes from './Controllers/messageController.js';
import connectDB from "./database/db.js";
import authRoutes from "./routes/authRoute.js";
import reportRoutes from "./routes/reportRoute.js";
import rideRoutes from "./routes/rideRoute.js";
import cookieParser from "cookie-parser";
import path from "path";
import fs from "fs";

// Force Node to use Cloudflare + Google DNS for SRV resolution
dns.setServers(["1.1.1.1", "8.8.8.8"]);

// Load env variables
dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();

// Create HTTP server
const httpServer = createServer(app);

// Initialize Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:8081",
    credentials: true,
    methods: ["GET", "POST"]
  }
});

// Ensure uploads folder exists
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// CORS
app.use(cors({
  origin: "http://localhost:8081",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Cookie parser
app.use(cookieParser());

// Body parsers with large limit for base64 images
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Serve uploaded images statically
app.use('/uploads', express.static(uploadDir));

// Routes
app.use('/api/chat', chatRoutes);
app.use('/api/message', messageRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/rides", rideRoutes);
app.use("/api/reports", reportRoutes);

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({ success: true, message: "Server is running" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: "Something went wrong!" });
});

// ============================================
// Socket.IO Chat Implementation
// ============================================

// Store online users: userId -> socketId
const onlineUsers = new Map();

// Store user sockets: socketId -> userId
const userSockets = new Map();

io.on("connection", (socket) => {
  console.log(`✅ Socket connected: ${socket.id}`);

  // User comes online
  socket.on("user-online", (userId) => {
    console.log(`👤 User ${userId} is online`);
    
    // Store the mapping
    onlineUsers.set(userId, socket.id);
    userSockets.set(socket.id, userId);
    
    // Notify all clients about online users
    io.emit("users-online", Array.from(onlineUsers.keys()));
    
    // Notify others that this user connected
    socket.broadcast.emit("user-connected", userId);
  });

  // Join a specific chat room
  socket.on("join-chat", (chatId) => {
    console.log(`📩 Socket ${socket.id} joined chat: ${chatId}`);
    socket.join(chatId);
  });

  // Leave a chat room
  socket.on("leave-chat", (chatId) => {
    console.log(`📤 Socket ${socket.id} left chat: ${chatId}`);
    socket.leave(chatId);
  });

  // Send message
  socket.on("send-message", ({ message, chatId, recipientIds }) => {
    console.log(`💬 Message sent to chat ${chatId}:`, message);
    
    // Emit to all users in the chat room except sender
    socket.to(chatId).emit("receive-message", {
      message,
      chat: { _id: chatId }
    });

    // Also emit directly to specific recipients if they're online
    if (recipientIds && Array.isArray(recipientIds)) {
      recipientIds.forEach(recipientId => {
        const recipientSocketId = onlineUsers.get(recipientId);
        if (recipientSocketId) {
          io.to(recipientSocketId).emit("receive-message", {
            message,
            chat: { _id: chatId }
          });
        }
      });
    }
  });

  // Typing indicator
  socket.on("typing", ({ userId, chatId, isTyping }) => {
    console.log(`⌨️  User ${userId} is ${isTyping ? 'typing' : 'stopped typing'} in chat ${chatId}`);
    
    // Broadcast to all users in the chat room except sender
    socket.to(chatId).emit("user-typing", {
      userId,
      chatId,
      isTyping
    });
  });

  // Message delivered (optional - for read receipts)
  socket.on("message-delivered", ({ messageId, chatId }) => {
    socket.to(chatId).emit("message-delivered", { messageId, chatId });
  });

  // Message read (optional - for read receipts)
  socket.on("message-read", ({ messageId, chatId }) => {
    socket.to(chatId).emit("message-read", { messageId, chatId });
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log(`❌ Socket disconnected: ${socket.id}`);
    
    // Get the userId for this socket
    const userId = userSockets.get(socket.id);
    
    if (userId) {
      // Remove from online users
      onlineUsers.delete(userId);
      userSockets.delete(socket.id);
      
      // Notify all clients about updated online users
      io.emit("users-online", Array.from(onlineUsers.keys()));
      
      // Notify others that this user disconnected
      socket.broadcast.emit("user-disconnected", userId);
      
      console.log(`👋 User ${userId} went offline`);
    }
  });

  // Handle errors
  socket.on("error", (error) => {
    console.error(`Socket error for ${socket.id}:`, error);
  });
});

// Make io accessible in routes (optional)
app.set('io', io);

// Start server
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`💬 Socket.IO server is ready`);
});

export { io };