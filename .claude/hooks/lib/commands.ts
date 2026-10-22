import { basename, posix } from "node:path";
import { parseShell, type Segment, type Word } from "./shell.ts";

export type CommandGuard = {
  readonly evolutionHuman: boolean;
  readonly protectedTarget: (path: string) => string | undefined;
  readonly secretPath: (path: string) => boolean;
};

const assignment = /^[A-Za-z_][A-Za-z0-9_]*=/;
const wrappers = new Set(["sudo", "doas", "command", "builtin", "exec", "nohup", "nice", "time", "xargs", "busybox", "!", "{", "}", "if", "then", "elif", "else", "while", "until", "do"]);
const dataSinks = new Set([
  ...["cat", "tee", "echo", "printf", "print", "write-output", "write-host", "grep", "egrep", "fgrep", "rg", "wc", "head", "tail"],
  ...["uniq", "less", "more", "jq", "diff", "read", "gh", "gitleaks", "test", "[", "[["],
]);
const gitDataSubcommands = new Set(["commit", "tag", "notes", "hash-object", "log", "show", "grep", "diff", "status"]);
const gitValueOptions = new Set(["-C", "-c", "--config-env", "--git-dir", "--work-tree", "--namespace", "--super-prefix", "--attr-source"]);
const patchPrograms = new Set(["patch", "gpatch"]);
const forceOptions = ["--force", "--force-with-lease", "--force-if-includes", "--mirror"];
const gitIndirection = /^(alias|include|includeif)\./i;
const configHomes = "(HOME|HOMEDRIVE|HOMEPATH|USERPROFILE|XDG_CONFIG_HOME|CLAUDE_CONFIG_DIR)";
const configHomeOverrides = [
  new RegExp(`(^|[^\\w$])${configHomes}['"\\]}]*\\s*[-+.?*/|&]*=(?!=)`, "i"),
  new RegExp(`\\b(read|printf|declare|typeset|local|export|readonly|mapfile|readarray|getopts)\\b[^;&|\\n]*?[\\s'"=]${configHomes}(?!\\w)`, "i"),
  new RegExp(`(SetEnvironmentVariable|putenv|setenv)\\s*\\(\\s*(?!["']\\w)|(SetEnvironmentVariable|putenv|setenv)\\s*\\(\\s*["']${configHomes}["']`, "i"),
  new RegExp(`(^|[^\\w$\\{])env:\\\\?${configHomes}(?!\\w)`, "i"),
];
const unresolvedPath = /[$`%]|^~/;
const printers = new Set(["echo", "printf", "print", "cat", "write-output", "write-host", "write-information", "out-host"]);
const envDrivers = new Set(["get-childitem", "gci", "ls", "dir", "get-item", "gi", "get-content", "gc", "cat", "type"]);
const removers = new Set(["rm", "unlink", "truncate", "remove-item", "ri", "del", "erase", "rd", "rmdir", "clear-content", "set-content", "add-content", "out-file", "new-item", "tee"]);
const copiers = new Set(["cp", "install", "rsync", "copy-item", "cpi"]);
const movers = new Set(["mv", "move-item", "mi", "ln", "mkdir", "touch", "new-item", "ni", "md"]);
const inPlaceEditors = new Set(["sed", "perl"]);
const secretName = /(SECRET|TOKEN|PASSWORD|PASSWD|PASSPHRASE|PRIVATE|CREDENTIAL|SALT|COOKIE|SESSION|APIKEY|(^|_)O?AUTH($|_)|(^|_)KEYS?($|_))/i;
const variableReference = /\$\{?(?:env:)?([A-Za-z_][A-Za-z0-9_]*)|%([A-Za-z_][A-Za-z0-9_]*)%/gi;
const maxNesting = 3;

const messages = {
  forcePush: "Blocked: force pushes (-f, --force, --force-with-lease, --mirror, +refspec) rewrite shared history. Push a new commit instead.",
  skipHooks: "Blocked: git hooks are guardrails. Don't skip them (--no-verify, commit -n, LEFTHOOK=0, core.hooksPath); fix what the hook reports.",
  removeRoot: "Blocked: recursive delete of a filesystem root, a home directory or a whole working directory (*, ., ..). Name the folder you mean.",
  printSecret: "Blocked: this would print a secret or the whole environment. Check that a variable is set with [ -n \"$NAME\" ] instead of printing it.",
  secretFile: "Blocked: env and credential files hold secrets and stay unread. Scripts such as `pnpm setup:secrets` and `pnpm env:local` read them for you.",
  evolutionHuman: "Blocked: EVOLUTION_HUMAN is set by a human when they start Claude Code, never by a command.",
  patchTool: "Blocked: patch, git apply and git am are off for agents, because the guard can't reliably tell which files a patch writes. Use the Edit/Write tools; a human can run them with EVOLUTION_HUMAN=1.",
  gitAlias: "Blocked: git aliases, config includes and GIT_CONFIG_* variables change what a git command runs, so agents don't set them. Spell out the git command instead.",
  configHome: "Blocked: overriding HOME (or HOMEDRIVE/HOMEPATH), USERPROFILE, XDG_CONFIG_HOME or CLAUDE_CONFIG_DIR points git and other tools at a different config. Leave them as they are.",
  protectedWrite: (path: string) =>
    `Blocked: ${path} is a protected path (.github/guardrails.json, or a Claude Code settings file). Agents can't change their own guardrails; a human can by starting Claude Code with EVOLUTION_HUMAN=1.`,
};

