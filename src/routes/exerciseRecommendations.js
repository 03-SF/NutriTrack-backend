// backend/src/routes/exerciseRecommendations.js
import express from "express";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import { NotFoundError, ValidationError } from "../middleware/errorHandler.js";

const router = express.Router();

/**
 * Exercise recommendations based on MET values
 */
const EXERCISE_RECOMMENDATIONS = {
  light: [
    { name: 'Walking (3.5 km/h)', met: 2.5, duration: 60 },
    { name: 'Yoga', met: 2.5, duration: 90 },
    { name: 'Stretching', met: 2.3, duration: 60 }
  ],
  moderate: [
    { name: 'Running (8 km/h)', met: 9.8, duration: 20 },
    { name: 'Cycling (16-19 km/h)', met: 8.0, duration: 30 },
    { name: 'Swimming', met: 9.8, duration: 25 },
    { name: 'Dancing', met: 5.0, duration: 40 },
    { name: 'Basketball', met: 6.5, duration: 30 }
  ],
  vigorous: [
    { name: 'Running (12 km/h)', met: 12.3, duration: 15 },
    { name: 'HIIT Training', met: 12.0, duration: 20 },
    { name: 'Jump Rope', met: 11.8, duration: 15 },
    { name: 'Mountain Biking', met: 14.0, duration: 20 }
  ]
};

/**
 * Calculate calories burned for an exercise
 * Calories = MET × weight(kg) × duration(hours)
 */
function calculateCaloriesBurned(met, weightKg, durationMinutes) {
  return Math.round(met * weightKg * (durationMinutes / 60));
}

/**
 * GET /api/exercise-recommendations/today
 * Get exercise recommendations based on daily calorie balance
 */
router.get("/today", requireAuth(), async (req, res, next) => {
  try {
    const userId = req.user.sub;
    console.log('🎯 Exercise recommendations requested for:', userId);

    // Find user by Google sub or Mongo _id
    let user = await User.findOne({ "google.sub": userId });
    if (!user) {
      user = await User.findById(userId);
    }

    if (!user) {
      throw new NotFoundError("User not found");
    }

    // Check if profile is complete
    if (!user.profile?.isProfileComplete) {
      console.log('⚠️ Profile not complete for user:', userId);
      return res.json({ data: null });
    }

    // Get today's nutrition data from entries (real-time)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Calculate real-time total from nutritionEntries (same as nutrition/today endpoint)
    const todayEntries = user.nutritionEntries.filter(entry => entry.timestamp >= today);
    const caloriesConsumed = todayEntries.reduce((sum, entry) => sum + (entry.calories || 0), 0);
    
    // Get calories burned from Google Fit and workouts
    const caloriesBurned = (user.fitnessData?.calories || 0) + 
      (user.workoutEntries
        .filter(w => new Date(w.timestamp) >= today)
        .reduce((sum, w) => sum + (w.caloriesBurned || 0), 0) || 0);
    
    const targetCalories = user.profile?.dailyCalorieGoal || 2200;
    
    // Net calories = consumed - burned
    const netCalories = caloriesConsumed - caloriesBurned;
    const caloriesDifference = netCalories - targetCalories;

    // If no meals logged, can't generate recommendations
    if (caloriesConsumed === 0) {
      console.log('⚠️ No meals logged today');
      return res.json({ data: null });
    }

    // Get user weight for calorie calculations
    const userWeight = user.profile?.weight || 70;
    const userActivityLevel = user.profile?.activityLevel || 'moderate';

    // Determine exercise intensity based on activity level
    let recommendedIntensity = 'moderate';
    if (userActivityLevel === 'sedentary' || userActivityLevel === 'lightly_active') {
      recommendedIntensity = 'light';
    } else if (userActivityLevel === 'very_active' || userActivityLevel === 'extra_active') {
      recommendedIntensity = 'vigorous';
    }

    let recommendations = [];
    let goal = '';
    let message = '';

    if (caloriesDifference > 200) {
      // User consumed more than target - recommend exercises to burn calories
      goal = 'Burn extra calories';
      message = `✅ You consumed ${Math.round(caloriesDifference)} extra kcal. Here are exercises to burn them!`;
      
      // Get exercises from recommended intensity
      const exercisePool = EXERCISE_RECOMMENDATIONS[recommendedIntensity] || EXERCISE_RECOMMENDATIONS.moderate;
      
      // Find exercises that can help burn the extra calories
      for (const exercise of exercisePool) {
        const caloriesBurned = calculateCaloriesBurned(exercise.met, userWeight, exercise.duration);
        
        if (caloriesBurned >= caloriesDifference * 0.8) {
          recommendations.push({
            name: exercise.name,
            duration: exercise.duration,
            caloriesBurned: caloriesBurned
          });
          
          // Add up to 3 recommendations
          if (recommendations.length >= 3) break;
        }
      }

      // If no perfect match, return the best options from moderate intensity
      if (recommendations.length === 0) {
        const moderateExercises = EXERCISE_RECOMMENDATIONS.moderate;
        for (let i = 0; i < 3 && i < moderateExercises.length; i++) {
          const exercise = moderateExercises[i];
          const caloriesBurned = calculateCaloriesBurned(exercise.met, userWeight, exercise.duration);
          recommendations.push({
            name: exercise.name,
            duration: exercise.duration,
            caloriesBurned: caloriesBurned
          });
        }
      }
    } else if (caloriesDifference < -200) {
      // User consumed less than target
      goal = 'Light activity';
      message = `✅ You're ${Math.round(Math.abs(caloriesDifference))} kcal under your target. Stay active today!`;
      
      // Light exercises as maintenance
      const lightExercises = EXERCISE_RECOMMENDATIONS.light;
      for (let i = 0; i < 3 && i < lightExercises.length; i++) {
        const exercise = lightExercises[i];
        const caloriesBurned = calculateCaloriesBurned(exercise.met, userWeight, exercise.duration);
        recommendations.push({
          name: exercise.name,
          duration: exercise.duration,
          caloriesBurned: caloriesBurned
        });
      }
    } else {
      // Within target range
      goal = 'Maintain balance';
      message = `✅ Great! You're on track with your calorie goal.`;
      
      // Suggest maintenance exercises
      const moderateExercises = EXERCISE_RECOMMENDATIONS.moderate;
      for (let i = 0; i < 2 && i < moderateExercises.length; i++) {
        const exercise = moderateExercises[i];
        const caloriesBurned = calculateCaloriesBurned(exercise.met, userWeight, exercise.duration);
        recommendations.push({
          name: exercise.name,
          duration: exercise.duration,
          caloriesBurned: caloriesBurned
        });
      }
    }

    console.log('✅ Exercise recommendations generated:', { goal, recommendations: recommendations.length });

    res.json({
      data: {
        caloriesConsumed,
        caloriesBurned,
        netCalories,
        targetCalories,
        goal,
        message,
        recommendations,
        caloriesDifference: Math.abs(caloriesDifference)
      }
    });
  } catch (err) {
    next(err);
  }
});

export default router;
