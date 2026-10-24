// A job whose steps get a secret or a token that can write runs main's scripts. Every file those scripts load at
// runtime must be a protected path, or an agent PR that auto-merges puts its code in the next privileged run. Code a
// step runs can change the steps after it ($GITHUB_ENV, $GITHUB_PATH, a process left running), so every run step in
// such a job counts. The test runs this on every file in .github/workflows (docs/decisions.md P9).
import { existsSync, readFileSync, statSync } from "node:fs";
import { isBuiltin } from "node:module";
import { join, posix } from "node:path";
import { load } from "js-yaml";
import ts from "typescript";
import { loadGuardrailsConfig } from "../check-pr/config";
import { isProtectedPath } from "../check-pr/protected-paths";

export type Repo = {
  readonly read: (path: string) => string | undefined;
  readonly scripts: Readonly<Record<string, string>>;
  readonly paths: Readonly<Record<string, readonly string[]>>;
  readonly isProtected: (path: string) => boolean;
};

type Json = Record<string, unknown>;

const SECRET = /\$\{\{[^}]*\bsecrets\./;
const TOKENS = ["GH_TOKEN", "GITHUB_TOKEN"];
const SCRIPT_FILE = /\.(?:[cm]?ts|tsx|[cm]?js)$/;
const COMMAND_BREAK = /\n|;|&&|\|\||\||\$\(|`|\(|\)/;
const PREFIXES = new Set(["if", "then", "else", "elif", "do", "while", "until", "!", "time", "env", "sudo", "nohup", "exec", "command"]);
const SUFFIXES = ["", ".ts", ".tsx", ".mts", ".js", ".mjs", ".json", "/index.ts", "/index.tsx", "/index.js"];
// Package bins that load no repo file outside the protected paths: Playwright downloading a browser, and the Supabase
// CLI, which reads its protected config, migrations and seed.
const PACKAGE_COMMANDS = [
  ["playwright", "install"],
  ["supabase", "start"],
];

const OUTSIDE = Symbol("a built-in or a package");

type Followed = { readonly entries: readonly string[]; readonly problems: readonly string[] };

function record(value: unknown): Json | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Json) : undefined;
}

export function repoAt(root: string): Repo {
  const read = (path: string): string | undefined => {
    const absolute = join(root, path);
    return existsSync(absolute) && statSync(absolute).isFile() ? readFileSync(absolute, "utf8") : undefined;
  };
  const tsconfig = ts.parseConfigFileTextToJson("tsconfig.json", read("tsconfig.json") ?? "{}").config as { compilerOptions?: { paths?: Record<string, string[]> } };
  const guardrails = loadGuardrailsConfig(root);
  return {
    read,
    scripts: (JSON.parse(read("package.json") ?? "{}") as { scripts?: Record<string, string> }).scripts ?? {},
    paths: tsconfig.compilerOptions?.paths ?? {},
    isProtected: (path) => isProtectedPath(path, guardrails),
  };
}

function secretNames(values: unknown): string[] {
  return Object.entries(record(values) ?? {})
    .filter(([, value]) => SECRET.test(String(value)))
    .map(([name]) => name);
}

function grantsWrite(permissions: unknown): boolean {
  return permissions === "write-all" || Object.values(record(permissions) ?? {}).includes("write");
}

function privileges(doc: Json, job: Json, steps: readonly Json[]): string[] {
  const envs = [doc.env, job.env, ...steps.map((step) => step.env)];
  const secrets = [...envs.flatMap(secretNames), ...steps.flatMap((step) => secretNames(step.with))];
  const tokens = grantsWrite(job.permissions ?? doc.permissions) ? TOKENS.filter((name) => envs.some((env) => name in (record(env) ?? {}))) : [];
  return [...new Set([...secrets, ...tokens])];
}

function commands(script: string): string[][] {
  return script.split(COMMAND_BREAK).map((command) => {
    const words = command
      .trim()
      .split(/\s+/)
      .map((word) => word.replace(/^["']|["']$/g, ""))
      .filter((word) => word !== "");
    while (words[0] !== undefined && (PREFIXES.has(words[0]) || /^\w+=/.test(words[0]))) words.shift();
    return words;
  });
}

// The files a node or tsx command loads first: its script and anything it preloads (--import x.ts, --import=x.ts).
function nodeEntries(args: readonly string[]): string[] {
  return args
    .flatMap((word) => word.split("="))
    .filter((word) => SCRIPT_FILE.test(word))
    .map((path) => posix.normalize(path));
}

// The repo files a command loads first. In a run step, other programs (gh, git, jq) load none. Where a package bin
// runs (a package.json script, pnpm exec, npx), only node, tsx and PACKAGE_COMMANDS can be followed.
function follow(words: readonly string[], repo: Repo, bin: boolean): Followed {
  const [program, ...args] = words;
  const command = `"${words.join(" ")}"`;
  if (program === "node" || program === "tsx") {
    const entries = nodeEntries(args);
    return { entries, problems: entries.length > 0 ? [] : [`runs ${command}, which loads no file this check can follow`] };
  }
  const exec = program === "npx" ? args : program === "pnpm" && (args[0] === "exec" || args[0] === "dlx") ? args.slice(1) : undefined;
  if (exec !== undefined) {
    const inner = follow(exec, repo, true);
    return { entries: inner.entries, problems: inner.problems.length > 0 ? [`runs ${command}, which this check can't follow`] : [] };
  }
  if (program === "pnpm") {
    const [first, second] = args.filter((word) => !word.startsWith("-"));
    const name = first === "run" ? second : first;
    const value = name === undefined ? undefined : repo.scripts[name];
    if (name === undefined || value === undefined) return { entries: [], problems: [`runs ${command}, which isn't a package.json script`] };
    const inner = commands(value).map((script) => follow(script, repo, true));
    return {
      entries: inner.flatMap((followed) => followed.entries),
      problems: inner.some((followed) => followed.problems.length > 0) ? [`runs pnpm ${name} ("${value}"), which this check can't follow`] : [],
    };
  }
  const known = PACKAGE_COMMANDS.some((prefix) => prefix.every((word, index) => words[index] === word));
  return { entries: [], problems: bin && program !== undefined && !known ? [`runs ${command}, which this check can't follow`] : [] };
}

