# Hosting LedgerLocal marketing site on a VPS (from GitHub)

The marketing site is static HTML in this folder. Nginx serves files directly from the cloned repo — deploys are a `git pull`.

**Pages:** `index.html` (landing), `onboarding.html` (product tour), `styles.css`

---

## 1. One-time VPS setup

SSH into your VPS as a user with `sudo` (Ubuntu/Debian examples).

### Install nginx

```bash
sudo apt update
sudo apt install -y nginx git
```

### Clone the repository

```bash
sudo mkdir -p /var/www/ledgerlocal
sudo chown "$USER:$USER" /var/www/ledgerlocal
cd /var/www/ledgerlocal
git clone https://github.com/YOUR_USER/YOUR_REPO.git repo
cd repo
git checkout main
```

Use SSH clone URL if the repo is private:

```bash
git clone git@github.com:YOUR_USER/YOUR_REPO.git repo
```

### Configure nginx

```bash
sudo cp /var/www/ledgerlocal/repo/docs/marketing/deploy/nginx-site.conf.example \
  /etc/nginx/sites-available/ledgerlocal
```

Edit the file and replace:

- `YOUR_DOMAIN` → your domain (e.g. `ledgerlocal.app`)
- `REPO_PATH` → `/var/www/ledgerlocal/repo` (nginx `root` becomes `.../repo/docs/marketing`)

```bash
sudo ln -sf /etc/nginx/sites-available/ledgerlocal /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default   # optional, if unused
sudo nginx -t
sudo systemctl reload nginx
```

Point DNS **A record** for your domain to the VPS IP.

### HTTPS (recommended)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d YOUR_DOMAIN
```

Then uncomment the SSL `server` block in the nginx config (and the HTTP→HTTPS redirect) per comments in `deploy/nginx-site.conf.example`.

### Make deploy script executable

```bash
chmod +x /var/www/ledgerlocal/repo/docs/marketing/deploy/deploy.sh
```

---

## 2. Deploy workflow (git pull)

### Option A — GitHub Actions (recommended)

On every push to `main` that touches `docs/marketing/`, the workflow runs `deploy.sh` on your VPS.

**Add repository secrets** (GitHub → Settings → Secrets and variables → Actions):

| Secret        | Value                          |
|---------------|--------------------------------|
| `VPS_HOST`    | VPS IP or hostname             |
| `VPS_USER`    | SSH user (e.g. `deploy`)       |
| `VPS_SSH_KEY` | Private SSH key for that user  |

**Optional variables** (Settings → Secrets and variables → Actions → Variables):

| Variable           | Default                      |
|--------------------|------------------------------|
| `VPS_DEPLOY_PATH`  | `/var/www/ledgerlocal/repo`  |
| `VPS_DEPLOY_BRANCH`| `main`                       |

**VPS: dedicated deploy user** (run once on server):

```bash
sudo adduser deploy
sudo usermod -aG www-data deploy

# As your admin user — allow deploy to pull repo and reload nginx
sudo chown -R deploy:deploy /var/www/ledgerlocal/repo

# Passwordless nginx reload for deploy user
echo 'deploy ALL=(ALL) NOPASSWD: /usr/sbin/nginx, /bin/systemctl reload nginx' | sudo tee /etc/sudoers.d/ledgerlocal-deploy
```

Add the **public** key to `/home/deploy/.ssh/authorized_keys`. Put the **private** key in GitHub secret `VPS_SSH_KEY`.

**Test deploy manually:**

```bash
ssh deploy@YOUR_VPS 'bash /var/www/ledgerlocal/repo/docs/marketing/deploy/deploy.sh'
```

**Trigger from GitHub:** push to `main`, or Actions → “Deploy marketing site” → Run workflow.

### Option B — Manual deploy

After merging to `main`:

```bash
ssh your-user@YOUR_VPS
bash /var/www/ledgerlocal/repo/docs/marketing/deploy/deploy.sh
```

Or:

```bash
cd /var/www/ledgerlocal/repo && git pull origin main && sudo systemctl reload nginx
```

### Option C — GitHub webhook + cron (alternative)

If you prefer not to use Actions, a webhook listener or a cron job can run `deploy.sh` when notified. Option A is simpler for most setups.

---

## 3. Verify

- https://YOUR_DOMAIN/ → landing page  
- https://YOUR_DOMAIN/onboarding.html → product tour  

Local preview before push:

```bash
npm run marketing:preview
# http://localhost:4173
```

---

## 4. Troubleshooting

| Issue | Check |
|-------|--------|
| 404 on `/onboarding.html` | `root` in nginx must be `.../repo/docs/marketing` |
| Permission denied on `git pull` | Repo owned by deploy user; SSH key has read access to GitHub |
| Actions deploy fails | Secrets correct; deploy user can `sudo nginx -t` and `reload` |
| Stale CSS after deploy | Hard refresh; HTML has `no-cache` headers in nginx example |

---

## File layout on VPS

```
/var/www/ledgerlocal/repo/          ← git clone (entire monorepo)
  docs/marketing/
    index.html                      ← nginx document root
    onboarding.html
    styles.css
    deploy/
      deploy.sh
      nginx-site.conf.example
```

Nginx serves **only** `docs/marketing/` — the rest of the repo is not exposed unless you misconfigure `root`.
