import { basename } from "node:path";
import { parseShell, type Segment, type Word } from "./shell.ts";

export type CommandGuard = {
  readonly evolutionHuman: boolean;
  readonly protectedTarget: (path: string) => string | undefined;
  readonly secretPath: (path: string) => boolean;
  readonly readPatch: (path: string) => string | undefined;
};

const assignment = /^[A-Za-z_][A-Za-z0-9_]*=/;
const wrappers = new Set(["sudo", "doas", "command", "builtin", "exec", "nohup", "nice", "time", "xargs", "!", "{", "}", "if", "then", "elif", "else", "while", "until", "do"]);
const dataSinks = new Set([
  ...["cat", "tee", "echo", "printf", "print", "write-output", "write-host", "grep", "egrep", "fgrep", "rg", "wc", "head", "tail"],
  ...["sort", "uniq", "less", "more", "jq", "diff", "read", "gh", "gitleaks", "test", "[", "[["],
]);
const gitDataSubcommands = new Set(["commit", "tag", "notes", "hash-object", "log", "show", "grep", "diff", "status"]);
const patchHeader = /^(?:(?:\+\+\+|---)\s+|diff --git\s+|(?:rename|copy) (?:from|to)\s+)(.+)$/gm;
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
  removeRoot: "Blocked: recursive delete of a filesystem root or home directory.",
  printSecret: "Blocked: this would print a secret or the whole environment. Check that a variable is set with [ -n \"$NAME\" ] instead of printing it.",
  secretFile: "Blocked: env and credential files hold secrets and stay unread. Scripts such as `pnpm setup:secrets` and `pnpm env:local` read them for you.",
  evolutionHuman: "Blocked: EVOLUTION_HUMAN is set by a human when they start Claude Code, never by a command.",
  unreadablePatch: "Blocked: patch / git apply / git am with a patch the guard can't read (stdin or pipe). Write the patch to a file and pass its path, so protected paths in it can be checked.",
  protectedWrite: (path: string) =>
    `Blocked: ${path} is a protected path (.github/guardrails.json). Agents can't change their own guardrails; a human can by starting Claude Code with EVOLUTION_HUMAN=1.`,
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

function gitInvocation(words: readonly Word[]): { readonly subcommand: string; readonly rest: readonly Word[]; readonly config: readonly string[] } | undefined {
  const config: string[] = [];
  let index = 1;
  while (index < words.length) {
    const word = words[index]?.text ?? "";
    if (word === "-C" || word === "-c") {
      if (word === "-c") config.push(words[index + 1]?.text ?? "");
      index += 2;
    } else if (word.startsWith("-")) {
      index += 1;
    } else {
      return { subcommand: word, rest: words.slice(index + 1), config };
    }
  }
  return undefined;
}

function shortCluster(option: string, letter: string): boolean {
  return /^-[A-Za-z]+$/.test(option) && option.includes(letter);
}

function gitProblem(words: readonly Word[]): string | undefined {
  const git = gitInvocation(words);
  if (!git) return undefined;
  if (git.config.some((setting) => /^core\.hookspath/i.test(setting))) return messages.skipHooks;
  if (git.subcommand === "config" && git.rest.some((word) => /^core\.hookspath$/i.test(word.text))) return messages.skipHooks;
  const flags = options(git.rest);
  if (flags.includes("--no-verify")) return messages.skipHooks;
  if (git.subcommand === "commit" && flags.some((flag) => shortCluster(flag, "n"))) return messages.skipHooks;
  if (git.subcommand === "push") {
    const forced = flags.some((flag) => flag.startsWith("--force") || flag === "--mirror" || shortCluster(flag, "f"));
    if (forced || operands(git.rest).some((operand) => operand.startsWith("+"))) return messages.forcePush;
  }
  if (git.subcommand === "credential" && git.rest[0]?.text === "fill") return messages.printSecret;
  return undefined;
}

function isRootLike(target: string): boolean {
  const path = target.replaceAll("\\", "/").replace(/\/\*$/, "").replace(/\/+$/, "");
  if (path === "" || path === "~" || /^\$\{?(HOME|USERPROFILE)\}?$/i.test(path) || /^\$env:(HOME|USERPROFILE)$/i.test(path)) return true;
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
  if (printers.has(name) && args.some((word) => secretVariables(word).length > 0)) return true;
  if (name === "printenv") return args.length === 0 || args.some((word) => secretName.test(word.text));
  if (name === "env" || (name === "set" && args.length === 0)) return true;
  if (name === "export" || name === "declare" || name === "typeset") {
    const names = operands(args);
    return names.length === 0 || names.some((variable) => secretName.test(variable) && !variable.includes("="));
  }
  if (envDrivers.has(name) && args.some((word) => /^env:/i.test(word.text))) return true;
  const texts = all.map((word) => word.text.toLowerCase());
  if (name === "gh" && texts[1] === "auth") return texts[2] === "token" || (texts[2] === "status" && texts.some((text) => text === "-t" || text === "--show-token"));
  const supabase = texts.findIndex((text) => programName(text) === "supabase");
  return supabase !== -1 && texts.slice(supabase + 1).includes("status");
}

