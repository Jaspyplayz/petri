// Checks the agents' `--allowedTools` lists in the workflows. A `Bash(prefix:*)` rule matches its prefix followed by a
// space or the end, so `Bash(pnpm verify:*)` allows `pnpm verify …` and never `pnpm verify:flow …`. The #63 builder
// couldn't run a single verify command because of that (docs/agent-mistakes.md). Every `pnpm` rule must name a whole
// script from package.json.

export function allowedToolsLists(workflow: string): string[] {
  return [...workflow.matchAll(/--allowedTools\s+"([^"]*)"/g)].map((match) => match[1] ?? "");
}

export function splitRules(list: string): string[] {
  const rules: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of list) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      if (current.trim()) rules.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) rules.push(current.trim());
  return rules;
}

export function pnpmRuleProblem(rule: string, scripts: ReadonlySet<string>): string | undefined {
  const match = /^Bash\(pnpm (.*)\)$/.exec(rule);
  if (!match) return undefined;
  const command = (match[1] ?? "").replace(/(:\*| \*)$/, "");
  const script = command.split(" ")[0] ?? "";
  if (script.startsWith("-")) return `${rule} puts a flag before the script name, so plain "pnpm <script>" isn't allowed`;
  if (!scripts.has(script)) {
    return `${rule} only allows "pnpm ${script} …", and "${script}" isn't a script in package.json. Name each script, for example Bash(pnpm ${script}:flow:*)`;
  }
  return undefined;
}

export function allowedToolsProblems(workflows: ReadonlyMap<string, string>, scripts: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  for (const [file, text] of workflows) {
    for (const list of allowedToolsLists(text)) {
      for (const rule of splitRules(list)) {
        const problem = pnpmRuleProblem(rule, scripts);
        if (problem) problems.push(`${file}: ${problem}`);
      }
    }
  }
  return problems;
}