function programName(word: string): string {
  return basename(word.replaceAll("\\", "/").replace(/^!/, "")).toLowerCase().replace(/\.exe$/, "");
}

function commandWords(segment: Segment): Word[] {
  const words = segment.words;
  let index = 0;
  while (index < words.length) {
    const word = words[index]?.text ?? "";
    const name = programName(word);
    if (assignment.test(word)) {
      index += 1;
    } else if (wrappers.has(name)) {
      index += 1;
      while (words[index]?.text.startsWith("-")) index += 1;
    } else if (name === "env") {
      index += 1;
      while (words[index]?.text.startsWith("-") || assignment.test(words[index]?.text ?? "")) index += 1;
      if (index >= words.length) return [{ text: "env", expandable: "env" }];
    } else {
      break;
    }
  }
  return words.slice(index);
}

function options(words: readonly Word[]): string[] {
  return words.filter((word) => word.text.startsWith("-")).map((word) => word.text);
}

function operands(words: readonly Word[]): string[] {
  return words.filter((word) => !word.text.startsWith("-")).map((word) => word.text);
}

type GitInvocation = {
  readonly subcommand: string;
  readonly rest: readonly Word[];
  readonly config: readonly string[];
  readonly directory: string;
};

function gitInvocation(words: readonly Word[]): GitInvocation | undefined {
  const config: string[] = [];
  let directory = "";
  let index = 1;
  while (index < words.length) {
    const word = words[index]?.text ?? "";
    if (gitValueOptions.has(word)) {
      const value = words[index + 1]?.text ?? "";
      if (word === "-c" || word === "--config-env") config.push(value);
      if (word === "-C") directory = directory === "" || /^([A-Za-z]:)?[\\/]/.test(value) ? value : `${directory}/${value}`;
      index += 2;
    } else if (word.startsWith("-")) {
      if (word.startsWith("--config-env=")) config.push(word.slice("--config-env=".length));
      index += 1;
    } else {
      return { subcommand: word, rest: words.slice(index + 1), config, directory };
    }
  }
  return undefined;
}

function gitRuns(words: readonly Word[], git: GitInvocation, subcommand: string): readonly Word[] | undefined {
  if (git.subcommand === subcommand) return git.rest;
  const index = words.findIndex((word, position) => position > 0 && word.text === subcommand);
  return index === -1 ? undefined : words.slice(index + 1);
}

function candidatePaths(path: string): string[] {
  if (!unresolvedPath.test(path)) return [path];
  const parts = path.replaceAll("\\", "/").split("/");
  return parts.map((_part, index) => parts.slice(index).join("/")).filter((suffix) => suffix !== "");
}

function shortCluster(option: string, letter: string): boolean {
  return /^-[A-Za-z]+$/.test(option) && option.includes(letter);
}

function abbreviates(flag: string, option: string): boolean {
  const name = flag.split("=")[0] ?? "";
  return name.length > 2 && option.startsWith(name);
}

