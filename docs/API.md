# GitFlow Manager — API Documentation

## Base URL

```
http://localhost:3001/api
```

## Authentication

All endpoints except `/auth/github` and `/auth/github/callback` require an authenticated session.
Authentication is done via GitHub OAuth. The session is stored in an HTTP-only cookie.

---

## Auth Endpoints

### `GET /auth/github`

Redirects the user to GitHub's OAuth authorization page.

**Scopes requested**: `user:follow`, `read:user`

### `GET /auth/github/callback`

Handles the OAuth callback from GitHub. Creates or updates the user in the database
and redirects to the frontend dashboard.

### `GET /auth/me`

Returns the authenticated user's info.

**Response** `200`:
```json
{
  "id": "clp...",
  "githubUsername": "octocat",
  "avatarUrl": "https://avatars.githubusercontent.com/..."
}
```

**Response** `401`:
```json
{
  "error": "Authentication required"
}
```

### `POST /auth/logout`

Destroys the session and clears cookies.

**Response** `200`:
```json
{
  "message": "Logged out successfully"
}
```

---

## Job Endpoints

### `POST /jobs`

Upload a file and create a new job.

**Content-Type**: `multipart/form-data`

**Parameters**:
- `file` (required) — CSV, XLSX, or XLS file
- `columnIndex` (optional) — Index of the column containing usernames

**Response** `201`:
```json
{
  "job": {
    "id": "clp...",
    "status": "PENDING",
    "totalCount": 492,
    "createdAt": "2024-01-01T00:00:00.000Z"
  },
  "validation": {
    "total": 500,
    "valid": 492,
    "invalid": 2,
    "duplicates": 6,
    "invalidDetails": [
      { "raw": "user@name", "reason": "Invalid GitHub username format" }
    ],
    "duplicateValues": ["octocat"]
  },
  "columns": ["username", "email", "notes"],
  "selectedColumn": 0
}
```

### `GET /jobs`

List all jobs for the authenticated user.

**Response** `200`:
```json
{
  "jobs": [
    {
      "id": "clp...",
      "status": "COMPLETED",
      "fileName": "users.csv",
      "totalCount": 500,
      "followedCount": 450,
      ...
    }
  ]
}
```

### `GET /jobs/:id`

Get a single job's details.

### `POST /jobs/:id/start`

Start processing a pending or stopped job.

### `POST /jobs/:id/pause`

Pause a processing job.

### `POST /jobs/:id/resume`

Resume a paused job.

### `POST /jobs/:id/stop`

Stop a processing or paused job.

### `GET /jobs/:id/items`

Get paginated job items.

**Query Parameters**:
- `page` (default: 1)
- `limit` (default: 50, max: 100)
- `status` — Filter by status (e.g., `FOLLOWED`, `FAILED`)
- `search` — Search by username

### `POST /jobs/:id/items/:itemId/retry`

Retry a failed, not-found, or rate-limited item.

### `GET /jobs/:id/export/csv`

Download results as CSV.

### `GET /jobs/:id/export/xlsx`

Download results as XLSX with a summary sheet.

### `DELETE /jobs/:id`

Delete a job and all its items. Cannot delete a processing job.

---

## WebSocket

Connect to `ws://localhost:3001/ws`

### Messages from Client

```json
{ "type": "auth", "userId": "clp..." }
{ "type": "subscribe", "jobId": "clp..." }
{ "type": "unsubscribe", "jobId": "clp..." }
```

### Messages from Server

```json
{ "type": "item:status", "jobId": "...", "itemId": "...", "username": "...", "status": "FOLLOWED", "message": "..." }
{ "type": "job:progress", "jobId": "...", "total": 500, "followed": 127, ... }
{ "type": "job:status", "jobId": "...", "status": "COMPLETED" }
{ "type": "rate-limit:warning", "jobId": "...", "message": "..." }
```

---

## Rate Limiting

API endpoints are rate-limited:
- General API: 100 requests per 15 minutes
- Auth endpoints: 20 requests per 15 minutes

GitHub API rate limits are handled server-side with exponential backoff.
