# SYSTEM SPECIFICATION: PREMISE (The Premise-Decay Engine)
**"CI/CD for Architectural & Strategic Decisions"**

## 1. CORE OBJECTIVE & PRODUCT PHILOSOPHY
You are a Principal Systems Architect and Full-Stack Engineer. Build **Premise**, an executable decision-assertion engine that prevents organizational and architectural rot. 

Software teams and operators write Architecture Decision Records (ADRs), PR descriptions, and strategy memos built on temporary, load-bearing assumptions (e.g., *"We maintain this custom Redis caching layer because Upstream API X takes >800ms and costs $15/1M tokens"* or *"Acquisition channel Y is viable as long as CAC stays under $45"*). Months later, reality changes, the document rots, and teams keep maintaining dead infrastructure or funding broken plays.

**Premise is NOT a passive BI dashboard or note-taking app.** It is an automated garbage collector for outdated constraints. It ingests decision artifacts, compiles natural-language assumptions into live executable probes, continuously evaluates them against real-world data, and fires invalidation alerts when a load-bearing premise breaks.

### Strict Anti-Goals (Do Not Build):
- Do NOT build a marketing landing page, pricing tiers, or fluff onboarding screens.
- Do NOT stub out the core engine with static mock arrays; build a real database schema, a real extraction pipeline, and a real probe execution runner.
- Do NOT build a generic chat interface. The UI must look like a high-density engineering control plane (think Linear + GitHub Actions + Datadog).

---

## 2. ARCHITECTURE & DATA MODEL

Use a type-safe full-stack architecture (TypeScript, Next.js App Router, Tailwind CSS, Lucide Icons, SQLite/Prisma or Drizzle for zero-config local persistence, and Zod for strict structured LLM outputs).

### Core Schema (`schema.prisma` or equivalent):

1. **`DecisionArtifact`** (The Source of Truth)
   - `id`, `title`, `type` (`ADR` | `GITHUB_PR` | `STRATEGY_MEMO` | `VENDOR_CONTRACT`)
   - `rawContent` (Markdown text of the decision)
   - `targetLocus` (e.g., GitHub repo path `src/services/router.ts:L42-110` or operational owner)
   - `blastRadius` (Summary of what infrastructure/process becomes obsolete if this decision is invalidated)
   - `status` (`HEALTHY` | `AT_RISK` | `INVALIDATED`)
   - `createdAt`, `lastEvaluatedAt`

2. **`Premise`** (The Extracted Assumption)
   - `id`, `artifactId` (FK)
   - `claim` (Natural language statement extracted from the artifact, e.g., *"Anthropic Claude Sonnet input pricing is $3.00 per 1M tokens"*)
   - `variableName` (Normalized metric name, e.g., `upstream_token_cost_usd`)
   - `operator` (`LT` | `LTE` | `GT` | `GTE` | `EQ` | `NEQ`)
   - `thresholdValue` (Float or String — the boundary where the decision still holds true)
   - `currentValue` (Float or String — latest value returned by the Probe)
   - `decayWarningMargin` (Float — e.g., within 10% of breaking threshold triggers `DECAYING` state)
   - `status` (`VALID` | `DECAYING` | `BROKEN` | `UNBOUND`)

3. **`Probe`** (The Live Listener Bound to a Premise)
   - `id`, `premiseId` (FK)
   - `probeType` (`HTTP_JSON_PATH` | `WEB_SCRAPE_EXTRACT` | `WEBHOOK_INGEST` | `SQL_METRIC`)
   - `targetUrlOrQuery` (Endpoint URL, JSONPath selector, or query definition)
   - `pollingIntervalSeconds` (Int)
   - `lastRunAt`, `lastRawResponse`, `lastError`

4. **`InvalidationEvent`** (The Kill-Switch Output)
   - `id`, `premiseId` (FK), `artifactId` (FK)
   - `previousValue`, `breakingValue`, `thresholdValue`
   - `remediationPlan` (Auto-generated teardown diff, PR description, or action item explaining exactly what code/process to rip out now that the premise is dead)
   - `acknowledged` (Boolean)
   - `triggeredAt`

---

## 3. CORE FUNCTIONAL PIPELINES TO IMPLEMENT

### Pipeline A: The Premise Compiler (Ingestion -> Structured Assertions)
Build an ingestion route (`/api/compile`) and UI workflow where a user pastes an ADR, PR description, or strategy memo (or selects from 3 rich, pre-loaded real-world engineering/strategy templates).
- Parse the document using structured extraction (with a deterministic fallback parser if no LLM API key is configured in `.env`) to automatically extract:
  1. Every load-bearing quantitative or state assumption (`Premise`).
  2. The logical operator and threshold value required for the decision to remain valid.
  3. The `blastRadius` (what exact subsystem or budget exists *only* because of this premise).
  4. A recommended `Probe` configuration to monitor that variable in the wild.

