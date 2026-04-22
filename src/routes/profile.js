// backend/src/routes/profile.js
import express from "express";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import { validateSchema } from "../middleware/validation.js";
import { NotFoundError, ValidationError } from "../middleware/errorHandler.js";

const router = express.Router();

/**
 * Helper: Calculate daily calorie goal using Mifflin-St Jeor Equation
 */
function calculateDailyCalorieGoal(age, gender, height, weight, activityLevel, goal) {
  // BMR calculation
  let bmr;
  if (gender === 'male') {
    bmr = 10 * weight + 6.25 * height - 5 * age + 5;
  } else if (gender === 'female') {
    bmr = 10 * weight + 6.25 * height - 5 * age - 161;
  } else {
    bmr = 10 * weight + 6.25 * height - 5 * age - 78;
  }

  // Activity multiplier
  const activityMultipliers = {
    sedentary: 1.2,
    lightly_active: 1.375,
    moderate: 1.55,
    very_active: 1.725,
    extra_active: 1.9
  };
  
  const tdee = bmr * (activityMultipliers[activityLevel] || 1.2);

  // Goal adjustment
  let calorieGoal;
  if (goal === 'lose') {
    calorieGoal = tdee - 500;
  } else if (goal === 'gain') {
    calorieGoal = tdee + 500;
  } else {
    calorieGoal = tdee;
  }

  return Math.round(calorieGoal);
}

/**
 * POST /api/profile/setup
 * Save/update user profile with validation
 */
router.post("/setup", requireAuth(), async (req, res, next) => {
  try {
    const userId = req.user.sub;
    console.log('📋 Profile setup requested for:', userId);

    // Validate input
    const validation = validateSchema({
      age: { required: true, sanitize: 'number', min: 1, max: 150, validate: 'age' },
      gender: { required: true, validate: 'enum', allowedValues: ['male', 'female', 'other'] },
      height: { required: true, sanitize: 'number', min: 50, max: 300, validate: 'height' },
      weight: { required: true, sanitize: 'number', min: 20, max: 500, validate: 'weight' },
      activityLevel: { required: true, validate: 'enum', allowedValues: ['sedentary', 'lightly_active', 'moderate', 'very_active', 'extra_active'] },
      goal: { required: true, validate: 'enum', allowedValues: ['lose', 'maintain', 'gain'] }
    }, req.body);

    if (!validation.valid) {
      throw new ValidationError('Validation failed', validation.errors);
    }

    const { age, gender, height, weight, activityLevel, goal } = validation.sanitized;

    // Calculate daily calorie goal
    const dailyCalorieGoal = calculateDailyCalorieGoal(age, gender, height, weight, activityLevel, goal);

    // Find user
    let user = await User.findOne({ "google.sub": userId });
    if (!user) {
      user = await User.findById(userId);
    }

    if (!user) {
      throw new NotFoundError("User not found");
    }

    // Update profile
    user.profile = {
      age,
      gender,
      height,
      weight,
      activityLevel,
      goal,
      dailyCalorieGoal,
      isProfileComplete: true
    };

    await user.save();

    console.log(`✅ Profile setup complete for ${user.email}: ${dailyCalorieGoal} cal/day`);

    res.json({
      success: true,
      profile: user.profile,
      message: 'Profile saved successfully'
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/profile
 * Get user profile
 */
router.get("/", requireAuth(), async (req, res, next) => {
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

    res.json({
      profile: user.profile || { isProfileComplete: false },
      email: user.email,
      name: user.name
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/profile/streaks
 * Get user login and goal streaks
 */
router.get("/streaks", requireAuth(), async (req, res, next) => {
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

    // Get streaks
    const streaks = user.streaks || {
      login: { current: 0, longest: 0 },
      goalCompletion: { current: 0, longest: 0 }
    };

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

/**
 * GET /api/user/profile
 * Get full user profile (for backward compatibility)
 */
router.get("/user/profile", requireAuth(), async (req, res, next) => {
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

    res.json({
      email: user.email,
      name: user.name,
      profile: user.profile,
      fitnessData: user.fitnessData,
      fitConnected: user.google?.fitConnected || false,
      lastSynced: user.fitnessData?.lastSyncedAt
    });
  } catch (err) {
    next(err);
  }
});

export default router;
