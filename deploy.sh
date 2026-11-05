#!/usr/bin/env bash
# Checks the app and deploys it as a Docker container to a server that runs Immich.
# Configuration comes from the environment or from a local ".env" file (see .env.example):
#   DEPLOY_HOST  user@host of the Immich server (required)
#   DEPLOY_KEY   SSH key file (optional, default: your SSH defaults)
#   DEPLOY_DIR   target directory on the server (default: ~/fotos-web)
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] && set -a && . ./.env && set +a
: "${DEPLOY_HOST:?Set DEPLOY_HOST (e.g. root@192.168.1.10), see .env.example}"
DIR="${DEPLOY_DIR:-fotos-web}"
SSH_OPTS=(-o ConnectTimeout=8)
[ -n "${DEPLOY_KEY:-}" ] && SSH_OPTS+=(-i "$DEPLOY_KEY")
SSH=(ssh "${SSH_OPTS[@]}" "$DEPLOY_HOST")

echo "-> syntax and tests"
node --check public/app.js; node --check public/sw.js; node --check server.mjs
node --test test/*.test.mjs >/dev/null

echo "-> copying files to $DEPLOY_HOST:$DIR"
"${SSH[@]}" "mkdir -p '$DIR' && rm -rf '$DIR/public'"
COPYFILE_DISABLE=1 tar -cf - Dockerfile server.mjs public | "${SSH[@]}" "tar -xf - -C '$DIR' 2>/dev/null"
scp -q "${SSH_OPTS[@]}" docker-compose.yml "$DEPLOY_HOST:$DIR/docker-compose.yml"

echo "-> building and starting the container"
"${SSH[@]}" "cd '$DIR' && docker compose -p fotos-web up -d --build 2>&1 | tail -2"

echo "-> health check"
PORT="${PUBLIC_PORT:-8090}"
for i in 1 2 3 4 5 6; do
  if "${SSH[@]}" "curl -fs localhost:$PORT/healthz >/dev/null"; then echo "OK: http://${DEPLOY_HOST#*@}:$PORT"; exit 0; fi
  sleep 2
done
echo "ERROR: container does not respond" >&2; exit 1
