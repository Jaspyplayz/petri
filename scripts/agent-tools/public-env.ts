// What may reach the browser (Phase 8). Next.js inlines every NEXT_PUBLIC_* name the app's code reads, and every key in
// next.config's `env`, into the client bundle, so those names are the whole public surface. Only the Supabase URL,
// the anon key and the Sentry DSN are public by design; the commit SHA and Vercel's environment name are build
// metadata, not secrets (docs/decisions.md P8). The test runs this over the app's source, so a new public name needs
// this list changed first, and the file is protected.
export const PUBLIC_ENV_ALLOWED: readonly string[] = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SENTRY_DSN",
  "NEXT_PUBLIC_COMMIT_SHA",
  "NEXT_PUBLIC_VERCEL_ENV",
];

export function publicEnvNames(text: string): string[] {
  return [...new Set(text.match(/NEXT_PUBLIC_[A-Z0-9_]*/g) ?? [])];
}

export function nextConfigEnvKeys(text: string): string[] {
  const block = /\benv\s*:\s*\{([^}]*)\}/.exec(text)?.[1] ?? "";
  return [...block.matchAll(/(?:^|[,{\s])["']?([A-Za-z_][A-Za-z0-9_]*)["']?\s*:/g)].map((match) => match[1] ?? "");
}

export function publicEnvProblems(file: string, text: string, isNextConfig = false): string[] {
  const names = isNextConfig ? [...publicEnvNames(text), ...nextConfigEnvKeys(text)] : publicEnvNames(text);
  return [...new Set(names)]
    .filter((name) => !PUBLIC_ENV_ALLOWED.includes(name))
    .map((name) =>
      name.startsWith("NEXT_PUBLIC_")
        ? `${file}: ${name} would be sent to the browser; only ${PUBLIC_ENV_ALLOWED.join(", ")} may be`
        : `${file}: next.config env exposes ${name} to the browser`,
    );
}
