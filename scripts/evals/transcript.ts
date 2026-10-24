// Turns a `claude -p --output-format stream-json` transcript into markdown the judge can read, and pulls out the shell
// commands the agent ran, so "did it actually run verify-app?" is a fact and not the agent's own claim.
const MAX_RESULT_CHARS = 1500;

type Block = { type?: string; text?: string; name?: string; input?: unknown; content?: unknown; is_error?: boolean };
type Event = { type?: string; message?: { content?: Block[] | string } };

function parse(lines: readonly string[]): Event[] {
  return lines.flatMap((line) => {
    try {
      return [JSON.parse(line) as Event];
    } catch {
      return [];
    }
  });
}

function blocks(event: Event): Block[] {
  const content = event.message?.content;
  return Array.isArray(content) ? content : [];
}

function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part: Block) => part.text ?? "").join("\n");
  return "";
}

function truncate(text: string): string {
  return text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}\n… (${String(text.length - MAX_RESULT_CHARS)} more characters)` : text;
}

export function bashCommands(lines: readonly string[]): string[] {
  return parse(lines)
    .filter((event) => event.type === "assistant")
    .flatMap(blocks)
    .filter((block) => block.type === "tool_use" && block.name === "Bash")
    .map((block) => {
      const command = (block.input as { command?: unknown } | undefined)?.command;
      return typeof command === "string" ? command : "";
    });
}

export function ranVerify(commands: readonly string[]): boolean {
  return commands.some((command) => /\bpnpm\s+(?:-s\s+)?verify:(?:flow|script|all|compare)\b/.test(command));
}

export function condenseTranscript(lines: readonly string[]): string {
  const out: string[] = [];
  for (const event of parse(lines)) {
    for (const block of blocks(event)) {
      if (event.type === "assistant" && block.type === "text" && block.text?.trim()) out.push(`**Agent:** ${block.text.trim()}`);
      if (event.type === "assistant" && block.type === "tool_use") out.push(`**Tool ${block.name ?? "?"}:** \`${JSON.stringify(block.input)}\``);
      if (event.type === "user" && block.type === "tool_result") {
        out.push(`**Result${block.is_error ? " (error)" : ""}:**\n\n\`\`\`\n${truncate(resultText(block.content))}\n\`\`\``);
      }
    }
  }
  return `${out.join("\n\n")}\n`;
}
