# Premise: current status and decisions

Read this at the start of every session. Update it at the end of every session (state, decisions, lessons, next step). Dated decision lines are never edited; a later line supersedes an earlier one.

## Where things stand (2026-10-27)
- `main` at the commit that added this file. Live site: https://premise-ops.com on Fly release v6 (deployed by hand from 8b41796's app code).
- Done: Step 1 make it safe (PR #1), Step 2 cut it down (PR #1), Step 3 make it honest (PR #2). Details and verification for each are in the ship log in `docs/DEPLOYMENT.md`.
- Only branch: `main`. Tests: 104 pass. `scripts/check-test-isolation.sh` passes.
- The repo is still private on GitHub (`e-skora/premise`). There is no README and no LICENSE yet.
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
1. **Step 4: README and license.** One line on what it is; a short GIF of the chaos slider turning a decision red; a 3-command quickstart; the premise format; a copy-paste CI example; an honest "early stage" status section; MIT license. Rewrite the top of `docs/DEPLOYMENT.md` so it reads as a general guide, not notes about one domain.
2. **Step 5: go public.** Needs Elias's decision first: keep the name "Premise" or rename. "Premise" is also used by Premise Data (premise.com), a funded data company, so there is trademark and search-noise risk. Then flip the GitHub repo to public and post a Show HN built around "the half-life of an assumption".

## Open items
- OpenAI extraction (`gpt-6-luna`) has only been tested with a mocked response; no OpenAI key was available. Anthropic (`claude-haiku-5-5`) was tested with one real call.
- When the real OpenRouter price changes, the live site flips but CI keeps the saved copy. Refresh `examples/fixtures/live-feeds` and the `--expect-broken` list together.
- The CLI `check` summary shows "Drag: $56,150/mo", which looks too high for the seeded spend. Not investigated.
- `check --reset` does not clear saved connectors (`ConnectorSetting` table). Clear them separately when wiping local data.

## Lessons (so they are not relearned)
- Claude Code reads `CLAUDE.md`, not `AGENTS.md` (verified in the Claude Code memory docs, https://code.claude.com/docs/en/memory). Until 2026-10-27 this repo had no `CLAUDE.md`, so Code panel sessions did not auto-load `AGENTS.md`. `CLAUDE.md` now imports `AGENTS.md` and this file.
- The original Gemini build looked complete but faked most data: invented current values (threshold x 0.84), invented code paths, fake PR numbers, probes pointed at its own fake feed. Always test on a fresh document, not the seed data, before trusting a feature.
- The old tests wrote to the real `premise.db`, patched real files in the checkout, and left 4 empty commits on a stray branch. Tests now run in a temp folder; `scripts/check-test-isolation.sh` proves the checkout is untouched.
- The public site had no login: anyone could change the shared demo, make the server fetch any URL, and apply patches. Fixed with public demo mode (per-visitor sandboxes, outside fetches blocked except one allowlisted URL).
- After Step 3, CI would have depended on a live website's price. Fixed with saved feed copies (`PREMISE_FEED_FIXTURE_DIR`).
- `.handoffs/` is git-ignored: prompts and reports there exist only on Elias's Mac. Anything a future session must know goes in this file or `AGENTS.md`.
