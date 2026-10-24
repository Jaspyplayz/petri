import { z } from "zod";

// Stopping a server signals its pid's whole process group, so a state file whose pid is 1 (every process the user
// owns) or whose url isn't the one verify starts on doesn't count as ours. The evals runner reads the state file from a
// repo copy an agent worked in.
const serverStateSchema = z
  .object({
    pid: z.number().int().gt(1),
    port: z.number().int().min(1).max(65_535),
    url: z.url(),
    fingerprint: z.string().min(1),
    buildId: z.string().min(1),
    startedAt: z.string(),
  })
  .refine((state) => state.url === `http://127.0.0.1:${String(state.port)}`);

export type ServerState = z.infer<typeof serverStateSchema>;

export type ServerPlan =
  | { readonly kind: "reuse"; readonly url: string }
  | { readonly kind: "start"; readonly stopPid: number | undefined }
  | { readonly kind: "port-taken" };

export type ServerFacts = {
  readonly state: ServerState | undefined;
  readonly port: number;
  readonly fingerprint: string;
  readonly buildId: string | undefined;
  readonly pidAlive: boolean;
  readonly portAnswers: boolean;
};

export function parseServerState(text: string | undefined): ServerState | undefined {
  if (text === undefined) return undefined;
  try {
    const parsed = serverStateSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function planServer(facts: ServerFacts): ServerPlan {
  const ours = facts.state !== undefined && facts.state.port === facts.port && facts.pidAlive;
  if (ours && facts.portAnswers) {
    const current = facts.state.fingerprint === facts.fingerprint && facts.state.buildId === facts.buildId;
    return current ? { kind: "reuse", url: facts.state.url } : { kind: "start", stopPid: facts.state.pid };
  }
  if (facts.portAnswers) return { kind: "port-taken" };
  return { kind: "start", stopPid: undefined };
}
