# Premise Deployment Guide (`premise-ops.com`)

This guide explains how to deploy **Premise** to **Railway** or **Fly.io** and connect your domain `premise-ops.com` purchased on Cloudflare.

---

## Live Deployment (current)

`premise-ops.com` runs on **Fly.io**, app `premise-ops` (org `personal`, region `iad`, one shared-cpu 1 GB machine).

- **Redeploy:** manual only. Pushing to `main` does not change the live site. Run `fly deploy --remote-only --ha=false` from the repo root.
- **Fly IPs:** shared IPv4 `66.241.124.153`, dedicated IPv6 `2a09:8280:1::1c9:5553:0`.
- **Certificates:** `fly certs check premise-ops.com` / `fly certs check www.premise-ops.com` (both issued).
- **Persistence:** no Fly volume is attached, so `premise.db` resets to seed data on every deploy or machine restart.

Cloudflare DNS for `premise-ops.com` (all **DNS only**, grey cloud; Fly terminates TLS itself):

| Type | Name | Content |
|---|---|---|
| A | `@` | `66.241.124.153` |
| AAAA | `@` | `2a09:8280:1::1c9:5553:0` |
| A | `www` | `66.241.124.153` |
| AAAA | `www` | `2a09:8280:1::1c9:5553:0` |

If the Cloudflare proxy (orange cloud) is ever turned on, first add `CNAME _acme-challenge → premise-ops.com.z31ekel.flydns.net` and `CNAME _acme-challenge.www → www.premise-ops.com.z31ekel.flydns.net` so Fly can keep renewing certificates, and set Cloudflare SSL/TLS to **Full (strict)**.

Ship log:
- 2026-10-23: First production deploy to Fly (`premise-ops`), DNS added in Cloudflare. Verified with `curl -I`: `https://premise-ops.com` 200, `https://premise-ops.com/demo` 200, `https://www.premise-ops.com` 200, `http://` → 301 to `https://`.
- 2026-10-25: Auto-deploy on push to `main` live (`.github/workflows/fly-deploy.yml`, secret `FLY_API_TOKEN`). First run (0a8eeba) stopped at tests: a reseed hook hit bun's 5s default timeout, so nothing deployed. Second run (c8e451d) with `--timeout 30000` passed 64 tests, deployed Fly release v2, and the workflow's check got 200 for `/` and `/demo`. Re-checked with `curl` from the Mac: both 200.
- 2026-10-25: Auto-deploy removed at Elias's request (supersedes the entry above). Deleted `.github/workflows/fly-deploy.yml`, deleted the GitHub secret `FLY_API_TOKEN`, and revoked its Fly deploy token. Deploys are manual again; the live site stays on Fly release v2.

---

## Architecture Overview
- **Framework:** Next.js 14 App Router (`output: standalone`)
- **Persistence:** Local SQLite WAL engine (`premise.db`) with zero-config auto-seeding on first run
- **Telemetry:** Real-time PromQL parser, Datadog Metric API v2, Slack Block Kit & PagerDuty Events v2 dispatchers
- **Port:** `3000`

---

## Option A: 1-Click Deployment on Railway (Recommended)

Railway automatically detects `Dockerfile` and `railway.json`:

1. **Push your code to GitHub**:
   Ensure your repo is pushed to your GitHub account (e.g., `github.com/<username>/premise`).
2. **Deploy on Railway**:
   - Go to [railway.app](https://railway.app) and click **"New Project"**.
   - Select **"Deploy from GitHub repo"** and select `premise`.
   - Railway will automatically read `Dockerfile` and start building.
3. **Connect Cloudflare Domain (`premise-ops.com`)**:
   - In Railway project settings, go to **"Settings" → "Domains" → "Custom Domain"**.
   - Enter `premise-ops.com` (and optionally `www.premise-ops.com`).
   - Railway will provide a CNAME record (e.g., `premise-production-xxxx.up.railway.app`).
   - In your **Cloudflare Dashboard**:
     - Go to `premise-ops.com` → **DNS** → **Records**.
     - Add a `CNAME` record:
       - **Name:** `@` (or `premise-ops.com`)
       - **Target:** your Railway domain target
       - **Proxy Status:** Proxied (Orange cloud) or DNS only (both work; Proxied gives Cloudflare DDoS and caching).
     - Add a `CNAME` record for `www` pointing to `@`.

---

## Option B: Deploying on Fly.io

Fly.io utilizes the included `fly.toml` and `Dockerfile`:

1. **Install Fly CLI** (if not already installed):
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```
2. **Launch & Deploy**:
   ```bash
   fly launch --no-deploy
   fly deploy
   ```
3. **Attach Cloudflare Domain**:
   ```bash
   fly certs create premise-ops.com
   fly certs create www.premise-ops.com
   ```
   Follow the DNS instructions in the terminal to add the `A` and `AAAA` records in Cloudflare.

---

## Environment Variables (Optional)

The application functions 100% out of the box with zero environment variables needed (mock telemetry and deterministic engines are active). 

To connect live production services, provide the following in your Railway/Fly dashboard:
- `OPENAI_API_KEY`: *(Optional)* Enables live LLM-based clause extraction during document compilation.
- `GITHUB_TOKEN`: *(Optional)* Enables automated creation of real GitHub Pull Requests when teardowns breach.
- `SLACK_WEBHOOK_URL`: *(Optional)* Fallback default for Slack incident dispatch.
- `PAGERDUTY_ROUTING_KEY`: *(Optional)* Fallback routing key for PagerDuty Events v2.
