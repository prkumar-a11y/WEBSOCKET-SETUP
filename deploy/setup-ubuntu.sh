#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this script with sudo: sudo ./deploy/setup-ubuntu.sh" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  apt-get update
  apt-get install -y docker.io docker-compose-plugin
  systemctl enable --now docker
elif ! docker compose version >/dev/null 2>&1; then
  apt-get update
  apt-get install -y docker-compose-plugin
fi

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example. Set DOMAIN to your DNS name, then rerun this script."
  exit 0
fi

if grep -q '^DOMAIN=example\.com$' .env; then
  echo "Set DOMAIN in .env before deploying. DNS must point to this Ubuntu host for HTTPS." >&2
  exit 1
fi

docker compose up -d --build
docker compose ps
echo "Deployment is live on ports 80 and 443."
echo "Open https://$(awk -F= '/^DOMAIN=/{print $2}' .env)"