# Premise: current status and decisions

Read this at the start of every session. Update it at the end of every session (state, decisions, lessons, next step). Dated decision lines are never edited; a later line supersedes an earlier one.

## Where things stand (2026-10-27)
- `main` at the commit that updated this file, after PR #5 (merged as ce07807). Live site: https://premise-ops.com on Fly release v8, deployed by hand from ce07807 (see the ship log in `docs/DEPLOYMENT.md`).
- Done: Step 1 make it safe (PR #1), Step 2 cut it down (PR #1), Step 3 make it honest (PR #2), Step 4 README and license (PR #3), CI for other repos (PR #4), Compile Decision code location fix (PR #5).
- Compile Decision no longer makes up file paths: it starts empty, a decision with no path shows "No code location set", and a path that is not a real file is refused with "File not found".
- CI for other repos now works, proven on a scratch repo (broken price: `check` exit 1; holding price: exit 0; feed down or no probe: exit 1 "No data") and on GitHub by the `user-repo-check` job against `examples/user-repo`. The README has a copy-paste workflow. Its two `actions/checkout` steps have not yet been run from another repo on GitHub.
- Branches: `main`, plus the merged `docs/readme-license`, `ci/other-repos`, `fix/compile-code-location` and `docs/log-v8` (kept on GitHub and locally until Elias says to delete them). Tests: 124 pass. `scripts/check-test-isolation.sh` passes.
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
- 2026-10-27: CI must work for other people's repos before going public: "Yes, make CI work for other repos before going public. Fix the gaps you found."
- 2026-10-27: "Demo decisions only go into the demo database, not into a user's own repo check."
- 2026-10-27: "A decision with no data shows \"No data\", never HEALTHY, and check says so instead of passing quietly."
- 2026-10-27: Compile Decision: "The dialog starts with no file path filled in." "If a document names no code location, the new decision shows \"No code location set\", never a made-up path." "If a path is given, check that the file really exists. If it doesn't, say so instead of saving it."

## Next steps (in order)
1. **Step 5: go public.** Needs Elias's decision first: keep the name "Premise" or rename. "Premise" is also used by Premise Data (premise.com), a funded data company, so there is trademark and search-noise risk. Then flip the GitHub repo to public and post a Show HN built around "the half-life of an assumption".

## Open items
- OpenAI extraction (`gpt-6-luna`) has only been tested with a mocked response; no OpenAI key was available. Anthropic (`claude-haiku-5-5`) was tested with one real call.
- When the real OpenRouter price changes, the live site flips but CI keeps the saved copy. Refresh `examples/fixtures/live-feeds` and the `--expect-broken` list together.
- The CLI `check` summary shows "Drag: $56,150/mo", which looks too high for the seeded spend. Not investigated.
- `check --reset` does not clear saved connectors (`ConnectorSetting` table). Clear them separately when wiping local data.
- `WEB_SCRAPE_EXTRACT` has no scraper (it reads the last stored value). The README says so.
- The Compile Decision sample documents still name made-up files in their blast radius text (for example `services/audio-batcher/cuda-worker.py`). That is the sample's own wording, not a saved code location, so it was left alone.
- After going public, run the README's copy-paste workflow once from a real second repo to prove the two `actions/checkout` steps.

## Lessons (so they are not relearned)
- Claude Code reads `CLAUDE.md`, not `AGENTS.md` (verified in the Claude Code memory docs, https://code.claude.com/docs/en/memory). Until 2026-10-27 this repo had no `CLAUDE.md`, so Code panel sessions did not auto-load `AGENTS.md`. `CLAUDE.md` now imports `AGENTS.md` and this file.
- The original Gemini build looked complete but faked most data: invented current values (threshold x 0.84), invented code paths, fake PR numbers, probes pointed at its own fake feed. Always test on a fresh document, not the seed data, before trusting a feature.
- The old tests wrote to the real `premise.db`, patched real files in the checkout, and left 4 empty commits on a stray branch. Tests now run in a temp folder; `scripts/check-test-isolation.sh` proves the checkout is untouched.
- The public site had no login: anyone could change the shared demo, make the server fetch any URL, and apply patches. Fixed with public demo mode (per-visitor sandboxes, outside fetches blocked except one allowlisted URL).
- After Step 3, CI would have depended on a live website's price. Fixed with saved feed copies (`PREMISE_FEED_FIXTURE_DIR`).
- A feature that works on the demo data can still fail on a fresh repo. Step 4's CI example looked fine in this repo's own CI but did nothing useful on a scratch repo. Test docs examples from outside the repo before writing them down.
- The app needs Node.js 22 or newer as well as Bun: `bun run dev` starts Next.js under Node, and the database uses Node's built-in SQLite.
- A status that has no data must say so. "HEALTHY" for a decision with no values made a passing check mean nothing. Fixed with `NO_DATA`.
- `PREMISE_WORKSPACE_ROOT` must be an absolute path for the locus inspector to find files (a relative root showed "UNMOUNTED LOCUS"). The CI job uses `${{ github.workspace }}/...`.
- An empty value can hide a made-up one. The code viewer turned an empty path into the semantic-cache demo file, so a decision with no path showed real code that had nothing to do with it. Check what a screen shows when a field is empty, not only when it is filled.
- `.handoffs/` is git-ignored: prompts and reports there exist only on Elias's Mac. Anything a future session must know goes in this file or `AGENTS.md`.
