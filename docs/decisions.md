# Decisions

One line per decision, newest at the bottom. Format: `YYYY-MM-DD · phase · decision — why`.

- 2026-10-22 · P0 · Use pnpm 12.15.0 (installed globally via `npm i -g`, since corepack needs admin rights on this machine). It will be pinned with `packageManager` in `package.json` in P1 — that's reproducible for CI and needs no admin.
- 2026-10-22 · P0 · Run the Supabase CLI as a project devDependency (`pnpm supabase …`) instead of installing it globally — Supabase supports this officially, there's no official winget package, and it pins the version for CI.
- 2026-10-22 · P0 · Install gh, act and gitleaks with `winget --scope user` — no admin rights are needed.
- 2026-10-22 · P0 · Docker Desktop (and WSL2) is a manual step — it needs admin rights and a reboot. Until then, local Supabase (`supabase start`) can't run, so P1 work that needs a DB is done against a mock/stub layer behind `shared/supabase`, and real DB checks are deferred to CI (Linux runners have Docker).
- 2026-10-22 · P0 · Skip the npm install scripts for global `pnpm`/`vercel` (left npm's `allow-scripts` default on) — both CLIs work without them, and keeping the default is safer.
- 2026-10-22 · P0 · Install Playwright Chromium headless shell now (1.64.1). The version is pinned in P1 by the `@playwright/test` devDependency, and `pnpm exec playwright install chromium` re-syncs it.
- 2026-10-22 · P0 · Do each phase on its own branch (`chore/phase-N-…`). Until `gh auth login` is done, branches stay local and get merged locally; once gh works, open PRs.
- 2026-10-22 · P0 · Anon reads use column-level `GRANT SELECT (cols…)` plus RLS row policies, so hashed IPs (`author_hash`, `voter_hash`) are never readable with the anon key.
- 2026-10-22 · P0 · Keep `vote_count`/`report_count` denormalized on `feedback` and maintain them with triggers — sorting by votes stays cheap, and anon never needs access to `votes`.
- 2026-10-22 · P0 · Per-IP rate limits: 5 posts, 30 votes and 10 reports per rolling hour, stored in `rate_limit_hits` keyed by `sha256(ip + RATE_LIMIT_SALT)` — the post and vote limits come from the prompt, the report limit is my own choice.
- 2026-10-22 · P0 · Add a `featuremap` job to `ci.yml` (P4 requires it) next to the 10 jobs P2 lists; `ci-ok` will depend on all of them.
- 2026-10-22 · P0 · Combine the weekly trust report and the `agent_runs` cost summary into one `evolution-weekly.yml` — both are weekly reporting crons (they report only; the gate enforces the budget).
- 2026-10-22 · P0 · `evolution-verify` runs on every PR and reports success when it skips (non-evolution PR or loop disabled) — it's a required check, so a conditional run would block human PRs forever.
- 2026-10-22 · P0 · The guardian puts the revert, `PAUSED` (`until` +24h) and trust −1 in one PR; `check-protected-paths` allows trust-lowering-only diffs — fewer PRs to race, and agents still can't raise their own trust.
- 2026-10-22 · P0 · Every write that has to trigger another workflow (issues, labels, PRs, auto-merge) uses the bot/App token — events made with `GITHUB_TOKEN` don't trigger workflows.
- 2026-10-22 · P0 · The over-budget pause lives in the shared gate step, and `evolution-weekly` only reports — that matches prompt §Phase 8.
- 2026-10-22 · P0 · Use the claude.ai Supabase/Vercel/Sentry MCP connectors in this session when they're useful, and the CLIs in CI — the prompt says to prefer MCP when available, and CI can't use it.
