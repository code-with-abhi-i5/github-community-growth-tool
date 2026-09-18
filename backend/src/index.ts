import express from 'express';
import session from 'express-session';
import passport from 'passport';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import http from 'http';

import { config, validateConfig } from './config';
import { configurePassport } from './config/passport';
import logger from './config/logger';
import { wsService } from './services/websocket';
import { startFollowWorker } from './workers/followWorker';
import { shutdownQueue } from './services/queue';

import authRoutes from './routes/auth';
import jobRoutes from './routes/jobs';
import activityRoutes from './routes/activity';

// Validate config
validateConfig();

const app = express();
const server = http.createServer(app);

// ── Security Middleware ──────────────────────────
app.use(helmet({
  contentSecurityPolicy: config.isDev ? false : undefined,
}));

app.use(cors({
  origin: config.frontend.url,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting for API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.isDev ? 10000 : 500,
  skip: () => config.isDev,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Stricter rate limit for auth endpoints (skipped in dev and for /me check)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.isDev ? 10000 : 50,
  skip: (req) => config.isDev || req.path === '/me',
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later.' },
});

// ── Body Parsing ─────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// ── Session ──────────────────────────────────────
app.use(
  session({
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: !config.isDev,
      sameSite: config.isDev ? 'lax' : 'none',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

// ── Passport ─────────────────────────────────────
configurePassport();
app.use(passport.initialize());
app.use(passport.session());

// ── Routes ───────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/jobs', apiLimiter, jobRoutes);
app.use('/api/activity', apiLimiter, activityRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── 404 Handler ──────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Error Handler ────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: config.isDev ? err.stack : undefined });
  res.status(500).json({
    error: 'Internal server error',
    ...(config.isDev && { message: err.message }),
  });
});

// ── WebSocket ────────────────────────────────────
wsService.initialize(server);

// ── Worker Runner ────────────────────────────────
startFollowWorker().catch((err) => logger.error('Worker start error', { error: err }));

// ── Start Server ─────────────────────────────────
server.listen(config.port, () => {
  logger.info(`GitFlow Manager API running on port ${config.port}`);
  logger.info(`Environment: ${config.nodeEnv}`);
});

// ── Graceful Shutdown ────────────────────────────
const shutdown = async (signal: string) => {
  logger.info(`${signal} received. Shutting down...`);
  server.close();
  await shutdownQueue();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
