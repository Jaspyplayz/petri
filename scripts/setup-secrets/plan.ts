import { randomBytes } from "node:crypto";

export type VercelEnvironment = "production" | "preview" | "development";

export type SecretSpec = {
  readonly key: string;
  readonly required: boolean;
  readonly how: string;
  readonly github?: "secret" | "variable";
  readonly vercel?: readonly VercelEnvironment[];
  readonly vercelSensitive?: boolean;
  readonly generate?: () => string;
};

const deployed: readonly VercelEnvironment[] = ["production", "preview"];

export const SECRET_SPECS: readonly SecretSpec[] = [
  {
    key: "NEXT_PUBLIC_SUPABASE_URL",
    required: true,
    how: "Supabase dashboard → Project Settings → API → Project URL",
    github: "secret",
    vercel: deployed,
  },
  {
    key: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    required: true,
    how: "Supabase dashboard → Project Settings → API Keys → anon / publishable key",
    vercel: deployed,
  },
  {
    key: "SUPABASE_SERVICE_ROLE_KEY",
    required: true,
    how: "Supabase dashboard → Project Settings → API Keys → service_role / secret key",
    github: "secret",
    vercel: deployed,
    vercelSensitive: true,
  },
  {
    key: "RATE_LIMIT_SALT",
    required: true,
    how: "Leave blank: generated for you",
    vercel: deployed,
    vercelSensitive: true,
    generate: () => randomBytes(32).toString("hex"),
  },
  {
    key: "NEXT_PUBLIC_SENTRY_DSN",
    required: false,
    how: "Sentry → Project Settings → Client Keys (DSN)",
    vercel: deployed,
  },
  {
    key: "SENTRY_ORG",
    required: false,
    how: "Sentry organization slug (from the Sentry URL)",
    github: "variable",
    vercel: deployed,
  },
  {
    key: "SENTRY_PROJECT",
    required: false,
    how: "Sentry project slug",
    github: "variable",
    vercel: deployed,
  },
  {
    key: "SENTRY_AUTH_TOKEN",
    required: false,
    how: "Sentry → Settings → Auth Tokens (scopes: project:read, event:read, project:releases)",
    github: "secret",
    vercel: deployed,
    vercelSensitive: true,
  },
  {
    key: "CLAUDE_CODE_OAUTH_TOKEN",
    required: true,
    how: "Run `claude setup-token` and paste the token",
    github: "secret",
  },
  {
    key: "EVOLUTION_BOT_TOKEN",
    required: false,
    how: "Only if needed: fine-grained PAT for this repo (Contents, Pull requests, Issues: read/write)",
    github: "secret",
  },
  {
    key: "VERCEL_TOKEN",
    required: false,
    how: "vercel.com/account/tokens → create a token (used by the guardian for instant rollback)",
    github: "secret",
  },
  {
    key: "VERCEL_ORG_ID",
    required: false,
    how: "Leave blank: read from .vercel/project.json after `vercel link`",
    github: "secret",
  },
  {
    key: "VERCEL_PROJECT_ID",
    required: false,
    how: "Leave blank: read from .vercel/project.json after `vercel link`",
    github: "secret",
  },
];

export function parseEnvFile(text: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match?.[1]) continue;
    const rawValue = match[2] ?? "";
    const quoted = /^(["'])(.*)\1$/.exec(rawValue);
    const value = quoted ? (quoted[2] ?? "") : rawValue.replace(/\s+#.*$/, "");
    values.set(match[1], value.trim());
  }
  return values;
}

export type SetupAction =
  | { readonly kind: "github-secret"; readonly key: string; readonly value: string }
  | { readonly kind: "github-variable"; readonly key: string; readonly value: string }
  | {
      readonly kind: "vercel-env";
      readonly key: string;
      readonly value: string;
      readonly environment: VercelEnvironment;
      readonly sensitive: boolean;
    };

export type SetupPlan = {
  readonly actions: readonly SetupAction[];
  readonly missingRequired: readonly SecretSpec[];
  readonly skippedOptional: readonly SecretSpec[];
  readonly generated: ReadonlyMap<string, string>;
};

export function planSetup(values: ReadonlyMap<string, string>, specs: readonly SecretSpec[] = SECRET_SPECS): SetupPlan {
  const actions: SetupAction[] = [];
  const missingRequired: SecretSpec[] = [];
  const skippedOptional: SecretSpec[] = [];
  const generated = new Map<string, string>();

  for (const spec of specs) {
    let value = values.get(spec.key) ?? "";
    if (value === "" && spec.generate) {
      value = spec.generate();
      generated.set(spec.key, value);
    }
    if (value === "") {
      (spec.required ? missingRequired : skippedOptional).push(spec);
      continue;
    }
    if (spec.github === "secret") actions.push({ kind: "github-secret", key: spec.key, value });
    if (spec.github === "variable") actions.push({ kind: "github-variable", key: spec.key, value });
    for (const environment of spec.vercel ?? []) {
      actions.push({ kind: "vercel-env", key: spec.key, value, environment, sensitive: spec.vercelSensitive ?? false });
    }
  }

  return { actions, missingRequired, skippedOptional, generated };
}

export function describeAction(action: SetupAction): string {
  switch (action.kind) {
    case "github-secret":
      return `GitHub secret    ${action.key}`;
    case "github-variable":
      return `GitHub variable  ${action.key}`;
    case "vercel-env":
      return `Vercel env       ${action.key} (${action.environment}${action.sensitive ? ", sensitive" : ""})`;
  }
}

export function envSetupTemplate(specs: readonly SecretSpec[] = SECRET_SPECS): string {
  const lines = [
    "# Copy to .env.setup (gitignored), fill in, check with: pnpm setup:secrets   then push with: pnpm setup:secrets --apply",
    "# Each value is pasted once here and pushed to GitHub secrets/variables and Vercel env.",
    "",
  ];
  for (const spec of specs) {
    lines.push(`# ${spec.required ? "REQUIRED" : "optional"} · ${spec.how}`);
    lines.push(`${spec.key}=`);
    lines.push("");
  }
  return lines.join("\n");
}
