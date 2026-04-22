// backend/src/routes/workout.js
import express from "express";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import { validateSchema, validateDuration } from "../middleware/validation.js";
import { NotFoundError, ValidationError } from "../middleware/errorHandler.js";

const router = express.Router();

/**
 * MET (Metabolic Equivalent of Task) values for common exercises
 */
const MET_VALUES = {
  walking: { light: 2.5, moderate: 3.5, vigorous: 4.3 },
  running: { light: 6.0, moderate: 9.8, vigorous: 12.3 },
  cycling: { light: 4.0, moderate: 8.0, vigorous: 12.0 },
  swimming: { light: 5.8, moderate: 9.8, vigorous: 11.0 },
  weightlifting: { light: 3.0, moderate: 5.0, vigorous: 6.0 },
  yoga: { light: 2.5, moderate: 3.0, vigorous: 4.0 },
  dance: { light: 3.0, moderate: 5.0, vigorous: 7.8 },
  basketball: { light: 4.5, moderate: 6.5, vigorous: 8.0 },
  football: { light: 5.0, moderate: 7.0, vigorous: 10.0 },
  tennis: { light: 4.5, moderate: 7.3, vigorous: 8.0 },
  hiking: { light: 4.0, moderate: 6.0, vigorous: 7.8 },
  rowing: { light: 3.5, moderate: 7.0, vigorous: 12.0 },
  jumpingRope: { light: 8.0, moderate: 11.8, vigorous: 12.3 },
  other: { light: 3.0, moderate: 5.0, vigorous: 8.0 }
};

/**
 * Calculate calories burned using MET formula
 * Calories = MET × weight(kg) × duration(hours)
 */
function calculateCaloriesBurned(workoutType, intensity, duration, weightKg) {
  const metValue = MET_VALUES[workoutType]?.[intensity] || MET_VALUES.other[intensity];
  const durationHours = duration / 60;
  return Math.round(metValue * weightKg * durationHours);
}

/**
 * POST /api/workout/add
 * Add manual workout entry with validation
 */
router.post("/add", requireAuth(), async (req, res, next) => {
  try {
    const userId = req.user.sub;
    console.log('💪 Adding workout for user:', userId);

    // Validate input
    const validation = validateSchema({
      type: { required: true, sanitize: 'string' },
      duration: { required: true, sanitize: 'number', min: 1, max: 1440, validate: 'duration' },
      intensity: { required: true, validate: 'enum', allowedValues: ['light', 'moderate', 'vigorous'] },
      notes: { sanitize: 'string' }
    }, req.body);

    if (!validation.valid) {
      throw new ValidationError('Validation failed', validation.errors);
    }

    const { type, duration, intensity, notes } = validation.sanitized;

    // Find user
    let user = await User.findOne({ "google.sub": userId });
    if (!user) {
      user = await User.findById(userId);
    }

    if (!user) {
      throw new NotFoundError("User not found");
    }

    // Get user weight from profile, default to 70kg if not set
    const userWeight = user.profile?.weight || 70;

    // Calculate calories burned
    const caloriesBurned = calculateCaloriesBurned(type, intensity, duration, userWeight);

    const newWorkout = {
      type,
      duration: parseFloat(duration),
      caloriesBurned,
      intensity,
      notes,
      timestamp: new Date()
    };

    user.workoutEntries.push(newWorkout);
    await user.save();

    console.log(`✅ Workout added: ${type} (${duration} min, ${caloriesBurned} kcal) for ${user.email}`);

    res.status(201).json({
      message: "Workout logged successfully",
      workout: user.workoutEntries[user.workoutEntries.length - 1]
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/workout/history
 * Get workout history for past N days
 */
router.get("/history", requireAuth(), async (req, res, next) => {
  try {
    const userId = req.user.sub;
    const days = Math.min(parseInt(req.query.days || "7"), 90); // Max 90 days

    // Find user
    let user = await User.findOne({ "google.sub": userId });
    if (!user) {
      user = await User.findById(userId);
    }

    if (!user) {
      throw new NotFoundError("User not found");
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const recentWorkouts = user.workoutEntries.filter(workout => 
      new Date(workout.timestamp) >= cutoffDate
    );

    const totalCalories = recentWorkouts.reduce((sum, w) => sum + w.caloriesBurned, 0);
    const totalDuration = recentWorkouts.reduce((sum, w) => sum + w.duration, 0);

    res.json({
      workouts: recentWorkouts.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      ),
      summary: {
        totalWorkouts: recentWorkouts.length,
        totalCaloriesBurned: totalCalories,
        totalDuration: totalDuration
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/workout/:workoutId
 * Delete workout entry (ownership enforced)
 */
router.delete("/:workoutId", requireAuth(), async (req, res, next) => {
  try {
    const userId = req.user.sub;
    const workoutId = req.params.workoutId;

    // Find user
    let user = await User.findOne({ "google.sub": userId });
    if (!user) {
      user = await User.findById(userId);
    }

    if (!user) {
      throw new NotFoundError("User not found");
    }

    const initialLength = user.workoutEntries.length;
    user.workoutEntries = user.workoutEntries.filter(w => w._id.toString() !== workoutId);

    if (user.workoutEntries.length === initialLength) {
      throw new NotFoundError("Workout not found");
    }

    await user.save();
    console.log(`✅ Deleted workout ${workoutId} for ${user.email}`);

    res.json({ message: "Workout deleted successfully" });
  } catch (err) {
    next(err);
  }
});

export default router;
