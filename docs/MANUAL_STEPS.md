# Manual steps (only things Claude can't do)

Claude keeps working with mocks and stubs until these are done. **This is the interim list from Phase 0.** At the end of Phase 1 it becomes the full, consolidated list (Supabase project, Sentry, Claude GitHub App, `pnpm setup:secrets`, go-live), as `STARTER_PROMPT.md` asks.

Status key: ⬜ todo · ✅ done

## Now (blocks local Supabase and opening PRs)

1. ⬜ **Install WSL2 + Docker Desktop.** This needs admin rights and one reboot. Open **PowerShell as Administrator** and paste:

   ```powershell
   wsl --install --no-distribution; winget install -e --id Docker.DockerDesktop --accept-source-agreements --accept-package-agreements
   ```

   Then **reboot**, start Docker Desktop once, and accept its terms. (Why: `supabase start` runs Postgres in Docker. It's needed for local dev, and for running e2e locally.)

2. ⬜ **Log in to the CLIs.** After the reboot, open a **new** terminal in the `petri` folder so the new PATH is loaded, then run these one at a time (each one opens a browser):

   ```powershell
   gh auth login --hostname github.com --git-protocol https --web
   vercel login
   npx -y supabase@latest login
   ```

   After that, Claude runs `vercel link` + Git connect, `supabase link` and the PR workflow for you.

3. ⬜ **Restart Claude Code** in the `petri` folder (`claude`) so its shell sees `gh`, `act` and `gitleaks`. Claude installed them with winget during Phase 0.

## Later (filled in at the end of Phase 1)

- Supabase project + keys → `.env.setup`
- Sentry DSN, org/project, auth token → `.env.setup`
- `/install-github-app`, `claude setup-token` → `CLAUDE_CODE_OAUTH_TOKEN` (+ `EVOLUTION_BOT_TOKEN` PAT if needed)
- `pnpm setup:secrets`, check GitHub settings, go live
