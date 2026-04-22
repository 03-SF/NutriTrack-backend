import { google } from "googleapis";
import User from "./models/User.js";
import dotenv from "dotenv";
import { AppError, ForbiddenError, UnauthorizedError, ValidationError } from "./middleware/errorHandler.js";

dotenv.config();

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_OAUTH_REDIRECT;

function createOAuthClient() {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

async function getAuthorizedClientForUser(user) {
  if (!user.google?.tokens?.refresh_token) {
    throw new ValidationError("Google Fit tokens are missing. Please reconnect Google Fit.", {
      googleTokens: "Missing refresh_token"
    });
  }

  const client = createOAuthClient();
  client.setCredentials(user.google.tokens);

  // Check if token is expired or about to expire (5 min buffer)
  const now = Date.now();
  const expiryDate = user.google.tokens.expiry_date || 0;
  
  if (expiryDate - now < 5 * 60 * 1000) {
    console.log('🔄 Token expired or expiring soon, refreshing...');
    try {
      const { credentials } = await client.refreshAccessToken();
      
      user.google.tokens.access_token = credentials.access_token;
      user.google.tokens.expiry_date = credentials.expiry_date;
      
      if (credentials.refresh_token) {
        user.google.tokens.refresh_token = credentials.refresh_token;
      }
      
      await user.save();
      console.log('✅ Token refreshed successfully');
      
      // Update client with new credentials
      client.setCredentials(user.google.tokens);
    } catch (err) {
      console.error('❌ Token refresh failed:', err.message);
      throw new UnauthorizedError('Failed to refresh Google tokens. Please re-authenticate.');
    }
  }

  client.on("tokens", async (tokens) => {
    if (tokens.access_token) {
      user.google.tokens.access_token = tokens.access_token;
    }
    if (tokens.expiry_date) {
      user.google.tokens.expiry_date = tokens.expiry_date;
    }
    if (tokens.refresh_token) {
      user.google.tokens.refresh_token = tokens.refresh_token;
    }
    await user.save();
  });

  return client;
}

// Try reading data directly from the datastore
async function fetchDirectSteps(user, startMs, endMs) {
  let retries = 2;
  let lastError;
  
  while (retries > 0) {
    try {
      const authClient = await getAuthorizedClientForUser(user);
      const fitness = google.fitness({ version: "v1", auth: authClient });

      console.log(`\n🔬 Fetching Google Fit Data (Attempt ${3 - retries})`);
      console.log(`📅 Time Range: ${new Date(startMs).toISOString()} to ${new Date(endMs).toISOString()}`);
      console.log(`📅 Local Time: ${new Date(startMs).toLocaleString()} to ${new Date(endMs).toLocaleString()}`);

      let totalSteps = 0;

      // Use the aggregate API WITHOUT specifying dataSourceId
      // This automatically aggregates from ALL available sources
      // Version 2: Force fresh aggregate from all sources
      console.log('\n🔄 Using Aggregate API to sum all step sources...');
      
      try {
        const aggregateRequest = {
          aggregateBy: [{
            dataTypeName: 'com.google.step_count.delta'
            // NOTE: Not specifying dataSourceId - Google Fit will aggregate ALL sources
          }],
          bucketByTime: { durationMillis: endMs - startMs },
          startTimeMillis: startMs,
          endTimeMillis: endMs
        };

        console.log('📡 Sending aggregate request (all sources)...');
        const response = await fitness.users.dataset.aggregate({
          userId: 'me',
          requestBody: aggregateRequest
        });

        console.log(`📊 Raw response buckets: ${JSON.stringify(response.data.bucket?.length || 0)}`);
        console.log(`📊 Full response: ${JSON.stringify(response.data, null, 2).substring(0, 1000)}...`);

        console.log(`📊 Buckets received: ${response.data.bucket?.length || 0}`);

        if (response.data.bucket && response.data.bucket.length > 0) {
          response.data.bucket.forEach(bucket => {
            console.log(`\n🪣 Bucket time: ${new Date(parseInt(bucket.startTimeMillis)).toISOString()} to ${new Date(parseInt(bucket.endTimeMillis)).toISOString()}`);
            
            if (bucket.dataset && bucket.dataset.length > 0) {
              console.log(`   📦 ${bucket.dataset.length} dataset(s) in this bucket`);
              
              bucket.dataset.forEach((dataset, idx) => {
                if (dataset.point) {
                  console.log(`   📍 Dataset ${idx + 1}: ${dataset.point.length} point(s)`);
                  
                  dataset.point.forEach(point => {
                    const steps = point.value?.[0]?.intVal || 0;
                    if (steps > 0) {
                      totalSteps += steps;
                      const pointTime = new Date(parseInt(point.startTimeNanos) / 1000000).toISOString();
                      console.log(`      ✅ +${steps} steps at ${pointTime}`);
                    }
                  });
                }
              });
            } else {
              console.log('   ⚠️ No datasets in this bucket');
            }
          });
        } else {
          console.log('⚠️ No buckets returned from aggregate API');
        }
      } catch (aggErr) {
        console.log(`⚠️ Aggregate request failed: ${aggErr.message}`);
        // If that fails, try listing and individually querying each data source
        console.log('\n📋 Falling back to individual data source queries...');
        try {
          const dataSources = await fitness.users.dataSources.list({ userId: 'me' });
          const stepDataSources = dataSources.data.dataSource?.filter(ds => 
            ds.dataType?.name?.includes('step') 
          ) || [];
          
          console.log(`Found ${stepDataSources.length} step data source(s)`);
          
          for (const ds of stepDataSources) {
            try {
              console.log(`\n  🔍 Querying: ${ds.dataType?.name}`);
              const req = {
                aggregateBy: [{
                  dataTypeName: ds.dataType?.name
                }],
                bucketByTime: { durationMillis: endMs - startMs },
                startTimeMillis: startMs,
                endTimeMillis: endMs
              };
              
              const resp = await fitness.users.dataset.aggregate({
                userId: 'me',
                requestBody: req
              });
              
              if (resp.data.bucket?.[0]?.dataset) {
                resp.data.bucket[0].dataset.forEach(d => {
                  if (d.point) {
                    d.point.forEach(p => {
                      const s = p.value?.[0]?.intVal || 0;
                      if (s > 0) {
                        totalSteps += s;
                        console.log(`    ✅ +${s} steps`);
                      }
                    });
                  }
                });
              }
            } catch (e) {
              console.log(`    ⚠️ Query failed: ${e.message}`);
            }
          }
        } catch (fallbackErr) {
          console.log(`⚠️ Fallback also failed: ${fallbackErr.message}`);
        }
      }

      console.log(`\n📊 FINAL TOTAL STEPS: ${totalSteps}`);
      return { steps: totalSteps, raw: {} };

    } catch (err) {
      lastError = err;

      // Gaxios/googleapis errors sometimes place details under `err.response.data.error`
      // and sometimes under `err.cause`. Normalize for robust classification.
      const responseError = err?.response?.data?.error;
      const causeError = err?.cause;
      const errorObj = responseError || causeError || {};

      const statusRaw =
        err?.status ??
        err?.code ??
        err?.response?.status ??
        err?.response?.data?.error?.code ??
        causeError?.code;
      const status = typeof statusRaw === 'number' ? statusRaw : (statusRaw ? Number(statusRaw) : undefined);

      const messageRaw = errorObj?.message ?? err?.message ?? '';
      const message = typeof messageRaw === 'string' ? messageRaw : String(messageRaw);
      const messageLower = message.toLowerCase();

      const details = Array.isArray(errorObj?.details) ? errorObj.details : [];
      const errors = Array.isArray(errorObj?.errors) ? errorObj.errors : [];
      const reasons = new Set([
        ...details.map(d => d?.reason).filter(Boolean),
        ...errors.map(e => e?.reason).filter(Boolean)
      ]);

      console.error('❌ Direct API Error:', message);

      // Map Google API auth/scope errors to meaningful HTTP errors
      if (status === 401) {
        throw new UnauthorizedError('Google authorization expired. Please reconnect Google Fit.');
      }

      // Fitness API disabled / not configured for the Google Cloud project
      if (
        status === 403 &&
        (
          reasons.has('SERVICE_DISABLED') ||
          reasons.has('accessNotConfigured') ||
          messageLower.includes('fitness api has not been used') ||
          messageLower.includes('it is disabled')
        )
      ) {
        throw new AppError(
          503,
          'Google Fitness API is disabled or not configured for this project. Enable the "Fitness API" (fitness.googleapis.com) in Google Cloud Console, then reconnect Google Fit.',
          'FITNESS_API_DISABLED'
        );
      }

      if (
        status === 403 &&
        (
          reasons.has('ACCESS_TOKEN_SCOPE_INSUFFICIENT') ||
          messageLower.includes('insufficient authentication scopes') ||
          messageLower.includes('insufficient permission')
        )
      ) {
        throw new ForbiddenError('Google Fit permissions are missing or insufficient. Please reconnect Google Fit.');
      }
      
      if (err.code === 'ECONNRESET' || err.message.includes('ECONNRESET')) {
        console.log(`🔄 Connection reset, retrying... (${retries - 1} retries left)`);
        retries--;
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
          continue;
        }
      }
      
      if (err.response?.data) {
        console.error('Response:', JSON.stringify(err.response.data, null, 2));
      }
      
      throw err;
    }
  }
  
  throw lastError || new Error('Failed to fetch steps after retries');
}

export { fetchDirectSteps };
