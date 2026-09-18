# GitFlow Manager — Security Notes

## Authentication

- **GitHub OAuth only** — Users never enter GitHub passwords into GitFlow Manager.
- **Minimum scopes** — Only `user:follow` and `read:user` scopes are requested.
- **Access tokens stored server-side** — OAuth tokens are stored in the PostgreSQL database, never exposed to the frontend.
- **HTTP-only cookies** — Session cookies have `httpOnly`, `secure` (in production), and `sameSite` flags.
- **Session expiry** — Sessions expire after 24 hours.

## Data Protection

- **User isolation** — All database queries filter by `userId`. Users can only access their own jobs and items.
- **Input validation** — All inputs are validated using Zod schemas and custom validators.
- **File validation** — File type and size are validated before parsing.
- **Formula injection prevention** — CSV and XLSX exports sanitize cell values to prevent spreadsheet formula injection (`=`, `+`, `-`, `@`, `\t`, `\r`).

## API Security

- **Helmet** — Sets security headers (CSP, HSTS, X-Frame-Options, etc.).
- **CORS** — Only the configured frontend origin is allowed.
- **Rate limiting** — API endpoints are rate-limited (100 req/15min general, 20 req/15min auth).
- **Authentication middleware** — All job endpoints require a valid session.

## Secrets Management

- **Environment variables** — All secrets (GitHub OAuth, session secret, database URL) are loaded from environment variables.
- **`.env.example` only** — Only placeholder files are committed. Actual `.env` files are in `.gitignore`.
- **No secret logging** — The Winston logger sanitizes sensitive fields before logging.

## GitHub API Compliance

- **Official API only** — All follow operations use `PUT /user/following/{username}` and `GET /user/following/{username}`.
- **Rate limit respect** — The application monitors `X-RateLimit-Remaining` and `X-RateLimit-Reset` headers. When limits are approached, processing pauses automatically.
- **Exponential backoff** — Failed requests are retried with increasing delays.
- **No bypass mechanisms** — No CAPTCHA bypass, proxy rotation, browser automation, or credential scraping.

## What This Application Does NOT Do

- Store GitHub passwords
- Bypass GitHub rate limits
- Use proxy rotation
- Automate browser interactions
- Scrape credentials
- Use fake accounts
- Evade GitHub protections
