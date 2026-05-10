#!/usr/bin/env bash
set -euo pipefail

# One-command developer startup script
# - starts docker services
# - waits for Keycloak OIDC to be reachable
# - starts backend and frontend (logs to backend/dev.log and frontend/dev.log)

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "Starting docker services..."
docker compose up -d

echo "Waiting for Keycloak OIDC endpoint to be available..."
for i in {1..30}; do
  status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8081/realms/location-tracker/.well-known/openid-configuration || echo "000")
  if [ "$status" = "200" ]; then
    echo "Keycloak is ready"
    break
  fi
  echo "Waiting for Keycloak... ($i)"
  sleep 2
done

echo "Installing backend deps and starting backend (logs -> backend/dev.log)"
npm --prefix backend install
nohup npm --prefix backend run dev > backend/dev.log 2>&1 &

echo "Installing frontend deps and starting frontend (logs -> frontend/dev.log)"
npm --prefix frontend install
nohup npm --prefix frontend run dev > frontend/dev.log 2>&1 &

echo "All done. Frontend: http://localhost:3000    Backend: http://localhost:3001"
echo "Tail logs: tail -f backend/dev.log frontend/dev.log"
