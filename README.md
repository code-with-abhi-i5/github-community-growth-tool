# GitFlow Manager

A production-grade GitHub Follow Management Dashboard. Securely manage large lists of GitHub usernames, process follow actions through the official GitHub API, and track everything in real time.

## Features

- **GitHub OAuth** — Secure authentication, no passwords stored
- **CSV & Excel Import** — Upload `.csv`, `.xlsx`, or `.xls` files with auto-column detection
- **Real-Time Progress** — Live WebSocket updates as each action processes
- **Job Management** — Start, pause, resume, and stop with full control
- **Exportable Results** — Download CSV or XLSX with summary reports
- **Rate-Limit Aware** — Automatic backoff respecting GitHub API limits
- **Premium UI** — Dark/light mode, glassmorphism, smooth animations

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, TypeScript, Tailwind CSS, Framer Motion |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL, Prisma ORM |
| Queue | Redis, BullMQ |
| Real-time | WebSocket |
| Auth | GitHub OAuth via Passport.js |

## Prerequisites

- Node.js 18+
- Docker & Docker Compose (for PostgreSQL + Redis)
- A GitHub OAuth App

## Setup

### 1. Clone & Install

```bash
git clone <repo-url>
cd gitflow-manager

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. GitHub OAuth App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Set:
   - **Application name**: GitFlow Manager
   - **Homepage URL**: `http://localhost:5173`
   - **Authorization callback URL**: `http://localhost:3001/api/auth/github/callback`
4. Copy the **Client ID** and **Client Secret**

### 3. Environment Variables

```bash
cp .env.example backend/.env
```

Edit `backend/.env` and fill in:
- `GITHUB_CLIENT_ID` — from step 2
- `GITHUB_CLIENT_SECRET` — from step 2
- `SESSION_SECRET` — any long random string
- `DATABASE_URL` — defaults work with Docker Compose
- `REDIS_URL` — defaults work with Docker Compose

### 4. Start Infrastructure

```bash
docker-compose up -d
```

This starts PostgreSQL and Redis.

### 5. Database Migration

```bash
cd backend
npx prisma migrate dev --name init
npx prisma generate
```

### 6. Start Development

```bash
# Terminal 1 — Backend
cd backend
npm run dev

# Terminal 2 — Frontend
cd frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/auth/github` | Initiate GitHub OAuth |
| `GET` | `/api/auth/github/callback` | OAuth callback |
| `GET` | `/api/auth/me` | Get current user |
| `POST` | `/api/auth/logout` | Logout |
| `POST` | `/api/jobs` | Upload file & create job |
| `GET` | `/api/jobs` | List user's jobs |
| `GET` | `/api/jobs/:id` | Get job details |
| `POST` | `/api/jobs/:id/start` | Start processing |
| `POST` | `/api/jobs/:id/pause` | Pause processing |
| `POST` | `/api/jobs/:id/resume` | Resume processing |
| `POST` | `/api/jobs/:id/stop` | Stop processing |
| `GET` | `/api/jobs/:id/items` | Get job items (paginated) |
| `POST` | `/api/jobs/:id/items/:itemId/retry` | Retry failed item |
| `GET` | `/api/jobs/:id/export/csv` | Export as CSV |
| `GET` | `/api/jobs/:id/export/xlsx` | Export as XLSX |
| `DELETE` | `/api/jobs/:id` | Delete job |

## Security

- OAuth tokens stored server-side only (never in browser localStorage)
- Secure HTTP-only session cookies
- Input validation on all endpoints
- File type and size validation
- CSV/XLSX formula injection prevention in exports
- Rate limiting on API endpoints
- Users can only access their own jobs
- No GitHub credentials logged

## Important

This application uses GitHub's official documented API endpoints only. It does **not** implement:
- CAPTCHA bypass
- Rate-limit bypass
- Proxy rotation
- Browser automation to evade protections
- Any anti-abuse mechanism

If the GitHub API does not support an operation, the application displays a clear message explaining the limitation.

## License

MIT
