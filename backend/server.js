import dns from "node:dns/promises";
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import connectDB from "./database/db.js";
import authRoutes from "./routes/authRoute.js";
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

// Ensure uploads folder exists
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// CORS
app.use(cors({
  origin: "http://localhost:8081",
  credentials: true,
  methods: ["GET","POST","PUT","DELETE","PATCH"],
  allowedHeaders: ["Content-Type","Authorization"]
}));

// Cookie parser
app.use(cookieParser());

// Body parsers with large limit for base64 images
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Serve uploaded images statically
app.use('/uploads', express.static(uploadDir));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/rides", rideRoutes);

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({ success: true, message: "Server is running" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: "Something went wrong!" });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
