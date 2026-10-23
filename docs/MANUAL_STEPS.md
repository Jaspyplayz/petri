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

8. ✅ **Finish Phase 2** (2026-10-22). PR #8 is merged, and the review fixes went in from an `EVOLUTION_HUMAN=1` session as #17, #18 and #19.

## To do

9. ⬜ **Keep running the setup phases (3–9) in an `EVOLUTION_HUMAN=1` session.** Most of them write protected files (`scripts/`, `.claude/`, `package.json`, workflows, `CLAUDE.md`), which the hooks block in a normal session. Start Claude Code with `$env:EVOLUTION_HUMAN = "1"; claude --continue` in PowerShell, or `EVOLUTION_HUMAN=1 claude --continue` in bash. The evolution agents never run with it, and CI still fails agent PRs that touch protected paths. Start Claude normally again after the Phase 9 handoff.
10. ✅ **Create `EVOLUTION_BOT_TOKEN` (Phase 6; the loop needs it before the dry run).** Done 2026-10-23 (repo secret added at 18:14 UTC; it expires after 90 days, so make a new one before then). Issues, branches and PRs made with the default `GITHUB_TOKEN` don't start other workflows, and claude-code-action revokes its own app token when it finishes. So the loop's scripts use a token of yours.
    1. Go to GitHub → Settings → Developer settings → Fine-grained personal access tokens → Generate new token.
    2. Name it `petri-evolution-bot`. Resource owner: Jaspyplayz. Repository access: **only `Jaspyplayz/petri`**. Expiration: 90 days or more.
    3. Repository permissions: **Contents: Read and write**, **Issues: Read and write**, **Pull requests: Read and write** (Metadata: Read is added for you). Leave everything else, including Workflows, at No access.
    4. Copy the token. In the repo, go to Settings → Secrets and variables → Actions → New repository secret. Name it `EVOLUTION_BOT_TOKEN` and paste the token.
    5. Tell Claude it's done. Don't paste the token in the chat.
11. ✅ **Loop labels.** Created by hand on 2026-10-23, after the first dry-run triage failed on a missing label. For a fresh repo, Claude runs `pnpm setup:labels --apply` (it needs only a `gh` login). It creates or updates every label the loop and the guardrails use, and it's safe to rerun.
12. ⬜ **Go live (Phase 9, after everything above).** Open the Vercel production URL and check the three pages load, then run `pnpm evolution:resume` (or set the repo variable `EVOLUTION_ENABLED=true` in the GitHub app).

## Good to know (Phase 2 guardrails)

- **Merging phase PRs.** Branch protection on `main` (since 2026-10-23) requires `ci-ok`, `guardrails-ok` and `evolution-verify` from GitHub Actions, for admins too, and squash is the only merge method. You can check it under Settings → Branches. Claude merges phase PRs once you OK a batch.
- **Editing guardrails with Claude.** Claude Code hooks stop agents from editing protected paths (the list is in `.github/guardrails.json`). To have Claude change them for you, start Claude Code with `EVOLUTION_HUMAN=1` in its environment: `EVOLUTION_HUMAN=1 claude` in bash, or `$env:EVOLUTION_HUMAN = "1"; claude` in PowerShell. Agents can't set this themselves, because the hooks block any command that names it. Your own PRs are never blocked by `protected-paths`. Only agent PRs are (label `evolution`, a bot author or an `evo/` branch).
- **Approving an agent PR that touches guardrails or is over 400 lines.** Add the label `protected-ok` or `size-ok` yourself. It only counts when you add it after the latest push, so if new commits arrive, remove the label and add it again. To let other people approve too, set the repo variable `HUMAN_MAINTAINERS` (comma-separated GitHub logins). It defaults to the repo owner.
- **Pre-commit hook.** `pnpm install` installs lefthook, which runs gitleaks, typecheck and lint on every commit. gitleaks must be on your PATH: `winget install Gitleaks.Gitleaks` or `brew install gitleaks`.
