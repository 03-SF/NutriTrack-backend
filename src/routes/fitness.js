// backend/src/routes/fitness.js
import express from "express";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import { fetchDirectSteps } from "../googleFitDirect.js";
import { NotFoundError, ValidationError } from "../middleware/errorHandler.js";

const router = express.Router();

/**
 * GET /api/fitness/today
 * Get today's fitness data
 */
router.get("/today", requireAuth(), async (req, res, next) => {
  try {
    const userId = req.user.sub;
    console.log('📊 Fitness/today requested for:', userId);

    // Find user by Google sub or Mongo _id
    let user = await User.findOne({ "google.sub": userId });
    if (!user) {
      user = await User.findById(userId);
    }

    if (!user) {
      throw new NotFoundError("User not found");
    }

    if (!user.google?.fitConnected) {
      throw new ValidationError('Google Fit not connected', { 
        fitConnected: 'User must connect Google Fit first' 
      });
    }

    // Get timezone offset from frontend (in minutes, as returned by getTimezoneOffset())
    // E.g., 420 for PDT (UTC-7), -330 for IST (UTC+5:30)
    const tzOffsetMinutes = parseInt(req.query.tz || '0');
    console.log(`🌍 Timezone offset: ${tzOffsetMinutes} minutes (${tzOffsetMinutes / 60} hours)`);

    // Calculate TODAY in the user's local timezone
    const now = new Date();
    const utcNowMs = now.getTime();

    // Create dates in local timezone and convert to UTC timestamps
    // Start of today in local time: YYYY-MM-DD 00:00:00
    const todayDateInLocal = new Date(utcNowMs - (tzOffsetMinutes * 60 * 1000));
    const localStartMs = new Date(todayDateInLocal.getUTCFullYear(), todayDateInLocal.getUTCMonth(), todayDateInLocal.getUTCDate()).getTime();
    
    // Convert back to UTC by adding the offset
    const start = localStartMs + (tzOffsetMinutes * 60 * 1000);
    const end = utcNowMs;
    
    console.log(`📊 Fetching TODAY's data (user timezone):`);
    console.log(`   Start (local): ${new Date(start).toISOString()}`);
    console.log(`   End (now): ${new Date(end).toISOString()}`);
    
    // Use DIRECT API to fetch steps
    const directResult = await fetchDirectSteps(user, start, end);
    
    const parsed = {
      steps: directResult.steps || 0,
      calories: Math.round((directResult.steps || 0) * 0.04),
      heartPoints: 0,
      distance: (((directResult.steps || 0) * 0.762) / 1000).toFixed(2),
      weight: null,
      height: null,
      bodyFat: null,
      heartRate: [],
      activities: []
    };
    
    console.log(`✅ Fitness data fetched - Steps: ${parsed.steps}, Calories: ${parsed.calories}`);

    user.fitnessData = {
      ...parsed,
      lastSyncedAt: new Date()
    };
    await user.save();

    res.json({
      raw: directResult.raw,
      parsed: parsed
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/fitness/day
 * Get fitness data for a specific day
 */
router.get("/day", requireAuth(), async (req, res, next) => {
  try {
    const userId = req.user.sub;

    // Find user
    let user = await User.findOne({ "google.sub": userId });
    if (!user) {
      user = await User.findById(userId);
    }

    if (!user) {
      throw new NotFoundError("User not found");
    }

    if (!user.google?.fitConnected) {
      throw new ValidationError('Google Fit not connected', { 
        fitConnected: 'User must connect Google Fit first' 
      });
    }

    // Get date from query parameter (ISO string)
    const dateParam = req.query.date;
    let targetDate;
    
    if (dateParam) {
      targetDate = new Date(dateParam);
    } else {
      targetDate = new Date();
    }
    
    // Set to start and end of day
    const startOfDay = new Date(
      targetDate.getFullYear(),
      targetDate.getMonth(),
      targetDate.getDate(),
      0, 0, 0, 0
    );
    
    const endOfDay = new Date(
      targetDate.getFullYear(),
      targetDate.getMonth(),
      targetDate.getDate(),
      23, 59, 59, 999
    );

    console.log(`📅 Fetching fitness data for ${startOfDay.toLocaleDateString()}`);

    const directResult = await fetchDirectSteps(
      user,
      startOfDay.getTime(),
      endOfDay.getTime()
    );

    const parsed = {
      steps: directResult.steps || 0,
      calories: Math.round((directResult.steps || 0) * 0.04),
      heartPoints: 0,
      distance: (((directResult.steps || 0) * 0.762) / 1000).toFixed(2),
      weight: null,
      height: null,
      bodyFat: null,
      heartRate: [],
      activities: []
    };

    res.json({
      raw: directResult.raw,
      parsed: parsed
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/fitness/sync
 * Manually trigger data sync from Google Fit
 */
router.post("/sync", requireAuth(), async (req, res, next) => {
  try {
    const userId = req.user.sub;

    // Find user
    let user = await User.findOne({ "google.sub": userId });
    if (!user) {
      user = await User.findById(userId);
    }

    if (!user) {
      throw new NotFoundError("User not found");
    }

    if (!user.google?.fitConnected) {
      throw new ValidationError('Google Fit not connected', { 
        fitConnected: 'Connect Google Fit first' 
      });
    }

    // Trigger sync (same as GET /fitness/today)
    const now = new Date();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const directResult = await fetchDirectSteps(user, todayStart.getTime(), now.getTime());
    
    const parsed = {
      steps: directResult.steps || 0,
      calories: Math.round((directResult.steps || 0) * 0.04),
      heartPoints: 0,
      distance: (((directResult.steps || 0) * 0.762) / 1000).toFixed(2),
      weight: null,
      height: null,
      bodyFat: null,
      heartRate: [],
      activities: []
    };

    user.fitnessData = {
      ...parsed,
      lastSyncedAt: new Date()
    };
    await user.save();

    console.log(`✅ Manual sync completed for ${user.email}`);

    res.json({
      message: "Sync completed successfully",
      data: parsed,
      lastSyncedAt: user.fitnessData.lastSyncedAt
    });
  } catch (err) {
    next(err);
  }
});

export default router;
