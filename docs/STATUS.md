# Premise: current status and decisions

Read this at the start of every session. Update it at the end of every session (state, decisions, lessons, next step). Dated decision lines are never edited; a later line supersedes an earlier one.

## Where things stand (2026-10-27)
- `main` at the commit that updated this file, after PR #3 (merged as 1a941f0). Live site: https://premise-ops.com on Fly release v6 (deployed by hand from 8b41796's app code). Step 4 changed no app code, so it was not deployed.
- Done: Step 1 make it safe (PR #1), Step 2 cut it down (PR #1), Step 3 make it honest (PR #2), Step 4 README and license (PR #3). Steps 1 to 3 are in the ship log in `docs/DEPLOYMENT.md`.
- Step 4 added `README.md`, `LICENSE` (MIT), `docs/media/chaos-slider.gif`, and made `docs/DEPLOYMENT.md` a general guide. The premise-ops.com details and the ship log are now in its last section, "Our live demo (premise-ops.com)", under "### Ship log".
- Branches: `main`, plus `docs/readme-license` (merged, kept on GitHub and locally until Elias says to delete it). Tests: 104 pass. `scripts/check-test-isolation.sh` passes.
- The repo is still private on GitHub (`e-skora/premise`).
- The project has no users yet.

## Direction (decided 2026-10-26)
Premise goes forward as a slim, honest open-source tool and portfolio piece, not a business for now. The core is "todo-or-die for assumptions": write the numbers a decision depends on (in an ADR or `@premise` comments), check them against real sources, fail CI and draft a teardown when one breaks. The web control plane is the demo.

## Standing decisions (do not reopen)
- 2026-10-25: Deploys are manual. No auto-deploy on push until Elias says he understands it and wants it.
- 2026-10-26: Safety and the cut-down come before any public launch.
- 2026-10-26: Premise never shows a value, file path or result it did not really get. At least one demo premise watches real live data (ADR-014 reads the real OpenRouter price).
- 2026-10-27: Real data is never bent to make CI green. ADR-014 stays "> $2.00". CI checks live-feed premises against a saved copy of the feed (no live internet) and expects the known real result; only the live site fetches real data.
- Nothing is deleted (files, features, branches, data) without Elias's explicit OK.

## Next steps (in order)
1. **Decide: make CI work for other repos before going public?** Recommended yes, because the README's first line promises "fail CI when one breaks", and today that only works for this repo. Needs code changes and Elias's OK. The gaps are listed under Open items.
2. **Step 5: go public.** Needs Elias's decision first: keep the name "Premise" or rename. "Premise" is also used by Premise Data (premise.com), a funded data company, so there is trademark and search-noise risk. Then flip the GitHub repo to public and post a Show HN built around "the half-life of an assumption".

## Open items
- OpenAI extraction (`gpt-6-luna`) has only been tested with a mocked response; no OpenAI key was available. Anthropic (`claude-haiku-5-5`) was tested with one real call.
- When the real OpenRouter price changes, the live site flips but CI keeps the saved copy. Refresh `examples/fixtures/live-feeds` and the `--expect-broken` list together.
- The CLI `check` summary shows "Drag: $56,150/mo", which looks too high for the seeded spend. Not investigated.
- `check --reset` does not clear saved connectors (`ConnectorSetting` table). Clear them separately when wiping local data.
- CI for someone else's repo does not work yet (tested 2026-10-27 on a scratch repo with `PREMISE_WORKSPACE_ROOT`): (a) every database also gets the demo decisions, so `check` judges them and fails on ADR-014; (b) a probe written in an `@premise` comment is imported as UNBOUND and never runs, even with a working URL; (c) a decision whose premises have no value shows HEALTHY, so a pass can mean "no data"; (d) the decision id from `scan --import` is random, so `check --artifact` cannot be scripted. What works: `check --artifact <id> --mutate name=value` exits 1 when broken and 0 when it holds.
- `scan --repo` reads an ADR's blast radius only from the rest of the line after "Blast Radius" or "Sunset Criteria". For the demo ADR-005 heading `## Blast Radius & Sunset Criteria` it records "& Sunset Criteria". "Compile Decision" reads the section correctly.
- `DATADOG_METRIC` is not accepted in `@premise` comments (falls back to `HTTP_JSON_PATH`), and `WEB_SCRAPE_EXTRACT` has no scraper (it reads the last stored value). The README says both.

## Lessons (so they are not relearned)
- Claude Code reads `CLAUDE.md`, not `AGENTS.md` (verified in the Claude Code memory docs, https://code.claude.com/docs/en/memory). Until 2026-10-27 this repo had no `CLAUDE.md`, so Code panel sessions did not auto-load `AGENTS.md`. `CLAUDE.md` now imports `AGENTS.md` and this file.
- The original Gemini build looked complete but faked most data: invented current values (threshold x 0.84), invented code paths, fake PR numbers, probes pointed at its own fake feed. Always test on a fresh document, not the seed data, before trusting a feature.
- The old tests wrote to the real `premise.db`, patched real files in the checkout, and left 4 empty commits on a stray branch. Tests now run in a temp folder; `scripts/check-test-isolation.sh` proves the checkout is untouched.
- The public site had no login: anyone could change the shared demo, make the server fetch any URL, and apply patches. Fixed with public demo mode (per-visitor sandboxes, outside fetches blocked except one allowlisted URL).
- After Step 3, CI would have depended on a live website's price. Fixed with saved feed copies (`PREMISE_FEED_FIXTURE_DIR`).
- A feature that works on the demo data can still fail on a fresh repo. Step 4's CI example looked fine in this repo's own CI but did nothing useful on a scratch repo. Test docs examples from outside the repo before writing them down.
- The app needs Node.js 22 or newer as well as Bun: `bun run dev` starts Next.js under Node, and the database uses Node's built-in SQLite.
- `.handoffs/` is git-ignored: prompts and reports there exist only on Elias's Mac. Anything a future session must know goes in this file or `AGENTS.md`.