function gitProblem(words: readonly Word[]): string | undefined {
  const git = gitInvocation(words);
  if (!git) return undefined;
  if (git.config.some((setting) => /^core\.hookspath/i.test(setting))) return messages.skipHooks;
  if (git.subcommand === "config" && git.rest.some((word) => /^core\.hookspath$/i.test(word.text))) return messages.skipHooks;
  if (git.config.some((setting) => gitIndirection.test(setting))) return messages.gitAlias;
  if (git.subcommand === "config" && git.rest.some((word) => gitIndirection.test(word.text))) return messages.gitAlias;
  const flags = options(git.rest);
  if (flags.some((flag) => abbreviates(flag, "--no-verify"))) return messages.skipHooks;
  if (git.subcommand === "commit" && flags.some((flag) => shortCluster(flag, "n"))) return messages.skipHooks;
  const push = gitRuns(words, git, "push");
  if (push) {
    const forced = options(push).some((flag) => flag.startsWith("--force") || forceOptions.some((option) => abbreviates(flag, option)) || shortCluster(flag, "f"));
    if (forced || operands(push).some((operand) => operand.startsWith("+"))) return messages.forcePush;
  }
  if (git.subcommand === "credential" && git.rest[0]?.text === "fill") return messages.printSecret;
  return undefined;
}

function isRootLike(target: string): boolean {
  const slashed = target.replaceAll("\\", "/").replace(/\/\*$/, "");
  const path = (slashed === "" ? "" : posix.normalize(slashed)).replace(/\/+$/, "");
  if (path === "" || path === "~" || /^\$\{?(HOME|USERPROFILE)\}?$/i.test(path) || /^\$env:(HOME|USERPROFILE)$/i.test(path)) return true;
  if (path === "*" || path === ".*" || /^\.\.?(\/\.\.)*$/.test(path)) return true;
  if (/^%(HOMEPATH|USERPROFILE)%$/i.test(path)) return true;
  return /^\/[^/]+$/.test(path) || /^[A-Za-z]:(\/[^/]+)?$/.test(path) || /^\/[A-Za-z]\/[^/]+$/.test(path);
}

function removesRoot(name: string, args: readonly Word[]): boolean {
  if (!removers.has(name) || name === "tee") return false;
  const flags = options(args);
  if (flags.includes("--no-preserve-root")) return true;
  const recursive = flags.some((flag) => flag === "--recursive" || /^-[A-Za-z]*r/i.test(flag));
  return recursive && operands(args).some(isRootLike);
}

function secretVariables(word: Word): string[] {
  return [...word.expandable.matchAll(variableReference)].flatMap((match) => {
    const name = match[1] ?? match[2];
    return name !== undefined && secretName.test(name) ? [name] : [];
  });
}

function printsSecret(name: string, args: readonly Word[], all: readonly Word[]): boolean {
  const program = all[0];
  if (program && secretVariables(program).length > 0) return true;
  if (printers.has(name) && args.some((word) => secretVariables(word).length > 0 || word.expandable.includes("${!"))) return true;
  if (all.some((word) => /\/proc\/[^/\s]+\/environ/.test(word.text))) return true;
  if (name === "printenv") return args.length === 0 || args.some((word) => secretName.test(word.text));
  if (name === "env" || (name === "set" && args.length === 0)) return true;
  if (name === "export" || name === "declare" || name === "typeset") {
    const names = operands(args);
    return names.length === 0 || names.some((variable) => secretName.test(variable) && !variable.includes("="));
  }
  if (envDrivers.has(name) && args.some((word) => /^env:/i.test(word.text))) return true;
  const texts = all.map((word) => word.text.toLowerCase());
  if (name === "gh" && texts[1] === "auth") return texts[2] === "token" || (texts[2] === "status" && texts.some((text) => text === "-t" || text === "--show-token"));
  return runsSubcommand(texts, "supabase", "status");
}

function runsSubcommand(texts: readonly string[], program: string, subcommand: string): boolean {
  const index = texts.findIndex((text) => programName(text) === program);
  return index !== -1 && texts.slice(index + 1).includes(subcommand);
}

function isDataSink(name: string, all: readonly Word[]): boolean {
  const texts = all.map((word) => word.text);
  if (name === "gh") return !["alias", "extension", "ext"].includes(texts[1] ?? "");
  if (name === "rg") return !texts.some((text) => text.startsWith("--pre"));
  if (name !== "git") return dataSinks.has(name);
  const git = gitInvocation(all);
  return git !== undefined && git.config.length === 0 && gitDataSubcommands.has(git.subcommand);
}

function writeTargets(name: string, args: readonly Word[], segment: Segment, all: readonly Word[]): string[] {
  const targets = [...segment.writeTargets];
  if (removers.has(name) || movers.has(name)) targets.push(...operands(args));
  if (copiers.has(name)) targets.push(...operands(args).slice(-1));
  if (inPlaceEditors.has(name) && options(args).some((flag) => flag.startsWith("-i") || shortCluster(flag, "i") || flag.startsWith("--in-place"))) targets.push(...operands(args));
  if (name === "git") {
    const git = gitInvocation(all);
    if (git && (git.subcommand === "rm" || git.subcommand === "mv")) {
      targets.push(...operands(git.rest).flatMap((path) => (git.directory === "" ? [path] : [path, `${git.directory}/${path}`])));
    }
  }
  return targets.flatMap(candidatePaths);
}

