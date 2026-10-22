function escapeRegExp(text: string): string {
  return text.replace(/[.+^$()|[\]\\]/g, "\\$&");
}

export type GlobOptions = {
  readonly ignoreCase?: boolean;
};

export function globToRegExp(glob: string, options: GlobOptions = {}): RegExp {
  let pattern = "";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob.charAt(index);
    if (char === "*" && glob.charAt(index + 1) === "*") {
      const followedBySlash = glob.charAt(index + 2) === "/";
      pattern += followedBySlash ? "(?:.*/)?" : ".*";
      index += followedBySlash ? 2 : 1;
    } else if (char === "*") {
      pattern += "[^/]*";
    } else if (char === "?") {
      pattern += "[^/]";
    } else if (char === "{") {
      const end = glob.indexOf("}", index);
      if (end === -1) throw new Error(`Unclosed "{" in glob ${glob}`);
      pattern += `(?:${glob.slice(index + 1, end).split(",").map(escapeRegExp).join("|")})`;
      index = end;
    } else {
      pattern += escapeRegExp(char);
    }
  }
  return new RegExp(`^${pattern}$`, options.ignoreCase ? "i" : "");
}

export function toRepoPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function matchesAny(path: string, globs: readonly string[], options: GlobOptions = {}): boolean {
  const repoPath = toRepoPath(path);
  return globs.some((glob) => globToRegExp(glob, options).test(repoPath));
}
