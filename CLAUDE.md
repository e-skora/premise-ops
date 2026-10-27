@AGENTS.md
@docs/STATUS.md

## How to work in this repo (Claude Code)
- Start every session by reading `docs/STATUS.md` (imported above) and `git status` / `git log -5`. Confirm the state to Elias in one to three plain sentences, then state the next step.
- End every session by updating `docs/STATUS.md`: where things stand, new dated decisions (quote Elias's words), lessons and mistakes, next step. Add a ship-log line to `docs/DEPLOYMENT.md` for every deploy.
- Write to Elias in plain language a child could follow. No em dashes anywhere (code comments, docs, commits, UI text).
- Work on short-lived branches named for their intent, small commits, one idea each. Never mix a move or rename with a behavior change.
- Never delete files, features, branches or data without Elias's explicit OK. Deploys are manual: `fly deploy --remote-only --ha=false`, only when the task says to deploy.
- Tests never touch the live setup: no writes to `./premise.db` or the checkout, no internet. Run `scripts/check-test-isolation.sh` after test changes.
- Never claim something works unless you ran it. Quote Elias's words for any approval; an approval you cannot quote did not happen.
- Never commit secrets, `.env` files, real personal data or `premise.db`.
