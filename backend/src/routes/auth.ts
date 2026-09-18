import { Router, Request, Response } from 'express';
import passport from 'passport';
import { config } from '../config';
import { requireAuth } from '../middleware/auth';
import logger from '../config/logger';

const router = Router();

// Initiate GitHub OAuth flow
router.get('/github', passport.authenticate('github', { scope: ['user:follow', 'read:user'] }));

// GitHub OAuth callback
router.get(
  '/github/callback',
  passport.authenticate('github', {
    failureRedirect: `${config.frontend.url}/login?error=auth_failed`,
  }),
  (_req: Request, res: Response) => {
    res.redirect(`${config.frontend.url}/dashboard`);
  }
);

// Get current authenticated user
router.get('/me', requireAuth, (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  res.json({
    id: req.user.id,
    githubUsername: req.user.githubUsername,
    avatarUrl: req.user.avatarUrl,
  });
});

// Logout
router.post('/logout', (req: Request, res: Response) => {
  req.logout((err) => {
    if (err) {
      logger.error('Logout error', { error: err });
      res.status(500).json({ error: 'Logout failed' });
      return;
    }
    req.session.destroy((sessionErr) => {
      if (sessionErr) {
        logger.error('Session destroy error', { error: sessionErr });
      }
      res.clearCookie('connect.sid');
      res.json({ message: 'Logged out successfully' });
    });
  });
});

export default router;
