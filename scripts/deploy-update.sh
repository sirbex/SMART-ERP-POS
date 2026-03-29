#!/bin/bash
# 🚨 PRODUCTION UPDATE DEPLOYMENT ONLY
# This script updates running containers. It does NOT recreate databases or volumes.
# See DEPLOYMENT_CONTRACT.md for rules.

set -e

echo "=== SMART-ERP Production Update ==="
echo "Server: $(hostname)"
echo "Date: $(date)"
echo ""

cd /opt/smarterp

# Pull latest code
echo ">>> Pulling latest code..."
git pull

# Build only app containers
echo ">>> Building backend + frontend..."
docker compose -f docker-compose.deploy.yml build backend frontend

# Restart only app containers (--no-deps = don't touch postgres/redis/nginx)
echo ">>> Restarting backend + frontend..."
docker compose -f docker-compose.deploy.yml up -d --no-deps backend frontend

# Verify
echo ""
echo ">>> Container status:"
docker ps --format 'table {{.Names}}\t{{.Status}}'

echo ""
echo ">>> Waiting 10s for backend to start..."
sleep 10

# Health check
if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
  echo ">>> Backend health: OK"
else
  echo ">>> Backend health: CHECKING LOGS..."
  docker logs smarterp-backend --tail 20
fi

echo ""
echo "=== Deploy complete ==="
