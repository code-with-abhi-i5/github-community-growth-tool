import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { config } from './index';
import prisma from '../services/database';
import logger from './logger';
import type { GitHubProfile } from '../types';

export function configurePassport(): void {
  passport.use(
    new GitHubStrategy(
      {
        clientID: config.github.clientId,
        clientSecret: config.github.clientSecret,
        callbackURL: config.github.callbackUrl,
        scope: ['user:follow', 'read:user'],
      },
      async (
        accessToken: string,
        _refreshToken: string,
        profile: GitHubProfile,
        done: (err: Error | null, user?: Express.User) => void
      ) => {
        try {
          const user = await prisma.user.upsert({
            where: { githubId: profile.id },
            update: {
              githubUsername: profile._json.login,
              avatarUrl: profile._json.avatar_url,
              accessToken,
            },
            create: {
              githubId: profile.id,
              githubUsername: profile._json.login,
              avatarUrl: profile._json.avatar_url,
              accessToken,
            },
          });

          logger.info('User authenticated', {
            githubUsername: user.githubUsername,
          });

          done(null, {
            id: user.id,
            githubId: user.githubId,
            githubUsername: user.githubUsername,
            avatarUrl: user.avatarUrl,
            accessToken: user.accessToken,
          });
        } catch (error) {
          logger.error('Authentication error', { error });
          done(error as Error);
        }
      }
    )
  );

  passport.serializeUser((user: Express.User, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) {
        return done(null, false);
      }
      done(null, {
        id: user.id,
        githubId: user.githubId,
        githubUsername: user.githubUsername,
        avatarUrl: user.avatarUrl,
        accessToken: user.accessToken,
      });
    } catch (error) {
      done(error);
    }
  });
}
