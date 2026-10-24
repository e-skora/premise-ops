# Premise Deployment Guide (`premise-ops.com`)

This guide explains how to deploy **Premise** to **Railway** or **Fly.io** and connect your domain `premise-ops.com` purchased on Cloudflare.

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
