# NutriTrack AI - Backend

Complete Google Fit integration with OAuth 2.0, automatic data syncing, and real-time updates.

## Quick Start

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. **Start MongoDB**
   ```bash
   mongod
   ```

4. **Run the server**
   ```bash
   npm run dev
   ```

## Features

### Complete OAuth 2.0 Flow
- Secure Google authentication
- Automatic token refresh
- No manual re-login required
- Token expiration handling

### Comprehensive Health Data
- **Steps** - Daily and hourly tracking
- **Calories** - Total expenditure
- **Heart Points** - Active minutes
- **Distance** - Km traveled
- **Activities** - Workout sessions
- **Body Metrics** - Weight, height, BMI, body fat
- **Heart Rate** - BPM tracking
- **Nutrition** - Dietary data

### Automatic Syncing
- Runs every 15 minutes
- Fetches last 24 hours of data
- Real-time Socket.IO updates
- Rate limiting & error handling
- Retry logic with backoff

### REST API
- Get daily aggregated data
- Get hourly breakdown
- Get activities/sessions
- Manual sync trigger
- User profile endpoint

## Project Structure

```
backend/
├── src/
│   ├── app.js              # Express app & routes
│   ├── server.js           # HTTP & Socket.IO server
│   ├── googleFit.js        # Google Fit API integration
│   ├── syncJob.js          # Cron job for auto-sync
│   ├── models/
│   │   └── User.js         # User & fitness data schema
│   ├── routes/
│   │   └── authRoutes.js   # OAuth routes (legacy)
│   ├── socket/
│   │   └── socketManager.js # Socket connection management
│   └── config/
│       └── db.js           # MongoDB configuration
├── .env.example            # Environment variables template
├── GOOGLE_FIT_SETUP.md     # Detailed setup guide
├── API_REFERENCE.md        # API documentation
└── package.json
```

## Configuration

### Environment Variables

Create a `.env` file with:

```env
# Server
PORT=5000
BASE_URL=http://localhost:5000
FRONTEND_URL=http://localhost:5173

# MongoDB
MONGO_URI=mongodb://localhost:27017/nutritrack-ai

# JWT
TOKEN_SECRET=your-secret-key
SESSION_SECRET=your-session-secret
TOKEN_EXPIRES_IN=1d

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_OAUTH_REDIRECT=http://localhost:5000/api/auth/google/callback
```

### Google Cloud Setup

1. Create project at [Google Cloud Console](https://console.cloud.google.com/)
2. Enable **Google Fitness API**
3. Create OAuth 2.0 credentials
4. Add redirect URI: `http://localhost:5000/api/auth/google/callback`
5. Copy Client ID and Secret to `.env`

See [GOOGLE_FIT_SETUP.md](./GOOGLE_FIT_SETUP.md) for detailed instructions.

## API Endpoints

### Authentication
- `GET /api/auth/google/url` - Get OAuth URL
- `GET /api/auth/google/callback` - OAuth callback

### Fitness Data
- `GET /api/fitness/today` - Last 24h aggregated data
- `GET /api/fitness/hourly?hours=24` - Hourly breakdown
- `GET /api/fitness/activities?days=7` - Activities list
- `POST /api/fitness/sync` - Manual sync

### User
- `GET /api/user/profile` - User profile & fitness summary

See [API_REFERENCE.md](./API_REFERENCE.md) for full documentation.

## Data Flow

```
User → Frontend → OAuth URL → Google OAuth
                                    ↓
                              Authorization
                                    ↓
                          Backend (callback) → Store tokens
                                    ↓
                              Generate JWT → Frontend
                                    ↓
                          Frontend stores token
                                    ↓
                    Authenticated API requests ← → Backend
                                    ↑
                              Sync Job (15min)
                                    ↓
                          Fetch Google Fit data
                                    ↓
                          Save to MongoDB
                                    ↓
                    Socket.IO → Real-time updates → Frontend
```

## Sync Job

Automatic data synchronization:
- **Schedule**: Every 15 minutes (configurable)
- **Data range**: Last 24 hours
- **Rate limiting**: 2-second delay between users
- **Retries**: Up to 3 attempts with exponential backoff
- **Error handling**: Handles 401, 403, 429 errors

Configure in `src/syncJob.js`:
```javascript
cron.schedule("*/15 * * * *", async () => { ... });
```

## Database Schema

```javascript
User {
  email: String,
  name: String,
  profile: {
    age: Number,
    weight: Number,
    height: Number,
    goals: String
  },
  google: {
    sub: String,  // Google user ID
    tokens: {
      access_token: String,
      refresh_token: String,
      expiry_date: Number
    },
    fitConnected: Boolean
  },
  fitnessData: {
    steps: Number,
    calories: Number,
    heartPoints: Number,
    distance: Number,
    weight: Number,
    height: Number,
    bodyFat: Number,
    bmi: Number,
    heartRate: Array,
    activities: Array,
    lastSyncedAt: Date
  },
  latestAggregated: Object,  // Raw Google Fit data
  createdAt: Date
}
```

## Security

- JWT-based authentication
- Secure token storage
- HTTPS in production
- Environment-specific OAuth URIs
- Rate limiting
- Input validation
- Error sanitization

## Dependencies

- **express** - Web framework
- **mongoose** - MongoDB ODM
- **googleapis** - Google APIs client
- **socket.io** - Real-time communication
- **node-cron** - Task scheduling
- **jsonwebtoken** - JWT authentication
- **dotenv** - Environment configuration
- **cors** - Cross-origin requests

## Troubleshooting

### No data returned
- Check if user has data in Google Fit app
- Verify scopes in Google Cloud Console
- Ensure Google Fitness API is enabled

### Token refresh failed
- Verify `access_type: "offline"` in OAuth URL
- Check refresh_token exists in database
- Ensure credentials are correct in `.env`

### 403 Permission Denied
- User may have revoked access
- Re-authorize the application
- Check OAuth consent screen approval

### Rate limiting (429)
- Reduce sync frequency
- Increase delay between users
- Check API quota in Google Console


## Development

```bash
# Start in development mode
npm run dev

# Start in production mode
npm start
```

##  Scripts

```json
{
  "start": "node src/server.js",
  "dev": "nodemon src/server.js"
}
```

## Production Deployment

1. Set `NODE_ENV=production`
2. Use HTTPS for all endpoints
3. Update OAuth redirect URIs
4. Configure MongoDB Atlas
5. Set strong secrets
6. Enable CORS for production domain
7. Set up monitoring & logging
8. Configure rate limiting

## Author

Sumrun Fatima

Muhammad Hassan Khan

