import { z } from "zod";

const serverStateSchema = z.object({
  pid: z.number().int().positive(),
  port: z.number().int().positive(),
  url: z.url(),
  fingerprint: z.string().min(1),
  startedAt: z.string(),
});

export type ServerState = z.infer<typeof serverStateSchema>;

export type ServerPlan =
  | { readonly kind: "reuse"; readonly url: string }
  | { readonly kind: "start"; readonly stopPid: number | undefined }
  | { readonly kind: "port-taken" };

export type ServerFacts = {
  readonly state: ServerState | undefined;
  readonly port: number;
  readonly fingerprint: string;
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
    return facts.state.fingerprint === facts.fingerprint
      ? { kind: "reuse", url: facts.state.url }
      : { kind: "start", stopPid: facts.state.pid };
  }
  if (facts.portAnswers) return { kind: "port-taken" };
  return { kind: "start", stopPid: undefined };
}
