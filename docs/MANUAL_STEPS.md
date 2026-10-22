# Manual steps (only things Claude can't do)

This is the full, consolidated list from the end of Phase 1. Until it's done, Claude keeps working locally (local Supabase, Sentry as a no-op, workflows behind `workflow_dispatch`).

**You paste each value once, into one file.** `cp .env.setup.example .env.setup`, fill in what each step below asks for, then step 7 pushes everything to GitHub and Vercel. `.env.setup` is gitignored.

Status key: ⬜ todo · ✅ done

## Done

1. ✅ **WSL2 + Docker Desktop** installed (Docker 29.9.2, local Supabase runs).
2. ✅ **CLI logins:** `gh` (Jaspyplayz), `vercel` (jaspyplayz-5179), `supabase` (org "Jaspy's Team").
3. ✅ **Claude Code restarted** with the new PATH.

## To do

4. ⬜ **Supabase project: reply "create supabase".** Claude then runs `supabase projects create petri` in "Jaspy's Team" (us-east-1, Free plan), applies the migrations, and writes the project URL, anon key and service-role key into `.env.setup` for you. Two notes:
   - It would be the org's second project (`turnpoint` is the first). The Free plan allows 2 active projects.
   - **Check the spend cap is on:** supabase.com → your org → Billing → "Spend cap" enabled. On the Free plan there's nothing to pay, so this only matters if the org is ever upgraded.

5. ⬜ **Sentry (2 minutes).** On sentry.io create a Next.js project named `petri` (Developer plan is free). Then paste into `.env.setup`:
   - `NEXT_PUBLIC_SENTRY_DSN`: Project Settings → Client Keys (DSN)
   - `SENTRY_ORG` and `SENTRY_PROJECT`: the slugs from the URL `sentry.io/organizations/<org>/projects/<project>/`
   - `SENTRY_AUTH_TOKEN`: Settings → Auth Tokens → Create, scopes `project:read`, `event:read`, `project:releases`

   (Running `npx @sentry/wizard -i nextjs` is not needed; Sentry is already wired up and is a no-op until the DSN exists.)

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
   - `pnpm setup:secrets --apply`, which pushes every `.env.setup` value to GitHub secrets/variables and Vercel env (values are never printed), generates `RATE_LIMIT_SALT`, and creates the repo variable `EVOLUTION_ENABLED=false`
   - Phase 6: branch protection on `main` (requires `ci-ok` + `evolution-verify`, up to date, no force pushes, 0 approvals) and "Allow auto-merge", via `gh api` / `gh repo edit --enable-auto-merge`. You only check them in Settings → Branches.

8. ⬜ **Go live (Phase 9, after everything above).** Open the Vercel production URL and check the three pages load, then run `pnpm evolution:resume` (or set the repo variable `EVOLUTION_ENABLED=true` in the GitHub app).

## Optional: fewer clicks while there's no CI

Until `ci.yml` exists (Phase 2), Claude opens one PR per phase and you merge it. To let Claude merge its own phase PRs before CI exists, add a permission rule for `gh pr merge` in Claude Code (`/permissions`). After Phase 2, branch protection and the required checks gate every merge instead.