// import type and export type are erased. A named import whose bindings are all `type` still loads its module, under
// verbatimModuleSyntax (tsx) and Node's type stripping alike, so it counts.
function runtimeImports(path: string, text: string): { specifiers: string[]; dynamic: number } {
  const specifiers: string[] = [];
  let dynamic = 0;
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && node.importClause?.phaseModifier !== ts.SyntaxKind.TypeKeyword && ts.isStringLiteral(node.moduleSpecifier)) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [argument] = node.arguments;
      if (argument !== undefined && ts.isStringLiteralLike(argument)) specifiers.push(argument.text);
      else dynamic += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true));
  return { specifiers, dynamic };
}

function fileAt(repo: Repo, base: string): string | undefined {
  const candidates = [...SUFFIXES.map((suffix) => base + suffix), ...(base.endsWith(".js") ? [base.replace(/\.js$/, ".ts")] : [])];
  return candidates.find((candidate) => repo.read(candidate) !== undefined);
}

// A repo file, or OUTSIDE for a built-in or a package. undefined: it should be a repo file, and there's none.
function resolve(repo: Repo, specifier: string, from: string): string | typeof OUTSIDE | undefined {
  if (isBuiltin(specifier)) return OUTSIDE;
  if (/^\/|^[a-z]+:/i.test(specifier)) return undefined;
  if (specifier.startsWith(".")) return fileAt(repo, posix.join(posix.dirname(from), specifier));
  for (const [pattern, targets] of Object.entries(repo.paths)) {
    const [prefix = "", suffix = ""] = pattern.split("*");
    const matches = pattern.includes("*") ? specifier.startsWith(prefix) && specifier.endsWith(suffix) : specifier === pattern;
    if (!matches) continue;
    const captured = specifier.slice(prefix.length, specifier.length - suffix.length);
    return targets.map((target) => fileAt(repo, posix.normalize(target.replace("*", captured)))).find((file) => file !== undefined);
  }
  return OUTSIDE;
}

function unprotectedLoads(repo: Repo, entry: string): string[] {
  if (repo.read(entry) === undefined) return ["doesn't exist"];
  const problems: string[] = [];
  const importer = new Map<string, string | undefined>([[entry, undefined]]);
  const queue = [entry];
  for (const path of queue) {
    const from = importer.get(path);
    if (!repo.isProtected(path)) problems.push(from === undefined ? "is outside the protected paths" : `loads ${path} (imported by ${from}), outside the protected paths`);
    if (path.endsWith(".json")) continue;
    const { specifiers, dynamic } = runtimeImports(path, repo.read(path) ?? "");
    if (dynamic > 0) problems.push(`loads ${path}, which has an import() this check can't follow`);
    for (const specifier of specifiers) {
      const file = resolve(repo, specifier, path);
      if (file === undefined) problems.push(`loads ${path}, whose import "${specifier}" doesn't resolve to a file`);
      else if (file !== OUTSIDE && !importer.has(file)) {
        importer.set(file, path);
        queue.push(file);
      }
    }
  }
  return problems;
}

export function privilegedScriptProblems(file: string, text: string, repo: Repo): string[] {
  const doc = record(load(text));
  if (!doc) return [`${file}: not a YAML mapping`];
  const problems: string[] = [];
  for (const [name, rawJob] of Object.entries(record(doc.jobs) ?? {})) {
    const job = record(rawJob) ?? {};
    const steps = (Array.isArray(job.steps) ? job.steps : []).map((step) => record(step) ?? {});
    const holds = privileges(doc, job, steps);
    if (holds.length === 0) continue;
    for (const step of steps) {
      if (typeof step.run !== "string") continue;
      const label = typeof step.name === "string" ? step.name : (step.run.trim().split("\n")[0] ?? "");
      const where = `${file}: job ${name} (holds ${holds.join(", ")}), "${label}"`;
      const followed = commands(step.run).map((words) => follow(words, repo, false));
      problems.push(...followed.flatMap((command) => command.problems).map((problem) => `${where} ${problem}`));
      for (const entry of new Set(followed.flatMap((command) => command.entries))) {
        problems.push(...unprotectedLoads(repo, entry).map((problem) => `${where} runs ${entry}, which ${problem}`));
      }
    }
  }
  return problems;
}
