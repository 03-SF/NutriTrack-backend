// backend/src/models/User.js
import mongoose from 'mongoose';

const GoogleTokensSchema = new mongoose.Schema({
  access_token: String,
  refresh_token: String,
  scope: String,
  token_type: String,
  expiry_date: Number
}, { _id: false });

const FitnessDataSchema = new mongoose.Schema({
  steps: { type: Number, default: 0 },
  calories: { type: Number, default: 0 },
  heartPoints: { type: Number, default: 0 },
  distance: { type: Number, default: 0 },
  weight: Number,
  height: Number,
  bodyFat: Number,
  bmi: Number,
  heartRate: [{
    value: Number,
    time: String
  }],
  activities: [{
    name: String,
    startTime: Date,
    endTime: Date,
    duration: Number,
    calories: Number
  }],
  lastSyncedAt: { type: Date, default: Date.now }
}, { _id: false });

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  name: { type: String },
  password: { type: String }, // For email/password auth (hashed)

  // User profile for personalized experience
  profile: {
    age: Number,
    gender: { type: String, enum: ['male', 'female', 'other'] },
    height: Number, // in cm
    weight: Number, // in kg
    activityLevel: { 
      type: String, 
      enum: ['sedentary', 'lightly_active', 'moderate', 'very_active', 'extra_active'],
      default: 'sedentary'
    },
    goal: { 
      type: String, 
      enum: ['lose', 'maintain', 'gain'],
      default: 'maintain'
    },
    dailyCalorieGoal: Number, // calculated based on profile
    isProfileComplete: { type: Boolean, default: false }
  },

  google: {
    sub: String, // Google subject id
    tokens: GoogleTokensSchema,
    fitConnected: { type: Boolean, default: false }
  },

  latestAggregated: { type: Object }, // store last aggregated data (raw)
  fitnessData: FitnessDataSchema,     // parsed fitness data
  
  nutritionEntries: [{
    name: { type: String, required: true },
    calories: { type: Number, required: true },
    protein: Number,
    carbs: Number,
    fat: Number,
    servingSize: String,
    timestamp: { type: Date, default: Date.now }
  }],

  // Manual workout entries
  workoutEntries: [{
    type: { type: String, required: true }, // e.g., "running", "cycling", "weightlifting"
    duration: { type: Number, required: true }, // in minutes
    caloriesBurned: { type: Number, required: true },
    intensity: { type: String, enum: ['light', 'moderate', 'vigorous'], default: 'moderate' },
    notes: String,
    timestamp: { type: Date, default: Date.now }
  }],

  // Daily nutrition summaries for historical tracking
  dailyNutrition: [{
    date: { type: Date, required: true }, // Date at midnight
    totalCalories: { type: Number, default: 0 },
    totalProtein: { type: Number, default: 0 },
    totalCarbs: { type: Number, default: 0 },
    totalFat: { type: Number, default: 0 },
    entryCount: { type: Number, default: 0 },
    goalMet: { type: Boolean, default: false } // Track if daily goal was met
  }],

  // Streak tracking
  streaks: {
    login: {
      current: { type: Number, default: 0 },
      longest: { type: Number, default: 0 },
      lastLoginDate: Date
    },
    goalCompletion: {
      current: { type: Number, default: 0 },
      longest: { type: Number, default: 0 },
      lastCompletionDate: Date
    }
  },
  
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('User', UserSchema);
