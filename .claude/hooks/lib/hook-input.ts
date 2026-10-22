import { asRecord } from "../../../scripts/check-pr/json.ts";

export type HookInput = {
  readonly toolName: string;
  readonly toolInput: Readonly<Record<string, unknown>>;
  readonly cwd: string | undefined;
};

export function parseHookInput(text: string): HookInput {
  const payload = asRecord(JSON.parse(text));
  const toolName = payload?.tool_name;
  const toolInput = asRecord(payload?.tool_input);
  if (typeof toolName !== "string" || !toolInput) throw new Error("hook input has no tool_name / tool_input");
  const cwd = payload?.cwd;
  return { toolName, toolInput, cwd: typeof cwd === "string" && cwd !== "" ? cwd : undefined };
}

export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function block(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}
