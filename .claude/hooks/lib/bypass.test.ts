import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { commandProblem, type CommandGuard } from "./commands";
import { fileProblem } from "./files";
import { isTrustedRoot, projectRoot, protectedRepoPath, secretTarget } from "./paths";

const caseInsensitive = process.platform === "win32";
const scratch = mkdtempSync(join(tmpdir(), "petri-hooks-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function fakeRepo(name: string): string {
  const root = join(scratch, name);
  mkdirSync(join(root, ".git"), { recursive: true });
  mkdirSync(join(root, ".github"), { recursive: true });
  copyFileSync(join(projectRoot, ".github/guardrails.json"), join(root, ".github/guardrails.json"));
  return root;
}

describe("protected paths can't be escaped", () => {
  it("ignores a planted .git marker that would make .github look like its own repo", () => {
    const root = fakeRepo("planted-marker");
    mkdirSync(join(root, ".github/.git"));
    expect(protectedRepoPath(join(root, ".github/workflows/ci.yml"), root, { projectRoot: root, caseInsensitive })).toBe(".github/workflows/ci.yml");
  });

  it("protects .git entries anywhere in the tree", () => {
    const guard = { projectRoot, caseInsensitive };
    expect(protectedRepoPath(join(projectRoot, ".github/.git"), projectRoot, guard)).toBe(".github/.git");
    expect(protectedRepoPath(join(projectRoot, "src/.git/config"), projectRoot, guard)).toBe("src/.git/config");
  });

  it("follows a directory link into a protected path", () => {
    const link = join(scratch, "github-link");
    symlinkSync(join(projectRoot, ".github"), link, "junction");
    expect(protectedRepoPath(join(link, "workflows/ci.yml"), scratch, { projectRoot, caseInsensitive })).toBe(".github/workflows/ci.yml");
  });

  it("follows a file link to a secret file, where the platform lets unprivileged users create one", () => {
    const secret = join(scratch, ".env.setup");
    writeFileSync(secret, "NOT_A_REAL_SECRET=1\n");
    const link = join(scratch, "notes.txt");
    let created = true;
    try {
      symlinkSync(secret, link, "file");
    } catch (error) {
      created = false;
      expect(process.platform).toBe("win32");
      expect(String(error)).toContain("EPERM");
    }
    expect(secretTarget("notes.txt", scratch, caseInsensitive)).toBe(created);
  });
});

describe("heredocs fed to an interpreter are checked", () => {
  const guard: CommandGuard = {
    evolutionHuman: false,
    protectedTarget: (path) => protectedRepoPath(path, projectRoot, { projectRoot, caseInsensitive }),
    secretPath: (path) => secretTarget(path, projectRoot, caseInsensitive),
  };

  it.each([
    ["bash <<'EOF'\ngit push --force\nEOF", "force pushes"],
    ["python3.12 - <<'EOF'\nimport os\nprint(os.environ)\nEOF", "print a secret"],
    ["nodejs -e \"require('child_process').execSync('git push --force')\"", "force pushes"],
    ["git apply <<'EOF'\n--- a/eslint.config.mjs\n+++ b/eslint.config.mjs\nEOF", "patch, git apply and git am are off"],
    ["patch -p1 < fix.patch", "patch, git apply and git am are off"],
    ["git diff main | git -C sub apply -R", "patch, git apply and git am are off"],
    ["git -C .github rm workflows/ci.yml", ".github/workflows/ci.yml is a protected path"],
    ["git -C ~/petri/.github rm workflows/ci.yml", ".github/workflows/ci.yml is a protected path"],
    ['git -C "$HOME/petri" rm .github/workflows/ci.yml', ".github/workflows/ci.yml is a protected path"],
    ['rm "$PWD/.github/workflows/ci.yml"', ".github/workflows/ci.yml is a protected path"],
    ["echo x > `pwd`/eslint.config.mjs", "eslint.config.mjs is a protected path"],
    ["echo x > $(pwd)/eslint.config.mjs", "eslint.config.mjs is a protected path"],
    ["echo $(git push --force)", "force pushes"],
    ["echo $(echo $(echo $(echo $(echo $(git push -f)))))", "force pushes"],
    ["cat `echo .env.setup`", "env and credential files"],
    ["git --git-dir .git push --force", "force pushes"],
    ["git --work-tree . --git-dir .git apply x.patch", "patch, git apply and git am are off"],
    ["git --git-dir status -c core.hooksPath=/dev/null commit -m x", "git hooks are guardrails"],
    ["git --config-env=core.hooksPath=EMPTY commit -m x", "git hooks are guardrails"],
    ["git -c alias.p=push p --force", "git aliases"],
    ["git config --global alias.p 'push --force'", "git aliases"],
    ["busybox patch -p1 < fix.patch", "patch, git apply and git am are off"],
    ["gpatch -p1 < fix.patch", "patch, git apply and git am are off"],
    ["sort --compress-prog=sh -c 'git push -f' x", "force pushes"],
    ["gh alias set p '!git push --force'", "force pushes"],
    ["rg --pre 'sh -c \"git push -f\"' pattern", "force pushes"],
    ["cat <<'EOF' | sh\nrm -rf /\nEOF", "recursive delete"],
    ["python3 - <<'EOF'\nimport os\nprint(os.environ)\nEOF", "print a secret"],
    ["mkdir -p .github/.git", ".github/.git is a protected path"],
  ])("%s", (command, reason) => {
    expect(commandProblem(command, guard)).toContain(reason);
  });

  it("still lets data heredocs and messages through", () => {
    expect(commandProblem("cat > notes.md <<'EOF'\nnever run git push --force\nEOF", guard)).toBeUndefined();
    expect(commandProblem("git commit -F - <<'EOF'\nfix: block rm -rf / and git push --force\nEOF", guard)).toBeUndefined();
    expect(commandProblem('gh pr comment 8 --body "blocks git push --force"', guard)).toBeUndefined();
    expect(commandProblem('git commit -m "$(cat msg.txt)" && echo "$(date)" > notes.md', guard)).toBeUndefined();
  });
});

describe("review findings stay closed", () => {
  const guard: CommandGuard = {
    evolutionHuman: false,
    protectedTarget: (path) => protectedRepoPath(path, projectRoot, { projectRoot, caseInsensitive }),
    secretPath: (path) => secretTarget(path, projectRoot, caseInsensitive),
  };

  it.each([
    ['echo $(echo ")") ; git push --force', "force pushes"],
    ["echo $(echo ')') ; git push --force", "force pushes"],
    ['echo "$(echo ")")" ; git push --force', "force pushes"],
    ["echo $(echo \\)) ; git push --force", "force pushes"],
    ["echo `echo \\`` ; git push --force", "force pushes"],
    ["echo $(echo x ; git push --force", "force pushes"],
    ["cat <<EOF\n$(git push --force)\nEOF", "force pushes"],
    ["cat <<EOF\n`rm -rf /`\nEOF", "recursive delete"],
    ["GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/dev/null git commit -m x", "GIT_CONFIG_* variables"],
    ["$env:GIT_CONFIG_PARAMETERS = \"'core.hookspath'='x'\"", "GIT_CONFIG_* variables"],
    ["git -c include.path=/tmp/evil.cfg commit -m x", "config includes"],
    ["git config --global includeIf.gitdir:~/x.path /tmp/evil.cfg", "config includes"],
    ["git commit --no-verif -m x", "git hooks are guardrails"],
    ["git push --mirr origin", "force pushes"],
    ["git push --forc origin main", "force pushes"],
    ["lefthook uninstall", "git hooks are guardrails"],
    ["pnpm exec lefthook uninstall", "git hooks are guardrails"],
    ["$GITHUB_TOKEN", "print a secret"],
    ["$env:GITHUB_TOKEN", "print a secret"],
    ['"$env:SUPABASE_SERVICE_ROLE_KEY"', "print a secret"],
    ["cat /proc/self/environ", "print a secret"],
    ["echo ${!name}", "print a secret"],
    ["python -c \"import os; print(os.getenv('GITHUB_TOKEN'))\"", "print a secret"],
    ["[Environment]::GetEnvironmentVariables()", "print a secret"],
    ['[Environment]::GetEnvironmentVariable("GITHUB_TOKEN")', "print a secret"],
    ["rm -rf /usr/..", "recursive delete"],
    ["cd / && rm -rf *", "recursive delete"],
    ["rm -rf .", "recursive delete"],
    ["rm -rf ../..", "recursive delete"],
    ["[Environment]::SetEnvironmentVariable('GIT_CONFIG_COUNT', 1)", "GIT_CONFIG_* variables"],
    ["${env:GIT_CONFIG_COUNT} = 1", "GIT_CONFIG_* variables"],
    ["HOME=/tmp/evil git commit -m x", "overriding HOME"],
    ["$env:USERPROFILE = 'C:\\evil'", "overriding HOME"],
    ["export XDG_CONFIG_HOME=/tmp/evil", "overriding HOME"],
    ["[Environment]::SetEnvironmentVariable('HOME', 'C:\\evil')", "overriding HOME"],
    ["${env:HOME} = 'C:\\evil'", "overriding HOME"],
    ["Set-Item -Path env:USERPROFILE -Value C:\\evil", "overriding HOME"],
    ["env HOME=/tmp/evil git commit -m x", "overriding HOME"],
    ["HOME+=/../../tmp/evil git commit -m x", "overriding HOME"],
    ["read -r HOME <<< /tmp/evil", "overriding HOME"],
    ["printf -v HOME /tmp/evil", "overriding HOME"],
    ["declare -n ref=HOME", "overriding HOME"],
    ["$env:HOME += '\\..\\evil'", "overriding HOME"],
    ["Set-Content -Path env:HOME -Value C:\\evil", "overriding HOME"],
    ["[Environment]::SetEnvironmentVariable($name, 'C:\\evil')", "overriding HOME"],
    ["node -e \"process.env.HOME='/tmp/evil'\"", "overriding HOME"],
    ["python3 -c \"import os; os.environ['HOME'] = '/tmp/evil'\"", "overriding HOME"],
    ["HOMEPATH=\\evil git commit -m x", "overriding HOME"],
    ["CLAUDE_CONFIG_DIR=/tmp/evil claude -p x", "overriding HOME"],
    ["for HOME in /tmp/evil; do git commit -m x; done", "overriding HOME"],
    ["foreach ($env:HOME in @('C:\\evil')) { git commit -m x }", "overriding HOME"],
    ["setx HOME C:\\evil", "overriding HOME"],
    ["Rename-Item -Path env:FOO -NewName HOME", "overriding HOME"],
    ["export $n=/tmp/evil", "overriding HOME"],
    ['declare "${x}ME=/tmp/evil"', "overriding HOME"],
    ['eval "$n=/tmp/evil"', "overriding HOME"],
    ['printf -v "$n" /tmp/evil', "overriding HOME"],
    ['read -r "$n" <<< /tmp/evil', "overriding HOME"],
    ["[Environment]::SetEnvironmentVariable('HO' + 'ME', 'C:\\evil')", "overriding HOME"],
    ["python3 -c \"import os; os.putenv(name, '/tmp/evil')\"", "overriding HOME"],
    ["python3 -c \"import subprocess; subprocess.run(['git', 'commit'], env={'HOME': '/tmp/evil'})\"", "overriding HOME"],
    ["python3 -c \"import os; os.environ.update(e)\"", "overriding HOME"],
    ["node -e \"process.env['HO' + 'ME'] = '/tmp/evil'\"", "overriding HOME"],
    ["node -e \"require('child_process').execSync('git commit', { env: e })\"", "overriding HOME"],
    ["git config remote.origin.push +refs/heads/main:refs/heads/main", "push refspecs"],
    ["git -c remote.origin.mirror=true push", "push refspecs"],
    ["git config core.fsmonitor ./watch.sh", "push refspecs"],
    ["git remote add --mirror=push backup https://example.com/x.git", "force pushes"],
    ["git config core.sshCommand 'sh -c x'", "git aliases"],
    ["git config --global core.pager 'sh -c x'", "git aliases"],
    ["git -c diff.external=./x.sh diff", "git aliases"],
    ["git config set --global credential.helper '!sh x'", "git aliases"],
    ["git config --add filter.x.clean ./x.sh", "git aliases"],
    ["git -c commit.gpgsign=false commit -m x", "git aliases"],
    ["node -e \"const env = {}; require('child_process').spawnSync('git', ['commit'], { env })\"", "overriding HOME"],
    ["python3 -c \"import os; os.execve('/usr/bin/git', ['git', 'commit'], e)\"", "overriding HOME"],
    ["git config color.diff.x '!sh -c x' && git config --rename-section color.diff alias", "git aliases"],
    ["git config rename-section color.diff alias", "git aliases"],
    ["git config alias.x '-c core.hooksPath=/dev/null commit'", "git aliases"],
    ["python3 -c \"import subprocess; subprocess.run(['git', 'commit'], **{'env': e})\"", "overriding HOME"],
    ["node -e \"const o = {}; o.env = e; require('child_process').spawnSync('git', ['commit'], o)\"", "overriding HOME"],
    ["node -e \"require('child_process').spawnSync('g' + 'it', ['push', '-' + 'f'])\"", "starts other programs"],
    ["python3 -c \"import os; os.system('g' + 'it push -f')\"", "starts other programs"],
    ["python3 - <<'EOF'\nimport subprocess\nsubprocess.run(['ls'])\nEOF", "starts other programs"],
    ["git config --rename-sec color.diff alias", "git aliases"],
    ["git config -ze", "git aliases"],
    ["git config --frobnicate color.x y", "git aliases"],
    ["timeout 5 python3 -c \"import os; os.system('g' + 'it push -f')\"", "starts other programs"],
    ["echo \"import os; os.system('x')\" | python3", "starts other programs"],
    ["pnpm exec tsx -e \"require('child_process').execSync('x')\"", "starts other programs"],
    ["g=git; $g push -f", "can't see which program"],
    ["$(echo git) push -f", "can't see which program"],
    ["& ('g' + 'it') push -f", "can't see which program"],
    ["iex $cmd", "can't see which program"],
    ['eval "$cmd"', "can't see which program"],
    ['"$g" push -f', "can't see which program"],
    ["$g -c 'x'", "can't see which program"],
    ['bash -c \'"$g" push -f\'', "can't see which program"],
    ['eval "$(ssh-agent -s)"', "can't see which program"],
    ['source "$script"', "can't see which program"],
    ["python3<<'EOF'\nimport subprocess\nsubprocess.run(['ls'])\nEOF", "starts other programs"],
    ["node<script.js -e \"require('child_process')\"", "starts other programs"],
  ])("%s", (command, reason) => {
    expect(commandProblem(command, guard)).toContain(reason);
  });

  it.each([
    "rm -rf node_modules/.cache dist",
    "cat <<'EOF'\n$(git push --force)\nEOF",
    "git push origin main --follow-tags",
    "git commit --amend --no-edit",
    'echo "$(date)" && git log --oneline -5',
    "pnpm exec lefthook install",
    'cd "$HOME/petri" && [ "$HOME" = "/root" ] || echo "$HOME"',
    'export PATH="$HOME/bin:$PATH" && printf "%s\\n" "$HOME"',
    "Get-ChildItem $env:USERPROFILE; cd ${env:HOME}",
    'while read -r line; do echo "$line"; done < notes.md',
    'export PATH="$HOME/bin:$PATH"; local x="$1" y=$2',
    'read -r sha <<< "$HOME" && source ./scripts/env.sh',
    "node -e \"console.log(process.env.NODE_ENV)\"",
    "python3 -c \"import json; print(json.dumps({'a': 1}))\"",
    'grep -rn "child_process" scripts && git log --oneline -3',
    "git remote add upstream https://github.com/example/petri.git && git config user.name Jasper",
    "git config user.email && git config --get remote.origin.url && git config get core.editor",
    "git config --global user.name 'Jasper' && git -c core.quotepath=off status",
    "git config --glo user.email jasper@example.com && git config -l && git config --get-regexp '^color'",
    "pnpm exec tsx scripts/new-feature.ts sparkles",
    'cd "$(git rev-parse --show-toplevel)" && ls',
    'git commit -m "$msg" && watch -n 5 "$HOME/bin/status"',
    "sed -i '/^old$/d; s/a$/b/' notes.md",
  ])("allows %s", (command) => {
    expect(commandProblem(command, guard)).toBeUndefined();
  });

  it.each([
    "$c = Get-Content notes.md; $c -replace 'a', 'b' | Set-Content out.md; $n += 1; $x.Trim()",
    "$files = Get-ChildItem src; $files | Select-Object -First 3",
    "$x.Count; $s -replace 'a', 'b'; $env:PATH",
  ])("allows PowerShell value statements in the PowerShell tool: %s", (command) => {
    expect(commandProblem(command, { ...guard, powershell: true })).toBeUndefined();
  });

  it.each([
    "x=$(cat cmd.txt); $x",
    "$files = Get-ChildItem src",
    'bash -c "$x"',
    "sh -c '$x' && zsh -c \"`cat cmd`\"",
    'sh -c "true; $x"',
    "find . -exec sh -c 'true; $0' {} \\;",
    'timeout 5 bash -c "cd app && $x"',
    "cmd /c %x%",
    'watch -n 5 "date; $x"',
  ])(
    "treats a variable in the program position as dynamic in bash: %s",
    (command) => {
      expect(commandProblem(command, guard)).toContain("can't see which program");
    },
  );

  it("protects Claude Code settings outside the repo", () => {
    const paths = { projectRoot, caseInsensitive };
    expect(protectedRepoPath(join(homedir(), ".claude", "settings.json"), projectRoot, paths)).toContain(".claude/settings.json");
    expect(protectedRepoPath(join(homedir(), ".claude", "CLAUDE.md"), projectRoot, paths)).toContain(".claude/CLAUDE.md");
    expect(protectedRepoPath(join(homedir(), ".gitconfig"), projectRoot, paths)).toContain(".gitconfig");
    expect(protectedRepoPath(join(homedir(), ".config", "git", "config"), projectRoot, paths)).toContain(".config/git/config");
    expect(protectedRepoPath(join(homedir(), "notes.md"), projectRoot, paths)).toBeUndefined();
  });

  it.each([".env*", "*", "**/*", "{*.ts,.env.local}", ".en[v]*", "id_*", "{.e,x}nv*", ".e\\nv*", "{a,{b,.env}}", ".env.st*", "secrets/**", "{unbalanced", "*/*/*/*/.env*", "a/*/b/*/c/.env.local"])("blocks Grep with glob %s", (glob) => {
    const fileGuard = { evolutionHuman: false, protectedTarget: () => undefined, secretPath: () => false };
    expect(fileProblem({ toolName: "Grep", toolInput: { pattern: "KEY", path: projectRoot, glob } }, fileGuard)).toContain("secrets");
  });

  it("allows Grep with an ordinary glob", () => {
    const fileGuard = { evolutionHuman: false, protectedTarget: () => undefined, secretPath: () => false };
    for (const glob of ["*.{ts,tsx}", "src/**/*.test.ts", "!*.md"]) {
      expect(fileProblem({ toolName: "Grep", toolInput: { pattern: "x", path: projectRoot, glob } }, fileGuard)).toBeUndefined();
    }
  });
});

describe("check-file only runs this repo's tools", () => {
  it("trusts this checkout and its worktrees, nothing else", () => {
    const worktree = join(scratch, "worktree");
    mkdirSync(worktree);
    writeFileSync(join(worktree, ".git"), `gitdir: ${join(projectRoot, ".git/worktrees/feature")}\n`);
    const foreign = join(scratch, "foreign");
    mkdirSync(foreign);
    writeFileSync(join(foreign, ".git"), `gitdir: ${join(scratch, "elsewhere/.git/worktrees/x")}\n`);
    expect(isTrustedRoot(projectRoot, projectRoot)).toBe(true);
    expect(isTrustedRoot(worktree, projectRoot)).toBe(true);
    expect(isTrustedRoot(foreign, projectRoot)).toBe(false);
    expect(isTrustedRoot(fakeRepo("untrusted"), projectRoot)).toBe(false);
  });

  it("skips src files in another repository instead of running its lint config", () => {
    const root = fakeRepo("foreign-src");
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src/x.ts"), "export const x: any = 1;\n");
    const result = spawnSync(process.execPath, [join(projectRoot, ".claude/hooks/check-file.ts")], {
      input: JSON.stringify({ tool_name: "Write", cwd: root, tool_input: { file_path: join(root, "src/x.ts") } }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
  });
});
