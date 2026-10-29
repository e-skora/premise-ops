# Deploying PremiseOps

This guide shows how to run your own copy on **Fly.io** or **Railway** and point your own domain at it. Replace `<your-app-name>` and `<your-domain>` with your values. The last section has the details of our own live demo at `premise-ops.com`, including the ship log.

---

## Architecture Overview
- **Framework:** Next.js 14 App Router (`output: standalone`)
- **Persistence:** Local SQLite WAL engine (`premise.db`) with zero-config auto-seeding on first run
- **Telemetry:** one live public feed in the demo (ADR-014 reads the Claude Sonnet 5.5 input price from `https://openrouter.ai/api/v1/models`, cached 10 minutes); everything else is demo data until you connect sources. Probes can query a real Prometheus server or Datadog Metric API v2 through connectors, any JSON URL, or SQL on Premise's own database. The built-in PromQL support is a subset that runs on Premise's own stored samples.
- **Outbound:** GitHub PR, Slack Block Kit and PagerDuty Events v2 dispatchers. Each result is `SENT`, `DRY_RUN` (nothing left the app) or `FAILED` (with the real error).
- **Port:** `3000`

## Before you deploy
- **The database lives inside the container.** Without a persistent volume, `premise.db` resets to seed data on every deploy or machine restart.
- **Keep public demo mode on for any public URL.** `fly.toml` sets `PREMISE_PUBLIC_DEMO = "1"`. The app has no login, so without this mode anyone who can open the site can change the shared data, make the server fetch any URL, and apply file patches. With it, each visitor gets a private sandbox that resets after 24 hours, and outside fetches are blocked except the one OpenRouter URL. Turn it off only for a copy that nobody else can reach.

---

## Option A: Fly.io

This is what our live demo uses. It reads the included `fly.toml` and `Dockerfile`.

