import { z } from "zod";
import type { FeatureManifest, FlowStep } from "@/shared/lib/feature-manifest";
import { VerifyError } from "./verify-error";

export type VerifyStep = FlowStep<string>;

export type VerifyRun = {
  readonly name: string;
  readonly description: string;
  readonly steps: readonly VerifyStep[];
};

const testId = z.string().min(1);

const stepSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("goto"), path: z.string().startsWith("/") }),
  z.strictObject({ action: z.literal("click"), target: testId }),
  z.strictObject({ action: z.literal("fill"), target: testId, value: z.string() }),
  z.strictObject({ action: z.literal("press"), target: testId, key: z.string().min(1) }),
  z.strictObject({ action: z.literal("expectVisible"), target: testId }),
  z.strictObject({ action: z.literal("expectText"), target: testId, text: z.string().min(1) }),
  z.strictObject({ action: z.literal("screenshot"), name: z.string().min(1) }),
  z.strictObject({ action: z.literal("wait"), ms: z.number().int().min(0).max(30_000) }),
]);

const stepsSchema = z.array(stepSchema).min(1);
const scriptSchema = z.strictObject({ description: z.string().optional(), steps: stepsSchema });

export function parseScript(name: string, json: unknown): VerifyRun {
  const parsed = Array.isArray(json)
    ? stepsSchema.transform((steps) => ({ description: undefined, steps })).safeParse(json)
    : scriptSchema.safeParse(json);
  if (!parsed.success) {
    throw new VerifyError(
      `${name} isn't a valid verify script (a list of steps, or { "description", "steps" }):\n${z.prettifyError(parsed.error)}`,
    );
  }
  return { name, description: parsed.data.description ?? "Ad-hoc verify script", steps: parsed.data.steps };
}

export function flowNames(manifests: readonly FeatureManifest[]): string[] {
  return manifests.flatMap((manifest) => Object.keys(manifest.flows).map((flow) => `${manifest.id}.${flow}`));
}

export function resolveFlow(manifests: readonly FeatureManifest[], qualifiedName: string): VerifyRun {
  const [featureId, flowName, ...rest] = qualifiedName.split(".");
  const manifest = manifests.find((candidate) => candidate.id === featureId);
  const flow = flowName === undefined || rest.length > 0 ? undefined : manifest?.flows[flowName];
  if (!manifest || !flow) {
    throw new VerifyError(`no flow named "${qualifiedName}". Flows: ${flowNames(manifests).join(", ") || "none"}`);
  }
  const steps = flow.steps.map((step): VerifyStep => {
    if (!("target" in step)) return step;
    const target = manifest.selectors[step.target];
    if (target === undefined) throw new VerifyError(`${qualifiedName} uses a selector the manifest doesn't define: ${step.target}`);
    return { ...step, target };
  });
  return { name: qualifiedName, description: flow.description, steps };
}

export function describeStep(step: VerifyStep): string {
  switch (step.action) {
    case "goto":
      return `goto ${step.path}`;
    case "click":
    case "expectVisible":
      return `${step.action} ${step.target}`;
    case "fill":
      return `fill ${step.target} ${JSON.stringify(step.value)}`;
    case "press":
      return `press ${step.target} ${step.key}`;
    case "expectText":
      return `expectText ${step.target} ${JSON.stringify(step.text)}`;
    case "screenshot":
      return `screenshot ${step.name}`;
    case "wait":
      return `wait ${String(step.ms)}ms`;
  }
}
