# Hosting LedgerLocal marketing site on a VPS (from GitHub)

## How it works

| Location | What |
|----------|------|
| **`main` branch** | Source files in `docs/marketing/` (edit here) |
| **Deploy branch** (`gh-pages` by default) | Flat static site at **branch root** — `index.html`, `onboarding.html`, `styles.css` |
| **VPS** | Clone repo, checkout deploy branch, nginx `root` = clone directory |

Push to `main` → GitHub Actions copies site files to the deploy branch root → VPS `git pull` (manual or via Actions SSH).

---

## 1. One-time VPS setup

### Install nginx and clone

```bash
sudo apt update
sudo apt install -y nginx git
sudo mkdir -p /var/www/ledgerlocal
sudo chown "$USER:$USER" /var/www/ledgerlocal
cd /var/www/ledgerlocal
git clone https://github.com/YOUR_USER/YOUR_REPO.git repo
cd repo
git checkout gh-pages
```

If `gh-pages` does not exist yet, push marketing changes to `main` first so the GitHub Action creates it, then:

```bash
git fetch origin gh-pages
git checkout gh-pages
```

### Configure nginx (branch root)

```bash
# Copy from main if deploy branch has no deploy/ folder yet:
git fetch origin main
git show origin/main:docs/marketing/deploy/nginx-site.conf.example | sudo tee /etc/nginx/sites-available/ledgerlocal
```

Edit `/etc/nginx/sites-available/ledgerlocal`:

- `YOUR_DOMAIN` → your domain
- `REPO_PATH` → `/var/www/ledgerlocal/repo` (clone root — **not** `docs/marketing`)

```bash
sudo ln -sf /etc/nginx/sites-available/ledgerlocal /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### Install deploy script (lives outside deploy branch)

```bash
git fetch origin main
git show origin/main:docs/marketing/deploy/deploy.sh > /var/www/ledgerlocal/deploy.sh
chmod +x /var/www/ledgerlocal/deploy.sh
```

### HTTPS

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d YOUR_DOMAIN
```

---

## 2. Deploy workflow

### Automatic (GitHub Actions)

On push to `main` when `docs/marketing/**` changes:

1. **Publish** — copies `index.html`, `onboarding.html`, `styles.css` to deploy branch root
2. **Deploy** — SSH to VPS, `git pull` on deploy branch, reload nginx

**Secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
|--------|--------|
| `VPS_HOST` | VPS IP or hostname |
| `VPS_USER` | SSH user |
| `VPS_SSH_KEY` | Private SSH key |

**Optional variables:**

| Variable | Default | Purpose |
|----------|---------|---------|
| `VPS_DEPLOY_PATH` | `/var/www/ledgerlocal/repo` | Clone path on VPS |
| `VPS_DEPLOY_BRANCH` | `gh-pages` | Branch nginx serves |

The publish job runs without VPS secrets. The deploy job needs secrets; if they are missing, publish still updates the branch and you can pull manually.

### Manual deploy on VPS

```bash
/var/www/ledgerlocal/deploy.sh
```

Or:

```bash
cd /var/www/ledgerlocal/repo
git fetch origin gh-pages
git checkout gh-pages
git pull --ff-only origin gh-pages
sudo systemctl reload nginx
```

---

## 3. Local development

Edit files in `docs/marketing/` on `main`. Preview locally:

```bash
npm run marketing:preview
# http://localhost:4173
```

Commit and push to `main` — Actions publishes to deploy branch.

---

## 4. Verify

- `https://YOUR_DOMAIN/` → landing page
- `https://YOUR_DOMAIN/onboarding.html` → product tour

On the server:

```bash
ls /var/www/ledgerlocal/repo/index.html   # must exist at branch root
```

---

## 5. Troubleshooting

| Issue | Fix |
|-------|-----|
| 404 on `/` | nginx `root` must be clone root on **deploy branch**, not `docs/marketing` |
| `gh-pages` branch missing | Push to `main` once to run publish job |
| VPS still on `main` | `git checkout gh-pages && git pull` |
| Deploy job fails, publish OK | Add VPS secrets, or run `deploy.sh` manually |
| Wrong branch name | Set `VPS_DEPLOY_BRANCH` variable to match your branch |

---

## Layout

**`main` (development)**

```
docs/marketing/
  index.html
  onboarding.html
  styles.css
  deploy/          ← not published to site branch
    deploy.sh
    nginx-site.conf.example
```

**Deploy branch (`gh-pages`) — what nginx serves**

```
/var/www/ledgerlocal/repo/
  index.html
  onboarding.html
  styles.css
```
