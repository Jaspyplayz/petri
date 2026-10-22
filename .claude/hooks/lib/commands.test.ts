import { describe, expect, it } from "vitest";
import { commandProblem, type CommandGuard } from "./commands";
import { projectRoot, protectedRepoPath } from "./paths";

const pathGuard = { projectRoot, caseInsensitive: process.platform === "win32" };
const agent: CommandGuard = {
  evolutionHuman: false,
  protectedTarget: (path) => protectedRepoPath(path, projectRoot, pathGuard),
};
const human: CommandGuard = { ...agent, evolutionHuman: true };

const heredocCommit = "git commit -q -F - <<'EOF'\nci: block git push --force and rm -rf /\necho $GITHUB_TOKEN\nEOF";
const heredocBody = "gh pr create --title x --body \"$(cat <<'EOF'\nBlocks git push --force\nEOF\n)\"";

describe("commandProblem blocks", () => {
  it.each([
    ["git push --force", "force pushes"],
    ["git push -f origin main", "force pushes"],
    ["git push origin +main", "force pushes"],
    ["git push --force-with-lease origin x", "force pushes"],
    ["git -C ../other push -uf origin x", "force pushes"],
    ["git push --mirror", "force pushes"],
    ["cd sub && git push --force", "force pushes"],
    ['bash -c "git push --force"', "force pushes"],
    ["echo $(git push -f)", "force pushes"],
    ["git commit --no-verify -m x", "git hooks are guardrails"],
    ["git commit -nm x", "git hooks are guardrails"],
    ["git push --no-verify", "git hooks are guardrails"],
    ["LEFTHOOK=0 git commit -m x", "git hooks are guardrails"],
    ["git -c core.hooksPath=/dev/null commit -m x", "git hooks are guardrails"],
    ["git config core.hooksPath .nohooks", "git hooks are guardrails"],
    ["rm -rf /", "recursive delete"],
    ["rm -rf /*", "recursive delete"],
    ["rm -fr ~", "recursive delete"],
    ['rm -r -f "$HOME"', "recursive delete"],
    ["rm -rf ${HOME}/", "recursive delete"],
    ["sudo rm -rf --no-preserve-root /", "recursive delete"],
    ["rm -rf /usr", "recursive delete"],
    ["rm -rf C:\\\\", "recursive delete"],
    ["rm -rf /c/Users", "recursive delete"],
    ["Remove-Item -Recurse -Force C:\\", "recursive delete"],
    ["echo $GITHUB_TOKEN", "print a secret"],
    ['echo "key: ${SUPABASE_SERVICE_ROLE_KEY}"', "print a secret"],
    ["printf '%s\\n' \"$CLAUDE_CODE_OAUTH_TOKEN\"", "print a secret"],
    ["printenv", "print a secret"],
    ["printenv GITHUB_TOKEN", "print a secret"],
    ["env", "print a secret"],
    ["env | grep KEY", "print a secret"],
    ["set", "print a secret"],
    ["export -p", "print a secret"],
    ["declare -x", "print a secret"],
    ["Write-Output $env:GITHUB_TOKEN", "print a secret"],
    ["Get-ChildItem env:", "print a secret"],
    ["gh auth token", "print a secret"],
    ["gh auth status -t", "print a secret"],
    ["pnpm exec supabase status", "print a secret"],
    ["npx supabase status -o env", "print a secret"],
    ["node -p process.env", "print a secret"],
    ['node -e "console.log(process.env.SUPABASE_SERVICE_ROLE_KEY)"', "print a secret"],
    ['python -c "import os; print(os.environ)"', "print a secret"],
    ["git credential fill", "print a secret"],
    ["cat .env.setup", "env and credential files"],
    ["source .env.local", "env and credential files"],
    ["grep KEY < ./.env.setup", "env and credential files"],
    ["cp .env.example .env", "env and credential files"],
    ["cat ~/.git-credentials", "env and credential files"],
    ["EVOLUTION_HUMAN=1 claude", "EVOLUTION_HUMAN"],
    ["echo '{\"env\":{\"EVOLUTION_HUMAN\":\"1\"}}' > .claude/settings.local.json", "EVOLUTION_HUMAN"],
    ["echo x > eslint.config.mjs", "eslint.config.mjs is a protected path"],
    ["sed -i 's/error/off/' eslint.config.mjs", "eslint.config.mjs is a protected path"],
    ["perl -pi -e 's/80/0/' vitest.config.ts", "vitest.config.ts is a protected path"],
    ["rm .github/workflows/ci.yml", ".github/workflows/ci.yml is a protected path"],
    ["cp /tmp/x tsconfig.json", "tsconfig.json is a protected path"],
    ["echo jobs: | tee -a lefthook.yml", "lefthook.yml is a protected path"],
    ["git rm scripts/check-features.ts", "scripts/check-features.ts is a protected path"],
    ["mv src/shared/env.ts src/shared/env-old.ts", "src/shared/env.ts is a protected path"],
    ["cat > .git/hooks/pre-commit", ".git/hooks/pre-commit is a protected path"],
    ["Set-Content -Path vitest.config.ts -Value x", "vitest.config.ts is a protected path"],
  ])("%s", (command, reason) => {
    expect(commandProblem(command, agent)).toContain(reason);
  });
});

describe("commandProblem allows", () => {
  it.each([
    "git push",
    "git push -u origin chore/phase-2-guardrails",
    "git push origin feature-f",
    'git commit -m "block git push --force"',
    heredocCommit,
    heredocBody,
    "git log --format=%H -n 5",
    "rm -rf node_modules .next",
    "rm -rf /tmp/petri-scratch",
    'echo "$PATH"',
    "echo '$GITHUB_TOKEN'",
    '[ -n "$GITHUB_TOKEN" ] && echo set',
    "env FOO=1 pnpm test",
    "set -euo pipefail",
    "export FOO=bar",
    "pnpm env:local",
    "cat .env.example .env.setup.example",
    "pnpm setup:secrets --dry-run",
    "cat eslint.config.mjs",
    "git diff eslint.config.mjs",
    "echo x > /tmp/out.txt",
    "node scripts/check-protected-paths.ts > /dev/null 2>&1",
    "gh auth status",
    "pnpm db:start -x realtime,studio",
    'curl -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/user',
  ])("%s", (command) => {
    expect(commandProblem(command, agent)).toBeUndefined();
  });

  it("lets a human (EVOLUTION_HUMAN=1) write protected paths, but nothing else changes", () => {
    expect(commandProblem("echo x > eslint.config.mjs", human)).toBeUndefined();
    expect(commandProblem("git push --force", human)).toContain("force pushes");
    expect(commandProblem("cat .env.setup", human)).toContain("env and credential files");
  });
});
