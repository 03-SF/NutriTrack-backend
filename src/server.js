// backend/src/server.js
import http from "http";
import mongoose from "mongoose";
import dotenv from "dotenv";

import app from "./app.js";
import { startNutritionArchiver } from "./nutritionArchiver.js";

dotenv.config();

// -------------------- PROCESS ERROR HANDLERS --------------------
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  // Don't exit, just log
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit, just log
});

// -------------------- MongoDB --------------------
const { MONGO_URI } = process.env;
if (!MONGO_URI) {
  console.error("❌ Missing MONGO_URI in .env");
  process.exit(1);
}

// -------------------- HTTP SERVER --------------------
const PORT = process.env.PORT || 5000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

const httpServer = http.createServer(app);

// -------------------- START SERVER --------------------
async function startServer() {
  try {
    // Connect to MongoDB first
    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB connected");
    
    // Start nutrition archiver
    startNutritionArchiver();
    
    // Then start the HTTP server
    await new Promise((resolve, reject) => {
      httpServer.listen(PORT, () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
        console.log(`🔗 OAuth Redirect URL: ${BASE_URL}/api/auth/google/callback`);
        console.log(`📡 Server is ready to accept connections`);
        resolve();
      });
      
      // Handle server errors
      httpServer.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          console.error(`❌ Port ${PORT} is already in use. Please kill the process or use a different port.`);
          reject(error);
        } else {
          console.error('❌ Server error:', error);
          reject(error);
        }
      });
    });
    
    // Keep the process alive
    setInterval(() => {
      // Do nothing, just keep the event loop alive
    }, 1000 * 60 * 60); // Check every hour
    
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
}

startServer();