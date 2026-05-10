Live Location Tracker — Setup & Run
=================================

This document explains how to set up and run the Live Location Tracker locally (frontend, backend, Keycloak, Kafka, Postgres, Redis).

Prerequisites
-------------
- Docker Desktop (or docker + docker-compose)
- Node.js 26+ and npm
- PostgreSQL 15 (optional if running Postgres in Docker)

Ports used
----------
- Frontend: `3000`
- Backend: `3001`
- Kafka: `9092`
- Keycloak: `8081` (container listens on `8080`)

Quick start (recommended)
-------------------------
1. From the repository root, start infrastructure:

```bash
docker compose up -d
```

2. Watch Keycloak import the realm (wait until import completes):

```bash
docker logs -f keycloak
```

3. Start backend

```bash
cd backend
npm install
npm run dev
```

4. Start frontend

```bash
cd frontend
npm install
npm run dev
```

5. Open the app at: http://localhost:3000

Environment files
-----------------
Copy/edit the example env files if needed:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Key variables to check:
- `OAUTH_ISSUER` / `VITE_OAUTH_ISSUER` — e.g. `http://localhost:8081/realms/location-tracker`
- `VITE_OAUTH_CLIENT_ID` — `location-tracker-spa`
- `VITE_OAUTH_AUDIENCE` — `location-tracker-api`

Keycloak
--------
- The repo includes `keycloak-realm.json` that the Keycloak container auto-imports.
- Test users (pre-configured):
  - `testuser@example.com` / `testpass123`
  - `testuser2@example.com` / `testpass123`

Database
--------
- The backend uses PostgreSQL. You can run Postgres in Docker or locally.
- Example (local):

```bash
psql 'postgresql://postgres:postgres@localhost:5432/postgres' -c "CREATE DATABASE location_tracker;"
# run any schema SQL if present; otherwise the backend initializes tables on first run
```

Useful commands
---------------
- Start only Keycloak:

```bash
docker compose up -d keycloak
```

- Stop everything:

```bash
docker compose down
```

Troubleshooting
---------------
- OIDC `invalid_code` / `code already used`: In development React's `StrictMode` can run effects twice causing the callback to execute twice. Disable `React.StrictMode` in `frontend/src/main.jsx` or make the callback idempotent.
- Leaflet CSS blocked by integrity mismatch: remove or update the `integrity` attribute in `frontend/index.html` for the CDN stylesheet.
- Geolocation denied: grant location access for `localhost:3000` in your browser.
- Token verification failures: ensure backend `OAUTH_ISSUER` points to Keycloak and check JWKS at:

```
http://localhost:8081/realms/location-tracker/protocol/openid-connect/certs
```

Files of interest
-----------------
- `keycloak-realm.json` — realm, clients, and test users
- `backend/.env.example`, `frontend/.env.example` — env templates
- `backend/src/src/server.js` — JWKS JWT verification (backend socket auth)
- `frontend/src/util/auth.js` — OIDC client config

Next steps
----------
If you want, I can add a single `scripts/dev.sh` or `Makefile` to start all services and servers with one command.

One-command dev script
----------------------
Run the included script to start infrastructure and servers:

```bash
./scripts/dev.sh
```

Notes:
- The script uses `docker compose up -d`, waits for Keycloak to be reachable, then starts the backend and frontend in the background. Logs are written to `backend/dev.log` and `frontend/dev.log`.

Consolidated project README
---------------------------
This repository previously included several separate markdown guides (`location-tracking-SETUP.md`, `location-tracking-QUICKSTART.md`, `location-tracking-COMPLETE.md`, `location-tracking-README.md`).
Their content has been consolidated into this single `README.md` for a single source of truth. The original files remain in the repository for reference in the `location-tracking-*` filenames.

If you want the originals moved to a `docs/` folder or removed, tell me and I will do it.
