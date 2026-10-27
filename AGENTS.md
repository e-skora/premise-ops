# PREMISE (The Premise-Decay Engine): Agent & Architecture Context

## 1. System Overview
**Premise** (`https://premise-ops.com`, "CI/CD for Architectural & Strategic Decisions") is an executable decision-assertion engine and garbage collector for outdated architectural and strategic constraints. It ingests ADRs, GitHub PRs, strategy memos and vendor contracts, compiles their natural-language assumptions into premises with suggested probes, evaluates them against telemetry once a probe is connected, and drafts teardown diffs and outbound alerts when load-bearing premises break.

Honesty rules the code follows: a premise has no value (status `UNBOUND`) until a probe or a person reports one; every value records where it came from (`Premise.valueSource`, `valueObservedAt`) and the UI labels it Live, Reported, Demo data or No value yet; dispatches are `SENT`, `DRY_RUN` or `FAILED` and never carry an invented PR number or link. In the demo, one premise is live: ADR-014's cost premise reads the real Claude Sonnet 5.5 input price from OpenRouter. The other seeded premises are demo data.

## 2. Running It
Make sure `node` (v22+) and `bun` are on PATH.

| Task | Command |
| --- | --- |
| Install | `bun install` |
| Dev server | `bun run dev` |
| Tests | `bun test` |
| Prove tests leave the checkout alone | `scripts/check-test-isolation.sh` |
| Type-check | `npx tsc --noEmit` |
| Production build | `bun run build` |
| CI assertions | `bun ./bin/premise-cli.ts check` (exits `1` when a load-bearing premise is `BROKEN`) |
| Codebase scan | `bun ./bin/premise-cli.ts scan` |
| Backtest | `bun ./bin/premise-cli.ts backtest --scenario historical` |
| Deploy (manual only) | `fly deploy --remote-only --ha=false` (see `docs/DEPLOYMENT.md`) |

CLI flags: `check`, `scan`, `backtest`, `replay`, `--scenario`, `--steps`, `--shock`, `--noise`, `--apply`, `--rollback`, `--strict`, `--simulate-breach`, `--mutate`, `--reset`, `--json`, `--finops`.

### Environment variables
| Variable | Effect |
| --- | --- |
| `PREMISE_DB_PATH` | SQLite file. Defaults to `./premise.db`, except under `bun test`, where it must be set. |
| `PREMISE_WORKSPACE_ROOT` | Folder that loci, scanners and local git operations resolve against. Defaults to the current directory. |
| `PREMISE_PUBLIC_DEMO=1` | Public demo mode (on in `fly.toml`). Off by default. |
| `PREMISE_SANDBOX_DIR` | Where demo sandboxes live. Defaults to `/tmp/premise-sandboxes`. |
| `PREMISE_EXTRAS=1` | Shows FinOps / Balance Sheet, Time Machine, Topology Graph and PagerDuty. Off by default. |
| `PREMISE_LLM_PROVIDER` | `anthropic` or `openai`. Unset: `ANTHROPIC_API_KEY` first, then `OPENAI_API_KEY`. |
| `ANTHROPIC_API_KEY` | Language-model extraction via the Anthropic Messages API, default model `claude-haiku-5-5` (ignored in demo mode). |
| `OPENAI_API_KEY` | Language-model extraction via the OpenAI Responses API, default model `gpt-6-luna` (ignored in demo mode). |
| `PREMISE_LLM_MODEL` | Overrides the model for the chosen provider. |
| `GITHUB_TOKEN` / `GH_TOKEN` | Lets the PR bot open real PRs; without it PRs are dry runs (ignored in demo mode). |

## 3. Persistence
- Zero-config local SQLite in WAL mode via `src/db/index.ts`. That file holds the real schema (`initSchema`); `docs/history/schema-reference.prisma` is reference only.
- Dual-runtime loader `createSqliteInstance`: `node:sqlite` (`DatabaseSync`) under Node, `bun:sqlite` under Bun. Both are externalized in `next.config.mjs`.
- `getDb()` returns the visitor's sandbox database when a demo request is running (`src/db/sandbox-context.ts`), otherwise the shared database.

