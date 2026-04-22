// backend/src/middleware/auth.js
import jwt from "jsonwebtoken";

/**
 * Get TOKEN_SECRET from environment (read at runtime, not module load)
 */
function getTokenSecret() {
  const secret = process.env.TOKEN_SECRET;
  if (!secret) {
    throw new Error('TOKEN_SECRET environment variable is not set. Check your .env file.');
  }
  return secret;
}

/**
 * Verify JWT token and return decoded payload
 * @param {string} token - JWT token string
 * @returns {object|null} - Decoded token or null if invalid
 */
export function verifyJwt(token) {
  try {
    const secret = getTokenSecret();
    const decoded = jwt.verify(token, secret);
    console.log('✅ JWT verified successfully:', { sub: decoded.sub, email: decoded.email });
    return decoded;
  } catch (err) {
    console.error('❌ JWT verification failed:', err.message);
    if (err.name === 'TokenExpiredError') {
      console.error('⏰ Token expired at:', err.expiredAt);
    } else if (err.name === 'JsonWebTokenError') {
      console.error('🔒 Invalid token signature or malformed token');
    }
    return null;
  }
}

/**
 * Sign a JWT token
 * @param {object} payload - Data to encode
 * @returns {string} - Signed JWT token
 */
export function signJwt(payload) {
  const secret = getTokenSecret();
  const expiresIn = process.env.TOKEN_EXPIRES_IN || "1d";
  return jwt.sign(payload, secret, { expiresIn });
}

/**
 * Middleware to require JWT authentication
 * Extracts Bearer token, verifies it, and attaches user to req
 * 
 * Usage:
 *   app.get("/api/protected", requireAuth(), handler)
 *   const userId = req.user.sub
 */
export function requireAuth() {
  return (req, res, next) => {
    const auth = req.headers.authorization;

    if (!auth || !auth.startsWith("Bearer ")) {
      return res.status(401).json({ 
        error: "Unauthorized",
        message: "Missing or invalid Bearer token" 
      });
    }

    const token = auth.split(" ")[1];
    const payload = verifyJwt(token);

    if (!payload) {
      return res.status(401).json({ 
        error: "Unauthorized",
        message: "Invalid or expired token" 
      });
    }

    req.user = payload;
    next();
  };
}

/**
 * Middleware to require authentication AND ownership check
 * Ensures user can only access their own data
 * 
 * Usage:
 *   app.get("/api/user/:userId", requireAuthAndOwnership("userId"), handler)
 *   - Verifies token and checks req.params.userId matches req.user.sub
 */
export function requireAuthAndOwnership(paramName = "userId") {
  return (req, res, next) => {
    const auth = req.headers.authorization;

    if (!auth || !auth.startsWith("Bearer ")) {
      return res.status(401).json({ 
        error: "Unauthorized",
        message: "Missing or invalid Bearer token" 
      });
    }

    const token = auth.split(" ")[1];
    const payload = verifyJwt(token);

    if (!payload) {
      return res.status(401).json({ 
        error: "Unauthorized",
        message: "Invalid or expired token" 
      });
    }

    // Check ownership
    const requestedId = req.params[paramName];
    if (requestedId && requestedId !== payload.sub) {
      return res.status(403).json({ 
        error: "Forbidden",
        message: "You do not have permission to access this resource" 
      });
    }

    req.user = payload;
    next();
  };
}
