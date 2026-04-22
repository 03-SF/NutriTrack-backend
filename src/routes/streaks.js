// backend/src/routes/streaks.js
import express from "express";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import { NotFoundError } from "../middleware/errorHandler.js";

const router = express.Router();

/**
 * GET /api/streaks
 * Get user login and goal streaks
 */
router.get("/", requireAuth(), async (req, res, next) => {
  try {
    const userId = req.user.sub;
    console.log('🔥 Fetching streaks for user:', userId);

    // Find user by Google sub or Mongo _id
    let user = await User.findOne({ "google.sub": userId });
    if (!user) {
      user = await User.findById(userId);
    }

    if (!user) {
      throw new NotFoundError("User not found");
    }

    // Get streaks
    const streaks = user.streaks || {
      login: { current: 0, longest: 0 },
      goalCompletion: { current: 0, longest: 0 }
    };

    console.log('✅ Streaks retrieved:', streaks);

    res.json({
      streaks: {
        login: {
          current: streaks.login?.current || 0,
          longest: streaks.login?.longest || 0
        },
        goalCompletion: {
          current: streaks.goalCompletion?.current || 0,
          longest: streaks.goalCompletion?.longest || 0
        }
      }
    });
  } catch (err) {
    next(err);
  }
});

export default router;
