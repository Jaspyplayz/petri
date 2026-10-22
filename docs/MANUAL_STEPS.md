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

## To do

6. ⬜ **Claude in GitHub Actions + Vercel token.** In a terminal in the `petri` folder:

   ```powershell
   claude /install-github-app
   claude setup-token
   ```

   Paste the `setup-token` output as `CLAUDE_CODE_OAUTH_TOKEN` in `.env.setup`. Then create a token at vercel.com/account/tokens (name `petri-guardian`, scope: your account) and paste it as `VERCEL_TOKEN` (the guardian uses it for instant rollback).
   `EVOLUTION_BOT_TOKEN` stays blank for now. In Phase 6 Claude checks whether the App token can trigger CI on PRs it opens, and adds a step here only if it can't.

7. ⬜ **Reply "link and push".** Claude then runs, in this order:
   - `vercel link` (creates the Vercel project `petri`) and connects it to the GitHub repo, which fills `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` automatically
   - `supabase link --project-ref <ref>`
   - `pnpm setup:secrets --apply`, which pushes every `.env.setup` value to GitHub secrets/variables and Vercel env (values are never printed; the service-role key and salt go to Vercel *production* only, never to PR previews), generates `RATE_LIMIT_SALT`, and creates the repo variable `EVOLUTION_ENABLED=false`
   - Phase 6: branch protection on `main` (requires `ci-ok` + `evolution-verify`, up to date, no force pushes, 0 approvals) and "Allow auto-merge", via `gh api` / `gh repo edit --enable-auto-merge`. You only check them in Settings → Branches.

8. ⬜ **Go live (Phase 9, after everything above).** Open the Vercel production URL and check the three pages load, then run `pnpm evolution:resume` (or set the repo variable `EVOLUTION_ENABLED=true` in the GitHub app).

## Optional: fewer clicks while there's no CI

Until `ci.yml` exists (Phase 2), Claude opens one PR per phase and you merge it. To let Claude merge its own phase PRs before CI exists, add a permission rule for `gh pr merge` in Claude Code (`/permissions`). After Phase 2, branch protection and the required checks gate every merge instead.