### Pipeline B: The Probe Execution Engine (`/api/probes/run`)
Build an execution runner that evaluates active probes:
- **`HTTP_JSON_PATH` Runner**: Fetches a live JSON endpoint, extracts the value via path selector, and compares it against `[operator] [thresholdValue]`.
- **`WEBHOOK_INGEST` Runner**: Exposes a clean POST endpoint (`/api/webhooks/metric`) where external CI/CD pipelines or telemetry scripts can push a `{ variableName, value }` payload to immediately evaluate all bound premises.
- **State Machine Transition**:
  - If `currentValue` satisfies the assertion -> `VALID`.
  - If `currentValue` is within `decayWarningMargin` of the threshold -> `DECAYING`.
  - If `currentValue` violates the threshold -> Flip Premise to `BROKEN`, flip parent `DecisionArtifact` to `INVALIDATED`, and generate an `InvalidationEvent` with a concrete teardown/refactoring spec.

### Pipeline C: Live "Chaos / Drift Simulation" Engine
Because waiting 6 months for an external vendor price or latency metric to drift makes testing impossible, build a **"Simulate Reality Drift" (Chaos Drawer)** directly into the workspace:
- Allow the user to drag a slider or inject a synthetic telemetry spike/drop (e.g., *"Simulate Upstream API Latency dropping from 950ms to 120ms"* or *"Simulate Cloud Egress Cost spiking to $0.14/GB"*).
- Watching this slider cross the threshold must trigger the real evaluation pipeline, flip the dependency tree red in real time, and generate the automated `InvalidationEvent` and GitHub Issue/PR teardown payload.

---

## 4. UI / UX SPECIFICATIONS (HIGH-DENSITY CONTROL PLANE)

Design a sharp, dark-mode industrial interface (`bg-zinc-950`, crisp `1px` `border-zinc-800` hairlines, monospace data readouts, semantic status badges in emerald/amber/crimson).

1. **Top Telemetry Bar**:
   - Total Active Decisions | Load-Bearing Premises Monitored | Decaying Premises (Warning) | Broken Premises (Action Required)
   - Global **"Run All Probes Now"** button + **"Chaos / Drift Simulator"** toggle.

2. **Main Split-Pane Workspace**:
   - **Left Pane (Decision Artifact Registry)**: Filterable list of ADRs, PRs, and Strategy Memos showing health status badges, target code locus (`e.g., services/cache-layer/*`), and count of bound premises.
   - **Center Pane (The Dependency & Assertion Graph)**: Selecting an artifact displays:
     - The original document with extracted premises highlighted inline.
     - Cards for each compiled `Premise` showing the live formula: `LIVE VALUE [currentValue] vs ASSERTION [operator] [thresholdValue]`.
     - Visual progress/drift bar showing how close the premise is to breaking.
     - Live Probe configuration inspector (endpoint, last ping latency, raw JSON response preview).
   - **Right Pane / Drawer (Invalidation & Teardown Feed)**:
     - When a premise breaks, display the generated **Teardown Spec**: exact explanation of why the original decision is now obsolete, what code/process to delete, and a one-click **"Export GitHub Issue / PR Payload"** markdown generator.

---

## 5. SEED DATA (PRE-LOAD ON FIRST BOOT)
Pre-populate the database with 3 realistic, high-stakes scenarios so the engine is immediately interactive on first boot:
1. **ADR-014: Custom Semantic Caching Microservice**
   - *Locus*: `packages/llm-gateway/src/semantic-cache.ts`
   - *Premises*: (1) Upstream LLM input cost > `$2.00 / 1M tokens`, (2) P95 upstream time-to-first-token > `650ms`.
   - *Blast Radius*: 4,200 LOC Redis vector cache + $600/mo Redis cluster can be deleted if upstream models become cheap and fast enough.
2. **PR #892: Multi-Provider Failover & Retry Queue**
   - *Locus*: `services/ingest-worker/queue.ts`
   - *Premises*: Primary webhook provider SLA uptime < `99.9%` over rolling 30d window.
3. **GTM-Q3: Paid Search Outbound Funnel**
   - *Locus*: `ops/growth/paid-acquisition-budget`
   - *Premises*: (1) Blended CAC < `$65.00`, (2) Day-30 payback conversion >= `14.5%`.

## 6. EXECUTION ORDER
1. Initialize the database schema and seed the 3 realistic scenarios with bound probes.
2. Build the deterministic evaluation engine (`/api/probes/run` and `/api/webhooks/metric`) and the Premise Compiler (`/api/compile`).
3. Build the single-screen industrial Command Center UI with the split-pane assertion inspector and the live Chaos/Drift Simulator.
4. Verify that mutating a metric past its threshold immediately flips the state machine and renders the teardown payload.