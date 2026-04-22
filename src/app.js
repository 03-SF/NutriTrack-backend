// backend/src/app.js
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import session from "express-session";
import dotenv from "dotenv";

// Middleware imports
import { errorHandler } from "./middleware/errorHandler.js";

// Route imports
import authRoutes from "./routes/auth.js";
import fitnessRoutes from "./routes/fitness.js";
import nutritionRoutes from "./routes/nutrition.js";
import profileRoutes from "./routes/profile.js";
import workoutRoutes from "./routes/workout.js";
import exerciseRecommendationsRoutes from "./routes/exerciseRecommendations.js";
import streaksRoutes from "./routes/streaks.js";

// Utilities
import User from "./models/User.js";
import { fetchDirectSteps } from "./googleFitDirect.js";

dotenv.config();

const app = express();
const {
  FRONTEND_URL,
  SESSION_SECRET,
} = process.env;

// ================== MIDDLEWARE ==================
const allowedOrigins = [
  FRONTEND_URL,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://localhost:5173",
  "https://127.0.0.1:5173",
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser clients or same-origin requests
      if (!origin) return callback(null, true);

      const isAllowedExact = allowedOrigins.includes(origin);
      const isAllowedVercel = /^https:\/\/[-a-z0-9]+\.vercel\.app$/i.test(origin);

      if (isAllowedExact || isAllowedVercel) {
        return callback(null, true);
      }

      return callback(null, false);
    },
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json());
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  })
);

// ================== HEALTH CHECK ==================
app.get("/ping", (req, res) => res.json({ msg: "pong" }));

// ================== DEBUG ROUTES (Development only) ==================

app.get("/api/debug/verify-jwt", (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    return res.json({ valid: false, error: "No Bearer token provided" });
  }
  
  const token = auth.split(" ")[1];
  try {
    const jwt = require("jsonwebtoken");
    const decoded = jwt.verify(token, process.env.TOKEN_SECRET);
    return res.json({ 
      valid: true, 
      payload: { sub: decoded.sub, email: decoded.email },
      expiresAt: new Date(decoded.exp * 1000).toISOString()
    });
  } catch (err) {
    return res.json({ valid: false, error: err.message });
  }
});

app.get("/api/debug/frontend-jwt", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>JWT Debug</title></head>
    <body>
      <h1>Frontend JWT Debug</h1>
      <pre id="output">Loading...</pre>
      <script>
        const jwt = localStorage.getItem('jwt');
        const output = document.getElementById('output');
        if (jwt) {
          output.textContent = 'JWT Found:\\n\\n' + jwt.substring(0, 50) + '...\\n\\nFull length: ' + jwt.length + ' characters';
        } else {
          output.textContent = 'NO JWT in localStorage!';
        }
      </script>
    </body>
    </html>
  `);
});

app.get("/api/debug/users", async (req, res) => {
  try {
    const users = await User.find({}, { 
      email: 1, 
      name: 1, 
      'google.fitConnected': 1, 
      'google.sub': 1,
      'fitnessData.steps': 1,
      'fitnessData.lastSyncedAt': 1
    });
    res.json({ 
      count: users.length, 
      users: users.map(u => ({
        email: u.email,
        name: u.name,
        fitConnected: u.google?.fitConnected || false,
        hasSub: !!u.google?.sub,
        steps: u.fitnessData?.steps || 0,
        lastSynced: u.fitnessData?.lastSyncedAt
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/debug/googlefit-test", async (req, res) => {
  try {
    const user = await User.findOne({ "google.fitConnected": true });
    if (!user) {
      return res.status(404).json({ error: "No connected user found" });
    }
    
    const now = Date.now();
    const start = now - 24*60*60*1000;
    const directResult = await fetchDirectSteps(user, start, now);
    
    res.json({ 
      user: user.email,
      method: 'direct',
      steps: directResult.steps,
      rawResponse: directResult.raw
    });
  } catch (err) {
    console.error('❌ Test error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ================== ROUTES (Modularized) ==================

// Auth routes: /api/auth/*
app.use("/api/auth", authRoutes);

// Fitness routes: /api/fitness/*
app.use("/api/fitness", fitnessRoutes);

// Nutrition routes: /api/nutrition/*
app.use("/api/nutrition", nutritionRoutes);

// Profile routes: /api/profile/* and /api/user/profile
app.use("/api/profile", profileRoutes);
app.use("/api/user", profileRoutes);

// Workout routes: /api/workout/*
app.use("/api/workout", workoutRoutes);

// Exercise Recommendations routes: /api/exercise-recommendations/*
app.use("/api/exercise-recommendations", exerciseRecommendationsRoutes);

// Streaks routes: /api/streaks
app.use("/api/streaks", streaksRoutes);

// ================== CENTRALIZED ERROR HANDLER (Must be last) ==================
app.use(errorHandler());

export default app;
