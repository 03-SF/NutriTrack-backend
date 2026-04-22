// backend/src/foodData.js
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const USDA_API_KEY = process.env.USDA_API_KEY;
const USDA_BASE_URL = 'https://api.nal.usda.gov/fdc/v1';

// Pakistani dishes fallback database
const PAKISTANI_DISHES = {
  'chapati': { calories: 120, protein: 3.5, carbs: 22, fat: 2.5, servingSize: '1 medium (40g)' },
  'roti': { calories: 120, protein: 3.5, carbs: 22, fat: 2.5, servingSize: '1 medium (40g)' },
  'paratha': { calories: 280, protein: 5, carbs: 35, fat: 13, servingSize: '1 medium (100g)' },
  'naan': { calories: 262, protein: 7.5, carbs: 45, fat: 5.5, servingSize: '1 piece (90g)' },
  'biryani': { calories: 350, protein: 15, carbs: 45, fat: 12, servingSize: '1 plate (250g)' },
  'chicken biryani': { calories: 400, protein: 20, carbs: 48, fat: 15, servingSize: '1 plate (300g)' },
  'mutton biryani': { calories: 450, protein: 22, carbs: 48, fat: 18, servingSize: '1 plate (300g)' },
  'pulao': { calories: 280, protein: 10, carbs: 42, fat: 8, servingSize: '1 plate (200g)' },
  'dal': { calories: 180, protein: 9, carbs: 28, fat: 4, servingSize: '1 bowl (200ml)' },
  'daal': { calories: 180, protein: 9, carbs: 28, fat: 4, servingSize: '1 bowl (200ml)' },
  'dal makhani': { calories: 250, protein: 10, carbs: 25, fat: 12, servingSize: '1 bowl (200ml)' },
  'chana': { calories: 210, protein: 11, carbs: 32, fat: 4.5, servingSize: '1 bowl (150g)' },
  'haleem': { calories: 320, protein: 18, carbs: 30, fat: 14, servingSize: '1 bowl (250g)' },
  'nihari': { calories: 380, protein: 25, carbs: 15, fat: 24, servingSize: '1 bowl (300g)' },
  'karahi': { calories: 320, protein: 22, carbs: 12, fat: 20, servingSize: '1 serving (250g)' },
  'korma': { calories: 350, protein: 18, carbs: 18, fat: 22, servingSize: '1 serving (250g)' },
  'samosa': { calories: 150, protein: 4, carbs: 18, fat: 7, servingSize: '1 piece (50g)' },
  'pakora': { calories: 130, protein: 3, carbs: 15, fat: 6, servingSize: '3 pieces (60g)' },
  'chai': { calories: 80, protein: 2, carbs: 12, fat: 3, servingSize: '1 cup (200ml)' },
  'lassi': { calories: 150, protein: 5, carbs: 22, fat: 4, servingSize: '1 glass (250ml)' },
  'kheer': { calories: 180, protein: 5, carbs: 28, fat: 6, servingSize: '1 bowl (150g)' },
  'gulab jamun': { calories: 175, protein: 3, carbs: 28, fat: 6, servingSize: '2 pieces (60g)' },
  'jalebi': { calories: 150, protein: 2, carbs: 32, fat: 3, servingSize: '2 pieces (50g)' },
  'saag': { calories: 120, protein: 4, carbs: 12, fat: 6, servingSize: '1 bowl (200g)' },
  'aloo gosht': { calories: 320, protein: 18, carbs: 22, fat: 18, servingSize: '1 serving (250g)' },
  'chicken tikka': { calories: 220, protein: 26, carbs: 5, fat: 10, servingSize: '1 serving (150g)' },
  'seekh kabab': { calories: 280, protein: 20, carbs: 8, fat: 18, servingSize: '2 pieces (120g)' },
  'shami kabab': { calories: 180, protein: 14, carbs: 10, fat: 10, servingSize: '2 pieces (100g)' },
};

/**
 * Search for food in USDA database
 * @param {string} query - Food name to search
 * @param {number} pageSize - Number of results to return
 * @returns {Promise<Array>} - Array of food items with nutrition info
 */
