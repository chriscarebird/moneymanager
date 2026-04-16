# InvestPilot — Deployment Guide

InvestPilot ships as a single Docker container: the Hono API server builds the
React PWA and serves it as static files, so there is only one process to manage.

---

## 1. Prerequisites

- Docker 24+ (or Docker Desktop)
- A database — either Turso (hosted) or a local SQLite file (see §3)
- An Anthropic API key (`ANTHROPIC_API_KEY`)

---

## 2. Generate VAPID Keys (push notifications)

Push notifications are optional. To enable them, generate a key pair once:

```bash
npx web-push generate-vapid-keys
```

Copy the output into your `.env` file (see §3).

---

## 3. Configure Environment

Copy `.env.example` to `.env` and fill in every value:

```bash
cp .env.example .env
```

Key values to set:

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API key from console.anthropic.com |
| `TURSO_DATABASE_URL` | `libsql://your-db.turso.io` (Turso) **or** `file:/app/data/db.sqlite3` (local file) |
| `TURSO_AUTH_TOKEN` | Turso auth token (leave blank for local file mode) |
| `USER1_PASSWORD` | Bcrypt hash of user1's password — generate with `node -e "const b=require('bcryptjs'); b.hash('yourpw',12).then(console.log)"` |
| `USER2_PASSWORD` | Same for user2 |
| `SESSION_SECRET` | Long random string, e.g. `openssl rand -hex 32` |
| `VAPID_PUBLIC_KEY` | From step 2 (optional) |
| `VAPID_PRIVATE_KEY` | From step 2 (optional) |
| `VAPID_EMAIL` | Contact email for push service (optional) |
| `FRONTEND_URL` | Your app's public URL, e.g. `https://invest.example.com` |
| `NODE_ENV` | Set to `production` |
| `PORT` | `3000` |

---

## 4. Run Database Migrations

**Turso (hosted):**
```bash
pnpm db:migrate
```

**Local SQLite (Docker volume):**
The migration runs automatically on first startup when
`TURSO_DATABASE_URL=file:/app/data/db.sqlite3`.

---

## 5. Build and Run

```bash
# Build the image (takes ~2 min on first run)
docker build -t investpilot .

# Run with docker-compose (recommended — handles volume and restart policy)
docker compose up -d

# Or run directly
docker run -d \
  --name investpilot \
  -p 3000:3000 \
  --env-file .env \
  -v investpilot-data:/app/data \
  --restart unless-stopped \
  investpilot
```

The app is now available at `http://localhost:3000`.

---

## 6. Seed Reference Data (optional)

Load the reference 7-ETF portfolio targets and DeGiro ETF list:

```bash
docker exec investpilot node -e "
  import('@investpilot/db').then(({ seed }) => seed());
"
```

Or from the host:
```bash
pnpm db:seed
```

---

## 7. Updating

```bash
git pull
docker build -t investpilot .
docker compose up -d --force-recreate
```

---

## 8. Fly.io Deployment (alternative)

```bash
fly launch --name investpilot --no-deploy
fly secrets import < .env
fly volumes create investpilot_data --size 1
fly deploy
```

Add to `fly.toml`:
```toml
[mounts]
  source = "investpilot_data"
  destination = "/app/data"
```

---

## Notes

- The app serves both the API (`/api/*`) and the React SPA from the same
  Node.js process on port 3000.
- Push notifications require HTTPS in production — use a reverse proxy
  (nginx, Caddy, Fly.io, etc.) that terminates TLS.
- There are exactly 2 users (`user1`, `user2`). Passwords are set via env
  vars and bcrypt-hashed at runtime — never stored in plaintext.
