# Premise

Todo-or-die for assumptions: write down the numbers a decision depends on, check them against real data, and fail CI when one breaks.

![Dragging a slider in the Chaos / Drift Simulator until ADR-014 turns red](docs/media/chaos-slider.gif)

## Why

Decisions like ADRs, vendor contracts and "we self-host because it is cheaper" rest on numbers that quietly change: a price drops, latency improves, usage shrinks. The document stays the same while the reason behind it is gone. This tool watches those numbers, tells you when a decision has lost its reason, and drafts what to tear down.

Try the live demo: https://premise-ops.com/demo

## Quickstart

You need [Bun](https://bun.com/docs/installation) and [Node.js](https://nodejs.org/en/download) 22 or newer (Next.js runs on Node, and the local database uses Node's built-in SQLite).

```bash
git clone https://github.com/e-skora/premise
cd premise && bun install
bun run dev
```

Then open http://localhost:3000/demo. The first run creates `premise.db` in the folder and fills it with demo decisions.

## Writing a premise

A premise is one number a decision depends on, a comparison, and a threshold. You can write premises in two places.

### In an ADR

Put Markdown ADRs in `docs/adr/`, `docs/decisions/` or `decisions/`. Each premise is a line of the form `variable_name <op> number unit`. Shortened from [`examples/demo-repo/docs/adr/ADR-005-pinecone-vector-index.md`](examples/demo-repo/docs/adr/ADR-005-pinecone-vector-index.md):

```markdown
# ADR-005: Managed Pinecone Vector Index for Customer Embeddings
**Status:** Accepted | **Owner:** Core Search Team | **Locus:** `examples/demo-repo/packages/search-engine/src/pgvector-index.ts:L1-L30`

## Load-Bearing Premises
We justify maintaining a dedicated paid Pinecone index reservation only while the following quantitative constraints hold:
1. **Vector DB Cost Ceiling:** vector_embedding_cost_monthly_usd < 450.00 USD / mo across all index pods.
2. **Index Query P95 Latency:** vector_query_p95_ms < 120 ms under 90th-percentile query load.

## Blast Radius & Sunset Criteria
Decommission $450/mo Pinecone pod reservation and revert to local Postgres pgvector if monthly cost breaches $450/mo or latency exceeds 120ms.
```

- The first `# ` heading is the title.
- `**Locus:**` names the code the decision protects, as `path:Lstart-Lend`.
- A `## Blast Radius` (or `## Sunset`) section says what to remove when a premise breaks.
- `bun ./bin/premise-cli.ts scan --repo` finds these files. It reads the blast radius only from the rest of the line after the words "Blast Radius" or "Sunset Criteria", so for that reader write it on one line, like `**Blast Radius:** remove the Pinecone index`.
- You can also paste an ADR into "Compile Decision" in the web app. It reads the whole Blast Radius section and also understands plain words like "under 450 USD per month" or "at least 60%".

### As a comment in code

Put a block of `@premise` comments in the first 40 lines of a file under `packages/`, `services/`, `infra/` or `ops/` (`.ts`, `.tsx`, `.js`, `.yaml`, `.yml`, `.tf`, `.py`, `.sql`). Lines can start with `//`, `#` or `*`. From [`examples/demo-repo/packages/search-engine/src/pgvector-index.ts`](examples/demo-repo/packages/search-engine/src/pgvector-index.ts):

```ts
// @premise title: ADR-027: In-Database pgvector HNSW Index (Skip Dedicated Pinecone Cluster)
// @premise type: ADR
// @premise claim: Total embedded document vectors remain below 1,500,000 rows so HNSW index fits in 16GB shared_buffers
// @premise metric: pgvector_total_rows < 1500000 rows (current: 1380000, margin: 0.12)
// @premise probe: SQL_METRIC | SELECT CAST(value AS REAL) AS value FROM TelemetryMetric WHERE variableName = 'pgvector_total_rows'
// @premise blastRadius: Migrate vector workload out of RDS Postgres into dedicated Pinecone/Qdrant cluster and remove HNSW maintenance cron
```

| Key | Meaning |
| --- | --- |
| `title` | Required. The decision's name. |
| `metric` | Required. `variable_name <op> number unit`, optionally followed by `(margin: 0.12)`. A `current:` value is ignored: a comment is not a measurement. |
| `type` | `ADR` (default), `GITHUB_PR`, `STRATEGY_MEMO` or `VENDOR_CONTRACT`. |
| `claim` | The premise in plain words. |
| `probe` | `PROBE_TYPE \| query or URL`: where the real value comes from. |
| `blastRadius` | What to remove when the premise breaks. |

A file can instead point at a decision that already exists with `@premise-locus`, plus optional `Bound to:` and `Blast Radius:` lines. From [`examples/demo-repo/packages/llm-gateway/src/semantic-cache.ts`](examples/demo-repo/packages/llm-gateway/src/semantic-cache.ts):

```ts
// @premise-locus: art-adr-014
// Bound to: upstream_llm_input_cost_usd > 2.00 USD/1M AND upstream_ttft_p95_ms > 650 ms
// Blast Radius: 4,200 LOC Redis vector cache + $600/mo Redis cluster (redis-semantic-prod-01)
```

`bun ./bin/premise-cli.ts scan` finds these comments.

### Operators, margin and status

Operators: `<`, `<=`, `>`, `>=`, `==` (or `=`), `!=`.

A premise is **BROKEN** when its value fails the comparison, and **DECAYING** when it still passes but sits within the margin of the threshold (the margin is a fraction of the threshold, so `0.12` means 12%). Otherwise it is **VALID**. Until a probe or a person reports a value it is **UNBOUND** ("No value yet"). A decision is **INVALIDATED** when any premise breaks (or all of them, if you switch it to the `ALL` gate), and that spreads to the decisions that depend on it.

### Probe types

| Probe | Where the value comes from |
| --- | --- |
| `HTTP_JSON_PATH` | Fetches a JSON URL and reads one field. |
| `SQL_METRIC` | A read-only SQL query against Premise's own database. |
| `PROMQL` | A real Prometheus server when one is connected in the app; otherwise a PromQL subset (`avg_over_time`, `rate`, `quantile_over_time`, label selectors, arithmetic) over Premise's own stored samples. |
| `DATADOG_METRIC` | The Datadog Metric API, once connected in the app. Not accepted in `@premise` comments yet. |
| `WEBHOOK_INGEST` | Whatever you `POST` to `/api/webhooks/metric`. |
| `WEB_SCRAPE_EXTRACT` | Accepted, but there is no scraper yet: it reads the last stored value. |

## CI

`bun ./bin/premise-cli.ts check` runs the probes, judges every premise, and exits `1` when a load-bearing premise is BROKEN. `--expect-broken <ids>` passes only when exactly those premises are broken.

This repo checks itself with [`.github/workflows/premise-ci.yml`](.github/workflows/premise-ci.yml). The core of it:

```yaml
jobs:
  premise-assertions:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install --frozen-lockfile || bun install
      - run: bun ./bin/premise-cli.ts scan
      # CI has no live internet: ADR-014 reads a saved copy of the real
      # OpenRouter price ($2.00 per 1M tokens). At that price its "> $2.00"
      # premise is really BROKEN, so the step expects exactly that.
      - env:
          PREMISE_FEED_FIXTURE_DIR: examples/fixtures/live-feeds
        run: bun ./bin/premise-cli.ts check --expect-broken upstream_llm_input_cost_usd
```

Pointing this at your own repo does not work yet. The status section says why.

## Status: early stage

- No users yet. Built as an open-source tool and a portfolio piece.
- In the demo, one premise is live: ADR-014 reads the real Claude Sonnet 5.5 input price from OpenRouter. Every other value is demo data until you connect your own sources. The UI labels each value Live, Reported, Demo data or No value yet.
- PromQL without a connected Prometheus server is a subset that runs on Premise's own stored samples.
- GitHub PRs, Slack and PagerDuty are drafted as dry runs unless you set tokens. A dry run never shows a PR number or link.
- Language-model extraction in "Compile Decision" was tested with one real Anthropic call. OpenAI extraction has only been tested with a mocked response. Without a key, a basic parser is used and the app says so.
- Not on npm. You run it from a clone.

Running it in CI for your own repo is not ready. Tested by hand on a scratch repo with `PREMISE_WORKSPACE_ROOT` pointing at it:

- What works: `scan --repo` finds your ADRs and `@premise` comments, and `scan --import` adds the comments to the database.
- Every database also gets the demo decisions, so `check` judges them too and fails on ADR-014.
- A probe written in an `@premise` comment is saved as "not connected" and never runs. You have to connect it in the web app.
- A decision whose premises have no value yet shows HEALTHY, so a passing check can mean "no data".
- One route works today: `check --artifact <decision id> --mutate variable_name=<value>`, with a value you fetched yourself, exits `1` when the value breaks the premise and `0` when it holds. But the decision id is new every time you import.

To host your own copy, see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## License

MIT. See [`LICENSE`](LICENSE).
