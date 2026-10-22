export type Word = {
  readonly text: string;
  readonly expandable: string;
};

export type Segment = {
  readonly words: readonly Word[];
  readonly writeTargets: readonly string[];
  readonly quoted: readonly string[];
  readonly heredocs: readonly string[];
};

type OpenSegment = Segment & { readonly heredocs: string[] };

type Heredoc = { readonly delimiter: string; readonly stripTabs: boolean };

const doubleQuoteEscapes = new Set(["$", "`", '"', "\\", "\n"]);
const delimiterEnd = /[\s;&|<>()]/;

export function parseShell(command: string): Segment[] {
  const segments: OpenSegment[] = [];
  let lineStart = 0;
  let words: Word[] = [];
  let writeTargets: string[] = [];
  let quoted: string[] = [];
  let text = "";
  let expandable = "";
  let inWord = false;
  let nextIsWriteTarget = false;
  let heredocs: Heredoc[] = [];
  let index = 0;

  const flushWord = (): void => {
    if (!inWord) return;
    words.push({ text, expandable });
    if (nextIsWriteTarget) writeTargets.push(text);
    nextIsWriteTarget = false;
    text = "";
    expandable = "";
    inWord = false;
  };
  const flushSegment = (): void => {
    flushWord();
    if (words.length > 0 || quoted.length > 0) segments.push({ words, writeTargets, quoted, heredocs: [] });
    words = [];
    writeTargets = [];
    quoted = [];
    nextIsWriteTarget = false;
  };
  const readHeredocBodies = (): void => {
    const bodies: string[] = [];
    for (const heredoc of heredocs) {
      const lines: string[] = [];
      while (index < command.length) {
        const end = command.indexOf("\n", index);
        const line = command.slice(index, end === -1 ? command.length : end).replace(/\r$/, "");
        index = end === -1 ? command.length : end + 1;
        if ((heredoc.stripTabs ? line.replace(/^\t+/, "") : line) === heredoc.delimiter) break;
        lines.push(line);
      }
      bodies.push(lines.join("\n"));
    }
    for (const segment of segments.slice(lineStart)) segment.heredocs.push(...bodies);
    heredocs = [];
    lineStart = segments.length;
  };

  while (index < command.length) {
    const char = command.charAt(index);
    const next = command.charAt(index + 1);
    if (char === "\\") {
      if (next !== "\n" && next !== "") {
        text += next;
        expandable += next;
        inWord = true;
      }
      index += 2;
    } else if (char === "'") {
      const end = command.indexOf("'", index + 1);
      const content = command.slice(index + 1, end === -1 ? command.length : end);
      text += content;
      quoted.push(content);
      inWord = true;
      index = end === -1 ? command.length : end + 1;
    } else if (char === '"') {
      let content = "";
      let cursor = index + 1;
      while (cursor < command.length && command.charAt(cursor) !== '"') {
        const current = command.charAt(cursor);
        const escaped = command.charAt(cursor + 1);
        if (current === "\\" && doubleQuoteEscapes.has(escaped)) {
          content += escaped;
          cursor += 2;
        } else {
          content += current;
          cursor += 1;
        }
      }
      text += content;
      expandable += content;
      quoted.push(content);
      inWord = true;
      index = cursor + 1;
    } else if (char === "#" && !inWord) {
      const end = command.indexOf("\n", index);
      index = end === -1 ? command.length : end;
    } else if (char === "\n") {
      flushSegment();
      index += 1;
      readHeredocBodies();
    } else if (char === "<") {
      flushWord();
      if (command.startsWith("<<<", index)) {
        index += 3;
      } else if (next === "<") {
        index += 2;
        const stripTabs = command.charAt(index) === "-";
        if (stripTabs) index += 1;
        while (command.charAt(index) === " " || command.charAt(index) === "\t") index += 1;
        let delimiter = "";
        while (index < command.length && !delimiterEnd.test(command.charAt(index))) {
          const current = command.charAt(index);
          if (current !== "'" && current !== '"' && current !== "\\") delimiter += current;
          index += 1;
        }
        heredocs.push({ delimiter, stripTabs });
      } else {
        index += 1;
      }
    } else if (char === ">" || (char === "&" && next === ">")) {
      if (char === ">" && inWord && /^\d+$/.test(text)) {
        text = "";
        expandable = "";
        inWord = false;
      } else {
        flushWord();
      }
      index += char === "&" ? 2 : 1;
      if (command.charAt(index) === ">" || command.charAt(index) === "|") index += 1;
      if (command.charAt(index) === "&") {
        index += 1;
        while (/[\d-]/.test(command.charAt(index))) index += 1;
      } else {
        nextIsWriteTarget = true;
      }
    } else if (char === "&" || char === ";" || char === "|" || char === "(" || char === ")" || char === "`") {
      flushSegment();
      index += 1;
    } else if (char === " " || char === "\t" || char === "\r") {
      flushWord();
      index += 1;
    } else {
      text += char;
      expandable += char;
      inWord = true;
      index += 1;
    }
  }
  flushSegment();
  return segments;
}
