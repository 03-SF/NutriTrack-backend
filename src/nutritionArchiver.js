// backend/src/nutritionArchiver.js
import cron from 'node-cron';
import User from './models/User.js';

/**
 * Archives today's nutrition entries into dailyNutrition summary
 * and clears entries older than 24 hours
 */
async function archiveDailyNutrition() {
  try {
    console.log('🗂️ Starting daily nutrition archival...');

    const users = await User.find({ 'nutritionEntries.0': { $exists: true } });
    
    for (const user of users) {
      // Get today's start (midnight)
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const yesterdayStart = new Date(todayStart);
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);

      // Find entries from yesterday
      const yesterdayEntries = user.nutritionEntries.filter(entry => {
        const entryDate = new Date(entry.timestamp);
        return entryDate >= yesterdayStart && entryDate < todayStart;
      });

      if (yesterdayEntries.length > 0) {
        // Calculate totals
        const totalCalories = yesterdayEntries.reduce((sum, e) => sum + e.calories, 0);
        const totalProtein = yesterdayEntries.reduce((sum, e) => sum + (e.protein || 0), 0);
        const totalCarbs = yesterdayEntries.reduce((sum, e) => sum + (e.carbs || 0), 0);
        const totalFat = yesterdayEntries.reduce((sum, e) => sum + (e.fat || 0), 0);

        // Check if summary already exists for yesterday
        const existingSummaryIndex = user.dailyNutrition.findIndex(
          summary => summary.date.getTime() === yesterdayStart.getTime()
        );

        if (existingSummaryIndex >= 0) {
          // Update existing summary
          user.dailyNutrition[existingSummaryIndex] = {
            date: yesterdayStart,
            totalCalories,
            totalProtein,
            totalCarbs,
            totalFat,
            entryCount: yesterdayEntries.length
          };
        } else {
          // Add new summary
          user.dailyNutrition.push({
            date: yesterdayStart,
            totalCalories,
            totalProtein,
            totalCarbs,
            totalFat,
            entryCount: yesterdayEntries.length
          });
        }

        // Remove entries older than 24 hours
        user.nutritionEntries = user.nutritionEntries.filter(entry => {
          const entryDate = new Date(entry.timestamp);
          return entryDate >= todayStart;
        });

        // Keep only last 30 days of summaries
        user.dailyNutrition = user.dailyNutrition
          .sort((a, b) => b.date - a.date)
          .slice(0, 30);

        await user.save();

        console.log(`✅ Archived ${yesterdayEntries.length} entries for ${user.email}`);
      }
    }

    console.log('✅ Daily nutrition archival completed');
  } catch (error) {
    console.error('❌ Daily nutrition archival error:', error);
  }
}

/**
 * Schedule daily archival job at midnight (00:00)
 */
export function startNutritionArchiver() {
  // Run at midnight every day
  cron.schedule('0 0 * * *', archiveDailyNutrition, {
    timezone: 'Asia/Karachi' // Adjust to your timezone
  });

  console.log('📅 Nutrition archiver scheduled: Daily at midnight');
}

// Export for manual testing
export { archiveDailyNutrition };
