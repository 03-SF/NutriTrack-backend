// backend/src/routes/auth.js
import express from "express";
import bcrypt from "bcrypt";
import { OAuth2Client } from "google-auth-library";
import User from "../models/User.js";
import { signJwt } from "../middleware/auth.js";
import { validateSchema, sanitizeEmail } from "../middleware/validation.js";
import { ValidationError } from "../middleware/errorHandler.js";

const router = express.Router();

// ================== HELPERS ==================

function updateLoginStreak(user) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (!user.streaks) {
    user.streaks = {
      login: { current: 1, longest: 1, lastLoginDate: today },
      goalCompletion: { current: 0, longest: 0 }
    };
    return;
  }

  const lastLogin = user.streaks.login?.lastLoginDate;
  
  if (!lastLogin) {
    user.streaks.login = { current: 1, longest: 1, lastLoginDate: today };
    return;
  }

  const lastLoginDate = new Date(lastLogin);
  lastLoginDate.setHours(0, 0, 0, 0);
  
  const daysDiff = Math.floor((today - lastLoginDate) / (1000 * 60 * 60 * 24));

  if (daysDiff === 0) {
    return;
  } else if (daysDiff === 1) {
    user.streaks.login.current += 1;
    user.streaks.login.lastLoginDate = today;
    
    if (user.streaks.login.current > user.streaks.login.longest) {
      user.streaks.login.longest = user.streaks.login.current;
    }
  } else {
    user.streaks.login.current = 1;
    user.streaks.login.lastLoginDate = today;
  }
}

function checkAndUpdateGoalStreak(user) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (!user.streaks) {
    user.streaks = {
      login: { current: 0, longest: 0 },
      goalCompletion: { current: 0, longest: 0 }
    };
  }

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const yesterdayNutrition = user.dailyNutrition.find(day => {
    const dayDate = new Date(day.date);
    dayDate.setHours(0, 0, 0, 0);
    return dayDate.getTime() === yesterday.getTime();
  });

  if (!yesterdayNutrition || !yesterdayNutrition.goalMet) {
    const lastCompletion = user.streaks.goalCompletion?.lastCompletionDate;
    if (lastCompletion) {
      const lastDate = new Date(lastCompletion);
      lastDate.setHours(0, 0, 0, 0);
      const daysSinceCompletion = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));
      
      if (daysSinceCompletion > 1) {
        user.streaks.goalCompletion.current = 0;
      }
    }
  } else {
    const lastCompletion = user.streaks.goalCompletion?.lastCompletionDate;
    
    if (!lastCompletion) {
      user.streaks.goalCompletion.current = 1;
      user.streaks.goalCompletion.longest = 1;
      user.streaks.goalCompletion.lastCompletionDate = yesterday;
    } else {
      const lastDate = new Date(lastCompletion);
      lastDate.setHours(0, 0, 0, 0);
      const daysDiff = Math.floor((yesterday - lastDate) / (1000 * 60 * 60 * 24));
      
      if (daysDiff === 1) {
        user.streaks.goalCompletion.current += 1;
        user.streaks.goalCompletion.lastCompletionDate = yesterday;
        
        if (user.streaks.goalCompletion.current > user.streaks.goalCompletion.longest) {
          user.streaks.goalCompletion.longest = user.streaks.goalCompletion.current;
        }
      }
    }
  }
}

function createOauthClient(redirectUri = null) {
  // Prefer explicit redirect URI env var in deployed environments (e.g. Vercel)
  const explicitRedirect =
    process.env.GOOGLE_OAUTH_REDIRECT ||
    process.env.GOOGLE_REDIRECT_URI ||
    process.env.GOOGLE_OAUTH_REDIRECT_URI;

  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
  redirectUri = redirectUri || explicitRedirect || `${baseUrl}/api/auth/google/callback`;
  
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
}

const SCOPES = [
  "https://www.googleapis.com/auth/fitness.activity.read",
  "https://www.googleapis.com/auth/fitness.body.read",
  "https://www.googleapis.com/auth/fitness.body.write",
  "https://www.googleapis.com/auth/fitness.heart_rate.read",
  "https://www.googleapis.com/auth/fitness.location.read",
  "https://www.googleapis.com/auth/fitness.nutrition.read",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid"
];

// ================== ROUTES ==================

/**
 * POST /api/auth/signup
 * Email/password signup with validation
 */
