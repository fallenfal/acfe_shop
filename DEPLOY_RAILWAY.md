# Deploy ACFE Shop on Railway (with demo data)

This project runs as **one Railway service**: Django serves the API and the built React app from the same URL.

## Prerequisites

- [GitHub](https://github.com) account with this repo pushed
- [Railway](https://railway.com) account
- [Git](https://git-scm.com/) and the [GitHub CLI](https://cli.github.com/) (optional)

---

## 1. Push code to GitHub

```bash
cd /home/alex/Projects/acfe_shop

git add .
git status   # confirm .env and frontend/node_modules are NOT listed
git commit -m "Initial commit: ACFE Shop"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/acfe_shop.git
git push -u origin main
```

---

## 2. Create the Railway project

1. Open [railway.com/new](https://railway.com/new) → **Deploy from GitHub repo** → select `acfe_shop`.
2. Add **PostgreSQL**: project → **+ New** → **Database** → **PostgreSQL**.
3. Open your **web service** → **Variables** → **Add variable reference** → link `DATABASE_URL` from Postgres.

---

## 3. Required environment variables

Set these on the **web service** (not the database):

| Variable | Example | Notes |
|----------|---------|--------|
| `SECRET_KEY` | long random string | [Django secret key](https://docs.djangoproject.com/en/5.0/ref/settings/#secret-key) |
| `DEBUG` | `False` | Production |
| `ALLOWED_HOSTS` | `.railway.app` | Leading dot allows all Railway subdomains |
| `DATABASE_URL` | *(from Postgres)* | Reference the plugin variable |
| `SEED_DEMO_DATA` | `true` | Loads demo org, users, sales, training, etc. |
| `DJANGO_SUPERUSER_PASSWORD` | strong password | Admin login — change from default |
| `DJANGO_SUPERUSER_USERNAME` | `admin` | Optional |
| `DJANGO_SUPERUSER_EMAIL` | `admin@acfe.coffee` | Optional |

Optional (usually auto-set by Railway):

| Variable | Notes |
|----------|--------|
| `RAILWAY_PUBLIC_DOMAIN` | Set by Railway; added to `ALLOWED_HOSTS` automatically |
| `PORT` | Set by Railway for Gunicorn |

`CORS_ALLOWED_ORIGINS` is only needed if the frontend is on a **different** domain than the API. Same-origin deploy does not need it.

---

## 4. Deploy

Railway reads `railway.toml` and builds with the **Dockerfile** (Node 20 builds the frontend, Python 3.12 runs Django):

- **Build**: `docker build` — `npm ci` / `npm run build` in `frontend/`, then `pip install`, `collectstatic`
- **Pre-deploy**: `migrate` + `bootstrap_demo` (superuser + demo data if missing)
- **Start**: `bin/start.sh` via Dockerfile `CMD` — reads `$PORT` in a shell script
- **Important**: In Railway → web service → **Settings** → **Deploy**, clear **Custom Start Command** if it contains `$PORT` (that overrides the Dockerfile and breaks startup)

If you see `npm: not found` with Railpack-only builds, use this Dockerfile setup (already in the repo).

After deploy, open the generated URL (e.g. `https://acfe-shop-production.up.railway.app`).

### Demo logins (from `seed_data`)

All org users share password **`acfe2024!`** unless you change seed data:

| Username | Role |
|----------|------|
| `jordan.owner` | Owner |
| `sarah.cm.union` | Content Manager (Union St) |
| `mike.cm.beach` | Content Manager (Beach) |
| `emma.staff.union` | Staff (Union St) |
| `liam.staff.beach` | Staff (Beach) |

Django admin: **`admin`** / your `DJANGO_SUPERUSER_PASSWORD`.

---

## 5. Keeping demo data on redeploy

`bootstrap_demo` is **idempotent**:

- First deploy: runs `seed_data` + `seed_training`
- Later deploys: **skips** seeding if data already exists (your data is kept)

To **reset** demo data (destructive):

```bash
# Railway CLI, or one-off shell in the dashboard
python manage.py bootstrap_demo --force-seed
```

Or set `SEED_DEMO_DATA=false` to never seed (empty DB after migrate).

---

## 6. Media uploads (optional)

Uploaded files (memo attachments, training images) use `media/` on disk. Railway disks are **ephemeral** unless you add a [Volume](https://docs.railway.com/reference/volumes) mounted at `/app/media` (or set `MEDIA_ROOT` accordingly). Demo seed data works without uploads.

---

## 7. Troubleshooting

| Issue | Fix |
|-------|-----|
| Blank page, API works | Frontend build failed — check build logs for `npm run build` |
| 400 / DisallowedHost | Set `ALLOWED_HOSTS=.railway.app` or your exact domain |
| No demo users | Check release logs for `bootstrap_demo`; ensure `SEED_DEMO_DATA=true` |
| DB connection error | Ensure `DATABASE_URL` references Postgres |
| `'$PORT' is not a valid port number` | Remove **Custom Start Command** in Railway service settings; redeploy so Dockerfile `bin/start.sh` runs |

Local production-like test:

```bash
export DATABASE_URL=postgres://...
export SECRET_KEY=dev-secret
export DEBUG=False
export ALLOWED_HOSTS=localhost,127.0.0.1
npm run build --prefix frontend
python manage.py migrate
python manage.py bootstrap_demo
gunicorn acfe_shop.wsgi:application --bind 0.0.0.0:8000
```