1. **Install the Fly CLI** (if not already installed):
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```
2. **Name your app**: in `fly.toml`, set `app = "<your-app-name>"` (and `primary_region` if you want a different region).
3. **Create and deploy**:
   ```bash
   fly apps create <your-app-name>
   fly deploy --remote-only --ha=false
   ```
   `--ha=false` runs one machine instead of two. With a SQLite file inside each machine, two machines would each hold different data.
4. **Attach your domain**:
   ```bash
   fly certs add <your-domain>
   fly certs setup <your-domain>
   ```
   `fly certs setup` prints the `A` and `AAAA` records to add at your DNS provider. Check progress with `fly certs check <your-domain>`.

---

## Option B: Railway

Not tested by us. Railway reads `Dockerfile` and `railway.json`:

1. **Push your code to GitHub**:
   Ensure your repo is pushed to your GitHub account (e.g., `github.com/<username>/premise`).
2. **Deploy on Railway**:
   - Go to [railway.app](https://railway.app) and click **"New Project"**.
   - Select **"Deploy from GitHub repo"** and select your repo.
   - Railway will automatically read `Dockerfile` and start building.
   - Set the variable `PREMISE_PUBLIC_DEMO=1` in the service settings if the site will be public (Railway does not read `fly.toml`).
3. **Connect your domain (`<your-domain>`)**:
   - In Railway project settings, go to **"Settings" → "Domains" → "Custom Domain"**.
   - Enter `<your-domain>` (and optionally `www.<your-domain>`).
   - Railway will provide a CNAME record (e.g., `<your-app-name>-production-xxxx.up.railway.app`).
   - At your DNS provider (for example the Cloudflare dashboard):
     - Go to `<your-domain>` → **DNS** → **Records**.
     - Add a `CNAME` record:
       - **Name:** `@` (or `<your-domain>`)
       - **Target:** your Railway domain target
       - **Proxy Status (Cloudflare):** Proxied (Orange cloud) or DNS only (both work; Proxied gives Cloudflare DDoS and caching).
     - Add a `CNAME` record for `www` pointing to `@`.

---

## Environment Variables (Optional)

The app runs with no environment variables. Without them, the seeded decisions show demo data (labeled "Demo data" in the UI), the compiler uses its basic parser, and every dispatch is a dry run.

| Variable | Effect |
| --- | --- |
| `PREMISE_LLM_PROVIDER` | `anthropic` or `openai`. When unset, the first key found wins: `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`. |
| `ANTHROPIC_API_KEY` | Enables language-model extraction in the compiler through the Anthropic Messages API (default model `claude-haiku-5-5`). |
| `OPENAI_API_KEY` | Enables extraction through the OpenAI Responses API (default model `gpt-6-luna`). |
| `PREMISE_LLM_MODEL` | Overrides the model for the chosen provider. |
| `GITHUB_TOKEN` / `GH_TOKEN` | Lets the PR bot open real pull requests. Without it, PRs are dry runs that return the PR body and a `gh pr create` command. |

All of these are ignored when `PREMISE_PUBLIC_DEMO=1` (the live site): the demo never calls a model, never opens a PR, and never sends Slack or PagerDuty messages. If a model call fails, the compiler says "AI extraction failed: <reason>. Used the basic parser." Slack and PagerDuty are configured in the app's connector settings, not through environment variables. No model keys are set on Fly.

---

## Our live demo (premise-ops.com)

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

### Ship log

Add one dated line here for every deploy of the live demo: what shipped, the Fly release number, and what was verified.

- 2026-10-23: First production deploy to Fly (`premise-ops`), DNS added in Cloudflare. Verified with `curl -I`: `https://premise-ops.com` 200, `https://premise-ops.com/demo` 200, `https://www.premise-ops.com` 200, `http://` → 301 to `https://`.
- 2026-10-25: Auto-deploy on push to `main` live (`.github/workflows/fly-deploy.yml`, secret `FLY_API_TOKEN`). First run (0a8eeba) stopped at tests: a reseed hook hit bun's 5s default timeout, so nothing deployed. Second run (c8e451d) with `--timeout 30000` passed 64 tests, deployed Fly release v2, and the workflow's check got 200 for `/` and `/demo`. Re-checked with `curl` from the Mac: both 200.
- 2026-10-25: Auto-deploy removed at Elias's request (supersedes the entry above). Deleted `.github/workflows/fly-deploy.yml`, deleted the GitHub secret `FLY_API_TOKEN`, and revoked its Fly deploy token. Deploys are manual again; the live site stays on Fly release v2.
- 2026-10-25: Correction to the entry above: the live site is on Fly release v3, not v2. The ship-log push (f728693) triggered one last auto-deploy before the workflow was removed in 0c36d05; v3 is built from f728693, whose app code is the same as v2's. After removal, `/` and `/demo` still return 200.
- 2026-10-26: Guided walkthrough tour (3663eb2, built in Gemini, moved from `/Users/frank/Argon-projects/anitgravity`) deployed by hand as Fly release v4. Before deploy: `tsc` clean, 64/64 tests, `next build` OK (run in a scratch copy). After: `/`, `/demo`, `/demo?tour=true` return 200; landing shows "Take Guided Tour"; tour opened in a browser at step 1 of 7.
- 2026-10-26: Cleanup steps 1 and 2 (PR #1, merged as 53ba162) deployed by hand as Fly release v5: public demo mode on (`PREMISE_PUBLIC_DEMO=1` in `fly.toml`), per-visitor sandboxes, demo repo moved to `examples/demo-repo`, extras hidden, local `premise.db` no longer shipped in the image. Before deploy: 75/75 tests, `scripts/check-test-isolation.sh` PASS, `tsc` clean, `next build` OK, CLI `check` exit 0, PR CI green. Verified with `curl` from the Mac: `/` and `/demo` 200; `POST /api/connectors` and `POST /api/locus` apply 403 "Disabled in public demo"; after a webhook metric change one cookie read 7.77 while another read 3.00; all 4 connectors show as demo placeholders; banner present; demo locus file resolves.
- 2026-10-27: Step 3 "make it honest" (PR #2, merged as ea9b7d1) deployed by hand as Fly release v6: no made-up values, honest dry runs (SENT / DRY_RUN / FAILED, no fake PR numbers or links), ADR-014's cost premise reads the real Claude Sonnet 5.5 input price from OpenRouter, language-model extraction via Anthropic (`claude-haiku-5-5`) or OpenAI (`gpt-6-luna`) with an honest fallback, overclaims fixed. CI now runs `check` against a saved OpenRouter copy and expects ADR-014 BROKEN (no live internet in CI). Before deploy: 104/104 tests, `scripts/check-test-isolation.sh` PASS, `tsc` clean, `next build` OK, PR CI green on 828b23a. Verified with `curl` from the Mac: `/` and `/demo` 200; `POST /api/connectors` and `POST /api/locus` 403 "Disabled in public demo"; running probes gave ADR-014 the real price 2 USD / 1M tokens from `https://openrouter.ai/api/v1/models`, fetched 2026-10-27T03:38:20Z (run at 03:38:19Z), status BROKEN, VENDOR-04 cascaded; a probe pointed at `https://example.com/metrics.json` was blocked ("Blocked in the public demo") and kept its value; the demo page shows the Live badge and fetch time.
- 2026-10-27: CI for other repos (PR #4, merged as b085feb) deployed by hand as Fly release v7: demo decisions only go into the demo database, probes written in `@premise` comments run when they have a source (new `jsonPath:` key), a decision with no data shows "No data" (`NO_DATA`) and `check` exits 1 on it, `scan --repo` reads an ADR's blast radius from the paragraph under its heading, new CI job `user-repo-check`. Before deploy: 117/117 tests, `scripts/check-test-isolation.sh` PASS, `tsc` clean, `next build` OK (run in a scratch copy), CLI `check --expect-broken upstream_llm_input_cost_usd` exit 0, PR CI green on both jobs. Proven on a scratch user repo: broken price exit 1, holding price exit 0, feed down or no probe exit 1 "No data". Verified with `curl` from the Mac: `/` and `/demo` 200; `POST /api/connectors` 403; a decision compiled in a sandbox came back `NO_DATA`; after running probes ADR-014 read the real price 2 USD / 1M tokens from `https://openrouter.ai/api/v1/models` at 2026-10-27T04:56:53Z, status BROKEN, VENDOR-04 cascaded.
- 2026-10-27: Compile Decision code location fix (PR #5, merged as ce07807) deployed by hand as Fly release v8: the dialog starts with no file path and its sample documents no longer name files that do not exist; a decision with no code location shows "No code location set" and the code viewer no longer falls back to a demo file; a path typed in the form or named in the document must be a real file, otherwise the preview says "File not found" and saving is refused. Before deploy: 124/124 tests, `scripts/check-test-isolation.sh` PASS, `tsc` clean, PR CI green on both jobs, checked in the browser on a local demo-mode server; the production build ran in Fly's remote builder. Verified with `curl` from the Mac: `/` and `/demo` 200; saving with `infra/made-up.yaml` returned 400 "File not found"; saving with no path stored an empty code location (`NO_DATA`); saving with `examples/demo-repo/services/ingest-worker/queue.ts:L1-L10` stored that path; `/api/locus?targetLocus=` returned `noLocus: true` and no file; all three dialog samples have an empty path; after running probes ADR-014 read the real price 2 USD / 1M tokens from `https://openrouter.ai/api/v1/models` at 2026-10-27T07:31:35Z, status INVALIDATED.
- 2026-10-27: Rename to PremiseOps and sample path cleanup (PR #7, merged as 3e67b1d) deployed by hand as Fly release v9: the product is called PremiseOps on the page title, landing page, header, tour and CLI; sample and seed text names no made-up files (new test `sample-paths.test.ts`). Before deploy: 128/128 tests, `tsc` clean, `next build` OK, isolation check passes, CI `check` exit 0. After, from the Mac: `/` and `/demo` 200, title "PremiseOps // The Premise-Decay Engine", `POST /api/connectors` and `POST /api/locus` 403, ADR-014 reads $2.00 live from OpenRouter (same as OpenRouter at that moment), BROKEN as expected.
- 2026-10-29: Wording change (PR #10, merged as da30dc1) deployed by hand as Fly release v10: the landing page, command palette, backtest screen and CLI say "all decisions" instead of the old group word, and the backtest summary field is now `overallRating`. Before deploy: 128/128 tests, `scripts/check-test-isolation.sh` PASS, `tsc` clean, `next build` OK, CI `check` exit 0, PR CI green. Verified with `curl` from the Mac: `/` and `/demo` 200; `POST /api/connectors` and `POST /api/locus` 403; the landing page shows "across all your decisions" and "EVALUATING DECISION ASSERTIONS", and the old word appears 0 times.