router.post("/signup", async (req, res, next) => {
  try {
    console.log('📝 SIGNUP REQUEST RECEIVED:', { email: req.body.email });

    // Validate input
    const validation = validateSchema({
      name: { required: true, sanitize: 'string' },
      email: { required: true, sanitize: 'email', validate: 'email' },
      password: { required: true, validate: 'password' }
    }, req.body);

    if (!validation.valid) {
      throw new ValidationError('Validation failed', validation.errors);
    }

    const { name, email, password } = validation.sanitized;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log('❌ User already exists:', email);
      throw new ValidationError('Email already registered', { email: 'This email is already in use' });
    }

    // Hash password with bcrypt
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const user = new User({
      name,
      email,
      password: hashedPassword,
      createdAt: new Date()
    });

    await user.save();

    // Generate JWT
    const token = signJwt({
      sub: user._id.toString(),
      email: user.email,
      name: user.name
    });

    console.log(`✅ New user registered: ${email}`);

    res.status(201).json({
      message: "Account created successfully",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/login
 * Email/password login with validation
 */
router.post("/login", async (req, res, next) => {
  try {
    console.log('🔐 LOGIN REQUEST RECEIVED:', { email: req.body.email });

    // Validate input
    const validation = validateSchema({
      email: { required: true, sanitize: 'email', validate: 'email' },
      password: { required: true }
    }, req.body);

    if (!validation.valid) {
      throw new ValidationError('Validation failed', validation.errors);
    }

    const { email, password } = validation.sanitized;

    // Find user
    const user = await User.findOne({ email });
    if (!user || !user.password) {
      console.log('❌ Invalid credentials for:', email);
      throw new ValidationError('Invalid email or password', { 
        credentials: 'Invalid email or password' 
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      console.log('❌ Invalid password for:', email);
      throw new ValidationError('Invalid email or password', { 
        credentials: 'Invalid email or password' 
      });
    }

    // Update login streak
    updateLoginStreak(user);
    checkAndUpdateGoalStreak(user);
    await user.save();

    // Generate JWT
    const token = signJwt({
      sub: user._id.toString(),
      email: user.email,
      name: user.name
    });

    console.log(`✅ User logged in: ${email}`);

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/google/url
 * Return the Google OAuth authorization URL
 */
router.get("/google/url", (req, res, next) => {
  try {
    console.log('🔗 Google OAuth URL requested');
    const client = createOauthClient();
    const url = client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: SCOPES,
    });
    console.log('✅ Generated Google OAuth URL');
    res.json({ url });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/google/callback
 * OAuth callback handler
 */
router.get("/google/callback", async (req, res, next) => {
  try {
    const { code } = req.query;
    if (!code) {
      throw new ValidationError('Authorization code is missing', { code: 'Required' });
    }

    console.log('🔄 OAuth Callback received');
    
    const client = createOauthClient();
    const { tokens } = await client.getToken(code);
    console.log('✅ Tokens obtained from Google');
    console.log('🧾 Granted scopes:', tokens?.scope || '(none reported)');
    console.log('🔐 Has refresh_token:', Boolean(tokens?.refresh_token));

    client.setCredentials(tokens);

    const { data: profile } = await client.request({
      url: "https://www.googleapis.com/oauth2/v3/userinfo",
    });
    console.log('👤 User profile obtained:', profile.email);

    const sub = profile.sub;

    let user = await User.findOne({ "google.sub": sub });
    if (!user) {
      console.log('📝 Creating new user from Google OAuth');
      user = new User({
        email: profile.email,
        name: profile.name,
        google: {
          sub,
          tokens,
          fitConnected: true,
        },
      });
    } else {
      console.log('✅ Existing user found, updating tokens');
      // Google often doesn't resend refresh_token; preserve the existing one.
      const existing = user.google?.tokens?.toObject?.() || user.google?.tokens || {};
      user.google.tokens = {
        ...existing,
        ...tokens,
        refresh_token: tokens?.refresh_token || existing.refresh_token,
      };
      user.google.fitConnected = true;
    }

    // Update login streak
    updateLoginStreak(user);
    checkAndUpdateGoalStreak(user);

    await user.save();
    console.log('💾 User saved to database');

    const frontendToken = signJwt({
      sub,
      email: user.email,
      name: user.name
    });
    console.log('🔑 JWT generated for frontend');

    const redirect = `${process.env.FRONTEND_URL}/#token=${frontendToken}`;
    console.log('🔀 Redirecting to:', redirect);
    return res.redirect(redirect);
  } catch (err) {
    next(err);
  }
});

export default router;
