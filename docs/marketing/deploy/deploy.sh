#!/usr/bin/env bash
# Pull latest marketing site from GitHub and reload nginx.
# Run on the VPS after initial setup (see DEPLOY.md).
#
# Environment (optional overrides):
#   DEPLOY_REPO_DIR   — git clone path (default: /var/www/ledgerlocal/repo)
#   DEPLOY_BRANCH     — branch to deploy (default: main)
#   DEPLOY_RELOAD_NGINX — set to 0 to skip nginx reload

set -euo pipefail

REPO_DIR="${DEPLOY_REPO_DIR:-/var/www/ledgerlocal/repo}"
BRANCH="${DEPLOY_BRANCH:-main}"
RELOAD_NGINX="${DEPLOY_RELOAD_NGINX:-1}"

if [[ ! -d "$REPO_DIR/.git" ]]; then
  echo "Error: $REPO_DIR is not a git repository. Clone the repo first." >&2
  exit 1
fi

cd "$REPO_DIR"

echo "==> Fetching origin/$BRANCH"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

MARKETING_DIR="$REPO_DIR/docs/marketing"
if [[ ! -f "$MARKETING_DIR/index.html" ]]; then
  echo "Error: $MARKETING_DIR/index.html not found after pull." >&2
  exit 1
fi

echo "==> Deployed marketing site at $MARKETING_DIR"
echo "    Pages: index.html, onboarding.html"

if [[ "$RELOAD_NGINX" == "1" ]] && command -v nginx >/dev/null 2>&1; then
  if sudo nginx -t 2>/dev/null; then
    echo "==> Reloading nginx"
    sudo systemctl reload nginx
  else
    echo "Warning: nginx config test failed; skipping reload." >&2
  fi
fi

echo "==> Done."
