import { z } from "zod";

const dependencySchema = z.object({
  module: z.string(),
  resolved: z.string(),
  dependencyTypes: z.array(z.string()),
});

const moduleSchema = z.object({
  source: z.string(),
  dependencies: z.array(dependencySchema),
});

const violationSchema = z.object({
  rule: z.object({ name: z.string() }),
  from: z.string(),
  to: z.string(),
});

const cruiseResultSchema = z.object({
  modules: z.array(moduleSchema),
  summary: z.object({ violations: z.array(violationSchema) }),
});

export type CruisedModule = z.infer<typeof moduleSchema>;
export type CruiseViolation = z.infer<typeof violationSchema>;
export type CruiseResult = z.infer<typeof cruiseResultSchema>;

export type ServerLeak = {
  readonly clientEntry: string;
  readonly chain: readonly string[];
  readonly reason: string;
};

export const SERVICE_ROLE_CLIENT = "src/shared/supabase/service-client.ts";

export function parseCruiseResult(json: string): CruiseResult {
  return cruiseResultSchema.parse(JSON.parse(json));
}

export function isClientEntrySource(content: string): boolean {
  const directive = /^\s*(["'])(.*?)\1\s*;?/;
  let rest = content.replace(/^﻿/, "");
  for (let match = directive.exec(rest); match; match = directive.exec(rest)) {
    if (match[2] === "use client") return true;
    rest = rest.slice(match[0].length);
  }
  return false;
}

function isRuntimeDependency(dependency: CruisedModule["dependencies"][number]): boolean {
  return !dependency.dependencyTypes.includes("type-only");
}

export function serverOnlyReason(module: CruisedModule): string | undefined {
  if (/(^|\/)server\//.test(module.source)) return "lives in a server/ folder";
  if (module.source === SERVICE_ROLE_CLIENT) return "is the service-role Supabase client";
  const importsServerOnly = module.dependencies.some(
    (dependency) => dependency.module === "server-only" && isRuntimeDependency(dependency),
  );
  return importsServerOnly ? 'imports "server-only"' : undefined;
}

function chainTo(target: string, parents: ReadonlyMap<string, string | undefined>): string[] {
  const chain: string[] = [];
  for (let current: string | undefined = target; current !== undefined; current = parents.get(current)) {
    chain.unshift(current);
  }
  return chain;
}

export function findServerLeaks(
  modules: readonly CruisedModule[],
  isClientEntry: (source: string) => boolean,
): ServerLeak[] {
  const bySource = new Map(modules.map((module) => [module.source, module]));
  const leaks: ServerLeak[] = [];
  for (const entry of modules.filter((module) => isClientEntry(module.source))) {
    const parents = new Map<string, string | undefined>([[entry.source, undefined]]);
    const queue = [entry.source];
    for (let index = 0; index < queue.length; index += 1) {
      const current = bySource.get(queue[index] ?? "");
      if (!current) continue;
      const reason = serverOnlyReason(current);
      if (reason) {
        leaks.push({ clientEntry: entry.source, chain: chainTo(current.source, parents), reason });
        continue;
      }
      for (const dependency of current.dependencies) {
        if (!isRuntimeDependency(dependency) || !bySource.has(dependency.resolved)) continue;
        if (parents.has(dependency.resolved)) continue;
        parents.set(dependency.resolved, current.source);
        queue.push(dependency.resolved);
      }
    }
  }
  return leaks;
}

export function formatReport(violations: readonly CruiseViolation[], leaks: readonly ServerLeak[]): string {
  const lines = [
    ...violations.map((violation) => `✖ ${violation.rule.name}: ${violation.from} → ${violation.to}`),
    ...leaks.map(
      (leak) =>
        `✖ client-reaches-server-only: ${leak.clientEntry} reaches ${leak.chain.at(-1) ?? "?"}, which ${leak.reason}\n    via ${leak.chain.join(" → ")}`,
    ),
  ];
  return lines.join("\n");
}
