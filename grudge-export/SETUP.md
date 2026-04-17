# Grudge Pipeline — Setup Guide

## Prerequisites

- **Node.js** 20+
- **pnpm** 9+ (`npm install -g pnpm`)
- **PostgreSQL** database (local or hosted — Supabase, Neon, Railway all work)

---

## 1. Install Dependencies

```bash
pnpm install
```

## 2. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` with your values:

| Variable | Where to get it |
|---|---|
| `MESHY_API_KEY` | https://www.meshy.ai/api → API Keys |
| `AI_INTEGRATIONS_ANTHROPIC_API_KEY` | https://console.anthropic.com → API Keys |
| `DATABASE_URL` | Your PostgreSQL connection string |
| `PORT` | Frontend port (default: 5173) |
| `BASE_PATH` | Set to `/` unless serving from a sub-path |

## 3. Set Up the Database

```bash
pnpm db:push
```

This runs Drizzle migrations to create the `ai_characters` table.

## 4. Start the Backend API Server

```bash
# Set env vars for the API server process
export MESHY_API_KEY=...
export AI_INTEGRATIONS_ANTHROPIC_API_KEY=...
export AI_INTEGRATIONS_ANTHROPIC_BASE_URL=https://api.anthropic.com
export DATABASE_URL=...
export PORT=3001

pnpm dev:backend
```

The API server runs on `PORT` (default 3001). It serves all `/api/*` routes.

## 5. Start the Frontend Dev Server

In a second terminal:

```bash
export PORT=5173
export BASE_PATH=/

pnpm dev:frontend
```

Open http://localhost:5173 in your browser.

---

## Production Deployment

### Build

```bash
pnpm build:frontend    # Outputs to artifacts/grudge-pipeline/dist/public/
pnpm build:backend     # Outputs to artifacts/api-server/dist/
```

### Serve

The backend already serves the `/api` routes. For the frontend:
- Serve `artifacts/grudge-pipeline/dist/public/` as static files.
- Point all non-API requests at `index.html` (SPA routing).

**nginx example:**
```nginx
server {
  listen 80;

  # Serve the frontend static files
  location / {
    root /path/to/grudge-pipeline/dist/public;
    try_files $uri $uri/ /index.html;
  }

  # Proxy API requests to the Express backend
  location /api/ {
    proxy_pass http://localhost:3001;
    proxy_set_header Host $host;
  }
}
```

### Run the Backend

```bash
node artifacts/api-server/dist/index.mjs
```

Or with pm2:
```bash
pm2 start artifacts/api-server/dist/index.mjs --name grudge-api
```

---

## Package Layout

```
grudge-pipeline-workspace/
├── artifacts/
│   ├── grudge-pipeline/        # React + Vite frontend
│   │   ├── src/                # All UI source code
│   │   ├── vite.config.ts
│   │   └── README.md           # Full technical documentation
│   └── api-server/             # Express backend
│       ├── src/                # Route handlers
│       └── dist/               # Pre-built server bundle (ready to run)
├── lib/
│   ├── db/                     # Drizzle schema + database connection
│   └── api-client-react/       # Generated type-safe API client
├── .env.example
├── package.json
├── pnpm-workspace.yaml
└── SETUP.md                    # This file
```

For full technical documentation including all API routes, pipeline stages, type definitions, math, and dependency details, see:

**`artifacts/grudge-pipeline/README.md`**
