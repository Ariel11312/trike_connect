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
import passwordRoutes from "./routes/passwordRoute.js";
import reportRoutes from "./routes/reportRoute.js";
import rideRoutes from "./routes/rideRoute.js";
import dispatcherRoutes from "./routes/dispatcherRoute.js";
import cookieParser from "cookie-parser";
import path from "path";
import fs from "fs";
import driverRegistrationRoutes from './routes/DriverRegistrationRoute.js';

// Force Node to use Cloudflare + Google DNS for SRV resolution
dns.setServers(["1.1.1.1", "8.8.8.8"]);

dotenv.config();
connectDB();

const app        = express();
const httpServer = createServer(app);

// ─── Socket.IO ────────────────────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: {
    origin:      "http://localhost:8081",
    credentials: true,
    methods:     ["GET", "POST"],
  },
});

// ─── Online user maps (module-level singletons) ───────────────────────────────
// These maps live here and are used by emitToUser below.
// Controllers import emitToUser from this file so they always hit the same Map.
const onlineUsers = new Map(); // userId  (string) → socketId (string)
const userSockets = new Map(); // socketId(string) → userId  (string)

// ─── Uploads folder ───────────────────────────────────────────────────────────
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin:         "http://localhost:8081",
  credentials:    true,
  methods:        ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(cookieParser());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use('/uploads', express.static(uploadDir));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/chat',                 chatRoutes);
app.use('/api/dispatcher',           dispatcherRoutes);
app.use('/api/message',              messageRoutes);
app.use("/api/auth",                 authRoutes);
app.use("/api/rides",                rideRoutes);
app.use("/api/reports",              reportRoutes);
app.use('/api/driver-registrations', driverRegistrationRoutes);
app.use('/api/password',             passwordRoutes);

app.get("/health", (_req, res) => {
  res.status(200).json({ success: true, message: "Server is running" });
});

app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: "Something went wrong!" });
});

// Make io accessible via req.app.get('io') in any route/controller if needed
app.set('io', io);

// ─── Socket.IO handlers ───────────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log(`✅ Socket connected: ${socket.id}`);

  // ── Register user as online ──────────────────────────────────────────────
  socket.on("user-online", (userId) => {
    if (!userId) return;
    const uid = userId.toString();          // ✅ always store as string

    onlineUsers.set(uid, socket.id);
    userSockets.set(socket.id, uid);

    console.log(`👤 user-online: ${uid} → ${socket.id}`);
    console.log(`📋 Online users: [${[...onlineUsers.keys()].join(', ')}]`);

    // Echo full online list back to all clients
    io.emit("users-online", Array.from(onlineUsers.keys()));
    socket.broadcast.emit("user-connected", uid);
  });

  // ── Chat room ────────────────────────────────────────────────────────────
  socket.on("join-chat", (chatId) => {
    socket.join(chatId);
    console.log(`📩 Socket ${socket.id} joined chat: ${chatId}`);
  });

  socket.on("leave-chat", (chatId) => {
    socket.leave(chatId);
    console.log(`📤 Socket ${socket.id} left chat: ${chatId}`);
  });

  // ── Messages ─────────────────────────────────────────────────────────────
  socket.on("send-message", ({ message, chatId, recipientIds }) => {
    console.log(`💬 Message in chat ${chatId}`);

    // Broadcast to everyone in the room except sender
    socket.to(chatId).emit("receive-message", {
      message,
      chat: { _id: chatId },
    });

    // Also emit directly to each recipient's socket if they are online
    if (recipientIds && Array.isArray(recipientIds)) {
      recipientIds.forEach((recipientId) => {
        const recipientSocketId = onlineUsers.get(recipientId.toString());
        if (recipientSocketId) {
          io.to(recipientSocketId).emit("receive-message", {
            message,
            chat: { _id: chatId },
          });
        }
      });
    }
  });

  // ── Typing indicator ──────────────────────────────────────────────────────
  socket.on("typing", ({ userId, chatId, isTyping }) => {
    socket.to(chatId).emit("user-typing", { userId, chatId, isTyping });
  });

  // ── Read receipts ─────────────────────────────────────────────────────────
  socket.on("message-delivered", ({ messageId, chatId }) => {
    socket.to(chatId).emit("message-delivered", { messageId, chatId });
  });

  socket.on("message-read", ({ messageId, chatId }) => {
    socket.to(chatId).emit("message-read", { messageId, chatId });
  });

  // ── Disconnect ────────────────────────────────────────────────────────────
  socket.on("disconnect", (reason) => {
    const uid = userSockets.get(socket.id);
    if (uid) {
      onlineUsers.delete(uid);
      userSockets.delete(socket.id);
      io.emit("users-online", Array.from(onlineUsers.keys()));
      socket.broadcast.emit("user-disconnected", uid);
      console.log(`👋 User ${uid} went offline (${reason})`);
    }
    console.log(`❌ Socket disconnected: ${socket.id}`);
  });

  socket.on("error", (error) => {
    console.error(`Socket error for ${socket.id}:`, error);
  });
});

// ─── Emit helpers ─────────────────────────────────────────────────────────────
// Import these in your controllers instead of using req.app.get('io').
// Because they live in this file they share the same onlineUsers Map — no mismatch.

/**
 * Emit an event to a specific online user.
 * @param {string|object} userId  Mongoose ObjectId or plain string
 * @param {string}        event   Socket event name
 * @param {any}           data    Payload
 * @returns {boolean}             true if user was online and event was sent
 */
export const emitToUser = (userId, event, data) => {
  const uid      = userId.toString();           // ✅ coerce ObjectId → string
  const socketId = onlineUsers.get(uid);

  console.log(`📋 Online map:`, Object.fromEntries(onlineUsers));
  console.log(`🔍 emitToUser → "${uid}", socketId: "${socketId ?? 'NOT FOUND'}"`);

  if (!socketId) {
    console.warn(`⚠️  emitToUser: "${uid}" is NOT online — "${event}" not delivered`);
    return false;
  }

  io.to(socketId).emit(event, data);
  console.log(`📤 Emitted "${event}" → ${uid} (${socketId})`);
  return true;
};

/**
 * Broadcast an event to every connected socket.
 */
export const emitToAll = (event, data) => {
  io.emit(event, data);
  console.log(`📢 Broadcast "${event}"`);
};

// ─── Start server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`💬 Socket.IO server is ready`);
});

export { io };