#!/usr/bin/env bash
# Pull the deploy branch (static site at branch root) and reload nginx.
# Install once on VPS — see DEPLOY.md. Does not need to live on the deploy branch.
#
# Environment (optional):
#   DEPLOY_REPO_DIR     — git clone path (default: /var/www/ledgerlocal/repo)
#   DEPLOY_BRANCH       — branch nginx serves (default: gh-pages)
#   DEPLOY_RELOAD_NGINX — set to 0 to skip nginx reload

set -euo pipefail

REPO_DIR="${DEPLOY_REPO_DIR:-/var/www/ledgerlocal/repo}"
BRANCH="${DEPLOY_BRANCH:-gh-pages}"
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

if [[ ! -f "$REPO_DIR/index.html" ]]; then
  echo "Error: index.html not found at branch root ($REPO_DIR)." >&2
  echo "       Is nginx pointed at the deploy branch root? See DEPLOY.md." >&2
  exit 1
fi

echo "==> Deployed marketing site at $REPO_DIR (branch: $BRANCH)"
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
