import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
// Also try root .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',

  github: {
    clientId: process.env.GITHUB_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    callbackUrl: process.env.GITHUB_CALLBACK_URL || 'http://localhost:3001/api/auth/github/callback',
  },

  session: {
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  database: {
    url: process.env.DATABASE_URL || '',
  },

  frontend: {
    url: process.env.FRONTEND_URL || 'http://localhost:5173',
  },

  upload: {
    maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10),
    dir: process.env.UPLOAD_DIR || './uploads',
  },

  rateLimits: {
    maxRetriesPerItem: 3,
    processingDelayMs: 4000,     // Base delay between API calls increased to 4s to avoid shadow bans
    backoffMultiplier: 2,
    maxBackoffMs: 60000,
  },
} as const;

// Validate required config at startup
export function validateConfig(): void {
  const required = [
    ['GITHUB_CLIENT_ID', config.github.clientId],
    ['GITHUB_CLIENT_SECRET', config.github.clientSecret],
    ['SESSION_SECRET', config.session.secret],
    ['DATABASE_URL', config.database.url],
  ];

  const missing = required.filter(([, value]) => !value);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.map(([name]) => name).join(', ')}`
    );
  }
}
