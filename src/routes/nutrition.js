// backend/src/routes/nutrition.js
import express from "express";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import { validateSchema, sanitizeString, sanitizeNumber, validateCalories } from "../middleware/validation.js";
import { searchFood } from "../foodData.js";
import { NotFoundError, ValidationError, ForbiddenError } from "../middleware/errorHandler.js";

const router = express.Router();

/**
 * GET /api/nutrition/today
 * Get today's nutrition entries for the authenticated user
 */
router.get("/today", requireAuth(), async (req, res, next) => {
  try {
    const userId = req.user.sub;
    console.log('📊 Nutrition/today requested for user:', userId);

    // Find user by Google sub or Mongo _id
    let user = await User.findOne({ "google.sub": userId });
    if (!user) {
      user = await User.findById(userId);
    }

    if (!user) {
      throw new NotFoundError("User not found");
    }

    // Get entries from today only
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayEntries = user.nutritionEntries.filter(entry => entry.timestamp >= today);

    // Calculate totals
    const totalCalories = todayEntries.reduce((sum, entry) => sum + (entry.calories || 0), 0);
    const totalProtein = todayEntries.reduce((sum, entry) => sum + (entry.protein || 0), 0);
    const totalCarbs = todayEntries.reduce((sum, entry) => sum + (entry.carbs || 0), 0);
    const totalFat = todayEntries.reduce((sum, entry) => sum + (entry.fat || 0), 0);

    // Check if daily goal is met
    const dailyGoal = user.profile?.dailyCalorieGoal || 2200;
    const goalMet = Math.abs(totalCalories - dailyGoal) <= 200 || totalCalories <= dailyGoal;
    
    // Update today's nutrition summary
    const existingDayIndex = user.dailyNutrition.findIndex(day => {
      const dayDate = new Date(day.date);
      dayDate.setHours(0, 0, 0, 0);
      return dayDate.getTime() === today.getTime();
    });

    if (existingDayIndex >= 0) {
      user.dailyNutrition[existingDayIndex] = { date: today, totalCalories, totalProtein, totalCarbs, totalFat, goalMet };
    } else {
      user.dailyNutrition.push({ date: today, totalCalories, totalProtein, totalCarbs, totalFat, goalMet });
    }

    await user.save();

    res.json({
      entries: todayEntries.map(e => ({
        id: e._id,
        name: e.name,
        calories: e.calories,
        protein: e.protein,
        carbs: e.carbs,
        fat: e.fat,
        servingSize: e.servingSize,
        timestamp: e.timestamp
      })),
      totals: { totalCalories, totalProtein, totalCarbs, totalFat },
      dailyGoal,
      goalMet
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/nutrition/add
 * Add a nutrition entry with validation
 */
router.post("/add", requireAuth(), async (req, res, next) => {
  try {
    const userId = req.user.sub;
    console.log('🍽️ Adding nutrition entry for user:', userId);

    // Validate input
    const validation = validateSchema({
      name: { required: true, sanitize: 'string' },
      calories: { required: true, sanitize: 'number', validate: 'calories' },
      protein: { sanitize: 'number', min: 0, max: 300 },
      carbs: { sanitize: 'number', min: 0, max: 500 },
      fat: { sanitize: 'number', min: 0, max: 300 },
      servingSize: { sanitize: 'string' }
    }, req.body);

    if (!validation.valid) {
      throw new ValidationError('Validation failed', validation.errors);
    }

    const { name, calories, protein, carbs, fat, servingSize } = validation.sanitized;

    // Find user
    let user = await User.findOne({ "google.sub": userId });
    if (!user) {
      user = await User.findById(userId);
    }

    if (!user) {
      throw new NotFoundError("User not found");
    }

    const newEntry = {
      name,
      calories: Math.round(calories),
      protein: protein ? Math.round(protein * 10) / 10 : undefined,
      carbs: carbs ? Math.round(carbs * 10) / 10 : undefined,
      fat: fat ? Math.round(fat * 10) / 10 : undefined,
      servingSize,
      timestamp: new Date()
    };

    user.nutritionEntries.push(newEntry);
    await user.save();

    console.log(`✅ Added nutrition entry: ${name} (${calories} kcal) for ${user.email}`);

    res.status(201).json({
      message: "Entry added successfully",
      entry: user.nutritionEntries[user.nutritionEntries.length - 1]
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/nutrition/:entryId
 * Delete a nutrition entry (ownership enforced)
 */
router.delete("/:entryId", requireAuth(), async (req, res, next) => {
  try {
    const userId = req.user.sub;
    const entryId = req.params.entryId;

    // Find user
    let user = await User.findOne({ "google.sub": userId });
    if (!user) {
      user = await User.findById(userId);
    }

    if (!user) {
      throw new NotFoundError("User not found");
    }

    const initialLength = user.nutritionEntries.length;
    user.nutritionEntries = user.nutritionEntries.filter(e => e._id.toString() !== entryId);

    if (user.nutritionEntries.length === initialLength) {
      throw new NotFoundError("Nutrition entry not found");
    }

    await user.save();
    console.log(`✅ Deleted nutrition entry ${entryId} for ${user.email}`);

    res.json({ message: "Entry deleted successfully" });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/nutrition/history
 * Get nutrition history (last 7 days by default)
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

    // Get last N days of summaries
    const history = user.dailyNutrition
      .sort((a, b) => b.date - a.date)
      .slice(0, days)
      .reverse();

    res.json({ history });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/nutrition/search-food
 * Search food database (USDA + Pakistani dishes)
 */
router.get("/search-food", async (req, res, next) => {
  try {
    const { query } = req.query;

    if (!query || query.trim().length < 2) {
      throw new ValidationError('Query must be at least 2 characters', { query: 'Too short' });
    }

    const results = await searchFood(query);
    res.json({ results });
  } catch (err) {
    next(err);
  }
});

export default router;
