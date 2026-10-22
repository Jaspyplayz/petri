# Manual steps (only things Claude can't do)

This is the full, consolidated list from the end of Phase 1. Until it's done, Claude keeps working locally (local Supabase, Sentry as a no-op, workflows behind `workflow_dispatch`).

**You paste each value once, into one file.** `cp .env.setup.example .env.setup`, fill in what each step below asks for, then step 7 pushes everything to GitHub and Vercel. `.env.setup` is gitignored.

Status key: ⬜ todo · ✅ done

## Done

1. ✅ **WSL2 + Docker Desktop** installed (Docker 29.9.2, local Supabase runs).
2. ✅ **CLI logins:** `gh` (Jaspyplayz), `vercel` (jaspyplayz-5179), `supabase` (org "Jaspy's Team").
3. ✅ **Claude Code restarted** with the new PATH.
4. ✅ **Supabase project** `petri` (ref `ejwwwasbkxqnyrjzlvll`, us-east-1, Free plan, so it can't be charged). Keys are in `.env.setup` and the 5 migrations are applied (2026-10-22). Future migrations go through `pnpm db:push:prod` until CI takes over.
5. ✅ **Sentry** project `petri` in org `jaspys-team` (free Developer plan). DSN, org, project and auth token are in `.env.setup`, and the token was verified with org, project, release and issue reads all returning 200 (2026-10-22).
6. ✅ **Claude GitHub App + Vercel token.** `/install-github-app` installed the app (workflows merged in PR #4) and stored `CLAUDE_CODE_OAUTH_TOKEN` directly as a repo secret, so `.env.setup` doesn't need it. Claude created the empty Vercel project `petri` in Jaspy's Team so the token could be limited to it. `VERCEL_TOKEN` (`petri-guardian`, Jaspy's Team, petri only, no expiry) is in `.env.setup`, and reading the project and its deployments returned 200 (2026-10-22).
7. ✅ **Link and push** (2026-10-22). The Vercel project `jaspy-s-team/petri` is linked and connected to `Jaspyplayz/petri` (Vercel GitHub app, this repo only). `pnpm setup:secrets --apply` pushed 22 values: GitHub has 7 secrets plus the variables `SENTRY_ORG`, `SENTRY_PROJECT` and `EVOLUTION_ENABLED=false`. Vercel has 14 env entries, and the service-role key and salt are production-only and hidden. Branch protection and auto-merge are configured by Claude in Phase 6, and then you only check Settings → Branches.

## To do

8. ⬜ **Go live (Phase 9, after everything above).** Open the Vercel production URL and check the three pages load, then run `pnpm evolution:resume` (or set the repo variable `EVOLUTION_ENABLED=true` in the GitHub app).

## Optional: fewer clicks while there's no CI

Until `ci.yml` exists (Phase 2), Claude opens one PR per phase and you merge it. To let Claude merge its own phase PRs before CI exists, add a permission rule for `gh pr merge` in Claude Code (`/permissions`). After Phase 2, branch protection and the required checks gate every merge instead.