function isDataSink(name: string, all: readonly Word[]): boolean {
  const texts = all.map((word) => word.text);
  if (name === "gh") return !["alias", "extension", "ext"].includes(texts[1] ?? "");
  if (name === "rg") return !texts.some((text) => text.startsWith("--pre"));
  if (name === "sort") return !texts.some((text) => text.startsWith("--compress-program"));
  if (name !== "git") return dataSinks.has(name);
  const git = gitInvocation(all);
  return git !== undefined && git.config.length === 0 && gitDataSubcommands.has(git.subcommand);
}

function patchSources(name: string, args: readonly Word[], segment: Segment, all: readonly Word[], guard: CommandGuard): string[] | undefined {
  const gitSubcommand = name === "git" ? gitInvocation(all)?.subcommand : undefined;
  if (name !== "patch" && gitSubcommand !== "apply" && gitSubcommand !== "am") return undefined;
  return [...segment.heredocs, ...operands(args).flatMap((path) => guard.readPatch(path) ?? [])];
}

function patchDirectories(args: readonly Word[]): string[] {
  const directories: string[] = [];
  args.forEach((word, index) => {
    const inline = /^--directory=(.+)$/.exec(word.text)?.[1];
    if (inline !== undefined) directories.push(inline);
    if (word.text === "-d" || word.text === "--directory") directories.push(args[index + 1]?.text ?? "");
  });
  return directories.filter((directory) => directory !== "");
}

function patchTargets(patch: string, directories: readonly string[]): string[] {
  const paths = [...patch.matchAll(patchHeader)].flatMap((match) =>
    (match[1] ?? "")
      .split(/\s+/)
      .map((path) => path.replace(/^"|"$/g, ""))
      .filter((path) => path !== "" && path !== "/dev/null"),
  );
  const suffixes = paths.flatMap((path) => path.split("/").map((_part, index, parts) => parts.slice(index).join("/")));
  return [...suffixes, ...directories.flatMap((directory) => suffixes.map((suffix) => `${directory}/${suffix}`))];
}

function writeTargets(name: string, args: readonly Word[], segment: Segment, all: readonly Word[], guard: CommandGuard): string[] {
  const targets = [...segment.writeTargets];
  const patches = patchSources(name, args, segment, all, guard);
  if (patches) targets.push(...patches.flatMap((patch) => patchTargets(patch, patchDirectories(args))));
  if (removers.has(name) || movers.has(name)) targets.push(...operands(args));
  if (copiers.has(name)) targets.push(...operands(args).slice(-1));
  if (inPlaceEditors.has(name) && options(args).some((flag) => flag.startsWith("-i") || shortCluster(flag, "i") || flag.startsWith("--in-place"))) targets.push(...operands(args));
  if (name === "git") {
    const git = gitInvocation(all);
    if (git && (git.subcommand === "rm" || git.subcommand === "mv")) targets.push(...operands(git.rest));
  }
  return targets;
}

function segmentProblem(segment: Segment, guard: CommandGuard, depth: number): string | undefined {
  const all = commandWords(segment);
  const [program, ...args] = all;
  if (segment.words.some((word) => /^(\$env:)?(LEFTHOOK|HUSKY)=["']?(0|false)/i.test(word.text) || /^(\$env:)?LEFTHOOK_(EXCLUDE|SKIP)=/i.test(word.text))) {
    return messages.skipHooks;
  }
  if (segment.words.some((word) => guard.secretPath(word.text)) || segment.writeTargets.some(guard.secretPath)) return messages.secretFile;
  if (program) {
    const name = programName(program.text);
    const problem =
      (name === "git" ? gitProblem(all) : undefined) ??
      (removesRoot(name, args) ? messages.removeRoot : undefined) ??
      (printsSecret(name, args, all) ? messages.printSecret : undefined);
    if (problem) return problem;
    if (!guard.evolutionHuman) {
      if (patchSources(name, args, segment, all, guard)?.length === 0) return messages.unreadablePatch;
      const target = writeTargets(name, args, segment, all, guard).map(guard.protectedTarget).find((path) => path !== undefined);
      if (target !== undefined) return messages.protectedWrite(target);
    }
  } else if (!guard.evolutionHuman) {
    const target = segment.writeTargets.map(guard.protectedTarget).find((path) => path !== undefined);
    if (target !== undefined) return messages.protectedWrite(target);
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
  const printing = /console\.\w+|process\.stdout|print\(|\s-p\b|--print/.test(command);
  const named = [...command.matchAll(/(?:process\.env\.|process\.env\[\s*["'`]|os\.environ(?:\.get\(|\[)\s*["'])([A-Za-z_][A-Za-z0-9_]*)/g)];
  return printing && named.some((match) => secretName.test(match[1] ?? "")) ? messages.printSecret : undefined;
}

export function commandProblem(command: string, guard: CommandGuard, depth = 0): string | undefined {
  if (/EVOLUTION_HUMAN/.test(command)) return messages.evolutionHuman;
  const script = scriptProblem(command);
  if (script) return script;
  for (const segment of parseShell(command)) {
    const problem = segmentProblem(segment, guard, depth);
    if (problem) return problem;
  }
  return undefined;
}
