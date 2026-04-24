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

# Reload nginx so it picks up the new container IP (containers get new IPs on recreate)
echo ">>> Reloading nginx to pick up new container IP..."
docker exec smarterp-nginx nginx -s reload

# Verify
echo ""
echo ">>> Container status:"
docker ps --format 'table {{.Names}}\t{{.Status}}'

echo ""
echo ">>> Waiting 15s for backend to start..."
sleep 15

# Internal health check (avoids nginx cold-start race)
echo ">>> Internal backend health check:"
if docker exec smarterp-backend wget -qO- http://localhost:3001/api/health > /dev/null 2>&1; then
  echo ">>> Backend health: OK (internal)"
else
  echo ">>> Backend health: FAILED — checking logs..."
  docker logs smarterp-backend --tail 30
  exit 1
fi

# Public HTTPS health check
echo ">>> Public HTTPS health check:"
if curl -sf https://wizarddigital-inv.com/api/health > /dev/null 2>&1; then
  echo ">>> HTTPS health: OK"
else
  echo ">>> HTTPS health: FAILED — nginx may need a moment, try: curl https://wizarddigital-inv.com/api/health"
fi

echo ""
echo "=== Deploy complete ==="