## 4. Public Demo Mode (`PREMISE_PUBLIC_DEMO=1`)
- `src/middleware.ts` gives each visitor a `premise_sandbox` cookie. `src/lib/demo-sandbox.ts` copies a seeded template into `/tmp/premise-sandboxes/<id>.db`, deletes sandboxes older than 24 hours and caps the total at 500 (oldest first).
- Every API route is wrapped in `withDemoSandbox`, and `src/app/demo/page.tsx` renders from the visitor's sandbox, so one visitor never sees another's changes.
- Blocked with HTTP 403 `{ error: "Disabled in public demo" }`: `/api/connectors` POST, `/api/locus` POST, `/api/scanner/scan` against anything but the bundled demo repo.
- Silently safe: dispatch is always a dry run; no git branches, PRs, language-model calls or live Prometheus/Datadog queries; `locus-inspector` refuses real file writes.
- Outside probe fetches are blocked except one exact-match URL, `https://openrouter.ai/api/v1/models` (ADR-014's live price), cached for 10 minutes (`src/lib/live-feeds.ts`). A blocked probe records the reason in `Probe.lastError` and keeps its value.
- Connectors show as "demo placeholder"; a banner says changes are private and reset after 24 hours.

## 5. Codebase Map
### Demo data
- `examples/demo-repo/`: the fake codebase the demo points at (`packages/`, `services/`, `infra/`, `ops/`, `docs/adr/`). Seed loci read like `examples/demo-repo/packages/llm-gateway/src/semantic-cache.ts:L1-L30`. The Docker image ships it.
- `src/db/seed-data.ts`: seed artifacts (`ADR-014`, `VENDOR-04` depending on `ADR-014`, `PR #892`, `GTM-Q3`, more), historical telemetry series (`SEED_HISTORICAL_SERIES`), probes and compiler templates.

### Types
- `src/lib/types.ts`: TypeScript interfaces and Zod schemas (`CompiledArtifactOutputSchema`, `CompiledPremiseSchema`, `LocusInspectionResult`, `DiscoveredCodebasePremise`, connector types).

### Core engines (`src/lib/`)
- `evaluator.ts`: `evaluatePremiseState` (`LT | LTE | GT | GTE | EQ | NEQ`, `decayWarningMargin`, `VALID` / `DECAYING` / `BROKEN`, `UNBOUND` for an empty value), `computeArtifactStatus` (`ANY` / `ALL` gates), `computeDriftForecast` (linear-regression time-to-invalidation), `extractJsonPath` (dotted keys, `[n]`, `[?(@.field=="x")]` filters), `generateRemediationPlan`.
- `compiler.ts`: `compileDecisionArtifact`. Language-model extraction (Anthropic SDK or OpenAI Responses API, JSON schema output, validated with Zod) with a deterministic fallback (`parseDocumentDeterministically`, `extractQuantitativePremises`) that reports why it fell back. Compiled premises never carry a value; their probes are `UNBOUND` suggestions.
- `live-feeds.ts`: `fetchLiveJson` (10-minute cache for allowlisted URLs), the public demo allowlist, and value-source labels.
- `probe-engines.ts`: `executeReadOnlySqlMetricQuery` (read-only SQL against the database) and `evaluatePromQlExpression` (a PromQL subset that runs on Premise's own stored samples: `avg_over_time`, `rate`, `quantile_over_time`, label selectors, arithmetic). Real Prometheus queries go through `telemetry-connectors.ts`.
- `telemetry-connectors.ts`: Prometheus/Thanos instant and range queries (Bearer, Basic, tenant headers) and Datadog Metric API v2 with v1 fallback, plus connection tests.
- `outbound-dispatchers.ts`: Slack Block Kit alerts and PagerDuty Events v2; results are `SENT`, `DRY_RUN` or `FAILED`.
- `locus-inspector.ts`: reads real files at a `targetLocus`, builds `git apply`-ready diffs, applies and rolls back teardowns (`LocusBackup`), and finds multi-file caller blast radius.
- `codebase-scanner.ts`: finds inline `@premise` / `@premise-locus` annotations under `packages/ services/ infra/ ops/` at the workspace root and inside `examples/demo-repo/`.
- `repo-scanner.ts`: scans ADR folders, dependency manifests (`HEAVY_DEPENDENCY_CATALOG`) and inline premises into a deduplicated inbox; converts findings to `CompiledArtifactOutput`.
- `github-pr-bot.ts`: teardown branch names, PR body markdown, `gh pr create` commands, local branch creation; opens the PR only with a GitHub token, otherwise returns `DRY_RUN` with no PR number or link.
- `backtest-engine.ts`: scenario presets, deterministic time-series generator, resilience scoring (HIGH / MODERATE / BRITTLE), threshold buffer advisor, replay with cascade propagation.
- `finops-engine.ts`: monthly and daily drag and cumulative savings (`calculateFinOpsLedger`, `formatUsd`).
- `sunset-synthesizer.ts` / `sunset-synthesizer-server.ts`: replacement ADR synthesis and the "Retire & Promote" workflow.
- `topology-engine.ts`: tiered DAG layout, Bezier links, transitive blast radius and prerequisites.
- `demo-mode.ts`, `demo-sandbox.ts`, `workspace-root.ts`: flags, sandboxes and the workspace root.

### API routes (`src/app/api/`)
| Route | Purpose |
| --- | --- |
| `GET/POST /api/state` | State hydration, seed reset, acknowledge, `setCombinator`, `setDependencies`, `updatePremiseConfig` |
| `POST /api/compile` | Compile a document into an artifact |
| `GET/POST /api/probes/run` | Run probes |
| `POST /api/webhooks/metric` | Metric ingestion and the chaos simulator |
| `GET /api/stream` | SSE probe daemon |
| `GET /api/telemetry/live` | Live JSON telemetry for `HTTP_JSON_PATH` probes |
| `GET/POST /api/locus` | File inspector, diff preview, apply / rollback |
| `GET/POST /api/scan` | Inline annotation scanner and import |
| `GET/POST /api/scanner/scan` | Repo scanner inbox, accept one or all |
| `GET/POST /api/dispatch` | Outbound dispatch (`GITHUB_PR`, `GITHUB_ISSUE`, `SLACK_WEBHOOK`, `PAGERDUTY_EVENT`) |
| `GET/POST /api/connectors` | Connector credentials: save, delete, test, masked view |
| `GET/POST /api/backtest` | Scenario presets and backtests |
| `GET /api/finops` | FinOps ledger |
| `POST /api/synthesizer` | Replacement ADR preview and Retire & Promote |

### UI (`src/components/`)
- `PremiseControlPlane.tsx`: main 3-pane command center (top bar, registry, assertion inspector, teardown pane, modals, SSE controller, keyboard shortcuts, demo banner).
- `ChaosDrawer.tsx`, `CompilerModal.tsx`, `TeardownPane.tsx`, `LocusInspectorPanel.tsx`, `DependencyGraph.tsx`, `SparklineChart.tsx`, `CodebaseScannerModal.tsx`, `RepoScannerModal.tsx`, `ConnectorSettingsModal.tsx`, `CommandPalette.tsx` (`Cmd+K`), `WalkthroughTour.tsx`, `LandingPage.tsx`.
- Extras (shown only with `PREMISE_EXTRAS=1`): `ExecutiveBalanceSheetModal.tsx`, `TimeMachineModal.tsx`, `VisualTopologyGraph.tsx` (`Cmd+G`), PagerDuty dispatch.

## 6. Tests & CI
- `src/__tests__/*.test.ts` cover the evaluator and probes, scanners, locus apply / rollback, cascades, the PR bot, backtests, connectors and dispatchers, FinOps and the synthesizer, topology, the palette, the tour and public demo mode.
- `bunfig.toml` preloads `src/__tests__/setup/isolate-test-env.ts`: it scrubs `PREMISE_*`, `OPENAI_*`, `GITHUB_*`, `SLACK_*`, `PAGERDUTY_*` env vars, creates a fresh temp folder per run, points HOME, `PREMISE_DB_PATH`, `PREMISE_WORKSPACE_ROOT` and `PREMISE_SANDBOX_DIR` at it, and copies `examples/demo-repo` there. Tests must never write `./premise.db` or files in the checkout.
- `.github/workflows/premise-ci.yml` runs `bun test`, `scan`, `backtest --scenario historical` and `check`.

## 7. History
- `docs/history/original-gemini-build-prompt.md`: the original build prompt.
- `docs/history/schema-reference.prisma`: the old Prisma schema, reference only.
- `docs/DEPLOYMENT.md`: how deploys work and the ship log.