export async function searchUSDAFood(query, pageSize = 5) {
  try {
    if (!USDA_API_KEY) {
      console.warn('⚠️ USDA_API_KEY not configured, using fallback only');
      return [];
    }

    console.log(`🔍 USDA Search: "${query}"`);
    const response = await axios.get(`${USDA_BASE_URL}/foods/search`, {
      params: {
        api_key: USDA_API_KEY,
        query: query,
        pageSize: pageSize
      }
    });

    console.log(`📦 USDA Response: ${response.data.foods?.length || 0} foods found`);
    
    if (!response.data.foods || response.data.foods.length === 0) {
      console.log('⚠️ No USDA results found');
      return [];
    }

    // Parse and format the results
    return response.data.foods.map(food => {
      const nutrients = {};
      
      // Extract key nutrients
      food.foodNutrients?.forEach(nutrient => {
        const name = nutrient.nutrientName?.toLowerCase();
        if (name?.includes('energy') || name?.includes('calorie')) {
          nutrients.calories = nutrient.value;
        } else if (name?.includes('protein')) {
          nutrients.protein = nutrient.value;
        } else if (name?.includes('carbohydrate')) {
          nutrients.carbs = nutrient.value;
        } else if (name?.includes('total lipid') || name?.includes('fat')) {
          nutrients.fat = nutrient.value;
        }
      });

      return {
        fdcId: food.fdcId,
        name: food.description || food.lowercaseDescription,
        calories: nutrients.calories || 0,
        protein: nutrients.protein || 0,
        carbs: nutrients.carbs || 0,
        fat: nutrients.fat || 0,
        servingSize: food.servingSize ? `${food.servingSize}${food.servingSizeUnit || 'g'}` : '100g',
        source: 'USDA'
      };
    });
  } catch (error) {
    console.error('❌ USDA API Error:', error.response?.status, error.response?.data || error.message);
    if (error.response?.data) {
      console.error('USDA Error Details:', JSON.stringify(error.response.data, null, 2));
    }
    return [];
  }
}

/**
 * Search in Pakistani dishes database
 * @param {string} query - Food name to search
 * @returns {Array} - Array of matching Pakistani dishes
 */
export function searchPakistaniDishes(query) {
  const lowerQuery = query.toLowerCase().trim();
  const results = [];

  for (const [dishName, nutrition] of Object.entries(PAKISTANI_DISHES)) {
    if (dishName.includes(lowerQuery) || lowerQuery.includes(dishName)) {
      results.push({
        name: dishName.charAt(0).toUpperCase() + dishName.slice(1),
        calories: nutrition.calories,
        protein: nutrition.protein,
        carbs: nutrition.carbs,
        fat: nutrition.fat,
        servingSize: nutrition.servingSize,
        source: 'Pakistani Dishes'
      });
    }
  }

  return results;
}

/**
 * Search for food in both USDA and Pakistani databases
 * @param {string} query - Food name to search
 * @returns {Promise<Array>} - Combined results from both sources
 */
export async function searchFood(query) {
  try {
    // Search Pakistani dishes first (faster)
    const pakistaniResults = searchPakistaniDishes(query);

    // Search USDA database
    const usdaResults = await searchUSDAFood(query);

    // Combine results, Pakistani dishes first
    const combined = [...pakistaniResults, ...usdaResults];

    console.log(`🔍 Food search for "${query}": Found ${pakistaniResults.length} Pakistani + ${usdaResults.length} USDA results`);

    return combined;
  } catch (error) {
    console.error('Food search error:', error);
    // Return at least Pakistani results if USDA fails
    return searchPakistaniDishes(query);
  }
}

/**
 * Get detailed nutrition info for a specific USDA food item
 * @param {number} fdcId - FDC ID of the food
 * @returns {Promise<Object>} - Detailed nutrition information
 */
export async function getUSDAFoodDetails(fdcId) {
  try {
    if (!USDA_API_KEY) {
      throw new Error('USDA_API_KEY not configured');
    }

    const response = await axios.get(`${USDA_BASE_URL}/food/${fdcId}`, {
      params: {
        api_key: USDA_API_KEY
      }
    });

    const food = response.data;
    const nutrients = {};

    food.foodNutrients?.forEach(nutrient => {
      const name = nutrient.nutrient?.name?.toLowerCase();
      if (name?.includes('energy') || name?.includes('calorie')) {
        nutrients.calories = nutrient.amount;
      } else if (name?.includes('protein')) {
        nutrients.protein = nutrient.amount;
      } else if (name?.includes('carbohydrate')) {
        nutrients.carbs = nutrient.amount;
      } else if (name?.includes('total lipid') || name?.includes('fat')) {
        nutrients.fat = nutrient.amount;
      }
    });

    return {
      fdcId: food.fdcId,
      name: food.description,
      calories: nutrients.calories || 0,
      protein: nutrients.protein || 0,
      carbs: nutrients.carbs || 0,
      fat: nutrients.fat || 0,
      servingSize: '100g',
      source: 'USDA'
    };
  } catch (error) {
    console.error('USDA Food Details Error:', error.message);
    throw error;
  }
}
