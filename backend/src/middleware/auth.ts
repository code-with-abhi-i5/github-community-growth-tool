import { Request, Response, NextFunction } from 'express';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
    res.status(401).json({
      error: 'Authentication required',
      message: 'Please sign in with GitHub to access this resource.',
    });
    return;
  }
  next();
}

export function requireJobOwnership(req: Request, res: Response, next: NextFunction): void {
  // This is used after requireAuth, so req.user is guaranteed to exist.
  // The actual job ownership check is done in the route handler since
  // we need to query the database for the job.
  next();
}