function segmentProblem(segment: Segment, guard: CommandGuard, depth: number): string | undefined {
  const all = commandWords(segment);
  const [program, ...args] = all;
  if (segment.words.some((word) => /^(\$env:)?(LEFTHOOK|HUSKY)=["']?(0|false)/i.test(word.text) || /^(\$env:)?LEFTHOOK_(EXCLUDE|SKIP)=/i.test(word.text))) {
    return messages.skipHooks;
  }
  if (runsSubcommand(all.map((word) => word.text.toLowerCase()), "lefthook", "uninstall")) return messages.skipHooks;
  if (segment.words.some((word) => guard.secretPath(word.text)) || segment.writeTargets.some(guard.secretPath)) return messages.secretFile;
  if (program) {
    const name = programName(program.text);
    const problem =
      (name === "git" ? gitProblem(all) : undefined) ??
      (removesRoot(name, args) ? messages.removeRoot : undefined) ??
      (printsSecret(name, args, all) ? messages.printSecret : undefined);
    if (problem) return problem;
    if (!guard.evolutionHuman) {
      const git = name === "git" ? gitInvocation(all) : undefined;
      if (patchPrograms.has(name) || (git && (gitRuns(all, git, "apply") ?? gitRuns(all, git, "am")))) return messages.patchTool;
      const target = writeTargets(name, args, segment, all).map(guard.protectedTarget).find((path) => path !== undefined);
      if (target !== undefined) return messages.protectedWrite(target);
    }
  } else if (!guard.evolutionHuman) {
    const target = segment.writeTargets.flatMap(candidatePaths).map(guard.protectedTarget).find((path) => path !== undefined);
    if (target !== undefined) return messages.protectedWrite(target);
  }
  for (const substitution of segment.substitutions) {
    const nested = commandProblem(substitution, guard, depth);
    if (nested) return nested;
  }
  if (depth >= maxNesting) return undefined;
  const inspectAll = program === undefined || !isDataSink(programName(program.text), all);
  const nestedCommands = [
    ...segment.quoted.filter((part) => inspectAll || part.includes("$(") || part.includes("`")),
    ...(inspectAll ? segment.heredocs : []),
  ];
  for (const nestedCommand of nestedCommands) {
    const nested = commandProblem(nestedCommand, guard, depth + 1);
    if (nested) return nested;
  }
  return undefined;
}

function scriptProblem(command: string): string | undefined {
  if (/process\.env(?![\w.[])/.test(command) || /os\.environ(?![\w.[])/.test(command)) return messages.printSecret;
  if (/GetEnvironmentVariables\s*\(/i.test(command)) return messages.printSecret;
  const powershellNamed = [...command.matchAll(/GetEnvironmentVariable\s*\(\s*["']([A-Za-z_][A-Za-z0-9_]*)/gi)];
  if (powershellNamed.some((match) => secretName.test(match[1] ?? ""))) return messages.printSecret;
  const printing = /console\.\w+|process\.stdout|print\(|\s-p\b|--print/.test(command);
  const named = [...command.matchAll(/(?:process\.env\.|process\.env\[\s*["'`]|os\.environ(?:\.get\(|\[)\s*["']|os\.getenv\(\s*["'])([A-Za-z_][A-Za-z0-9_]*)/g)];
  return printing && named.some((match) => secretName.test(match[1] ?? "")) ? messages.printSecret : undefined;
}

export function pathProblem(path: string, guard: CommandGuard): string | undefined {
  return guard.secretPath(path) ? messages.secretFile : undefined;
}

export function commandProblem(command: string, guard: CommandGuard, depth = 0): string | undefined {
  if (/EVOLUTION_HUMAN/.test(command)) return messages.evolutionHuman;
  if (/GIT_CONFIG/i.test(command)) return messages.gitAlias;
  if (configHomeOverrides.some((pattern) => pattern.test(command))) return messages.configHome;
  const script = scriptProblem(command);
  if (script) return script;
  for (const segment of [...parseShell(command), ...parseShell(command, true)]) {
    const problem = segmentProblem(segment, guard, depth);
    if (problem) return problem;
  }
  return undefined;
}
