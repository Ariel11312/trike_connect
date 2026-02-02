import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config(); // ✅ Load .env variables

const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI;

    // Debug: check if URI is loaded
    console.log("MongoDB URI:", uri);

    if (!uri) {
      throw new Error("MONGODB_URI not found in environment variables");
    }

    // Connect with IPv4 option to fix DNS resolution
    const conn = await mongoose.connection.openUri(uri, {
      family: 4, // ✅ Force IPv4 - fixes ECONNREFUSED error
      serverSelectionTimeoutMS: 5000, 
    });

    // Alternatively, the standard way:
    // const conn = await mongoose.connect(uri, { family: 4 });

    console.log(`MongoDB Connected: ${conn.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;