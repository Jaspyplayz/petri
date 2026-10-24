/** @type {import("dependency-cruiser").IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "feature-imports-another-feature",
      comment: "A feature may import src/shared/ and its own files, never another feature.",
      severity: "error",
      from: { path: "^src/features/([^/]+)/" },
      to: { path: "^src/features/", pathNot: "^src/features/$1/" },
    },
    {
      name: "feature-imports-app",
      comment: "Features never import routes; routes compose features.",
      severity: "error",
      from: { path: "^src/features/" },
      to: { path: "^src/app/" },
    },
    {
      name: "shared-imports-feature-or-app",
      comment: "src/shared/ is the bottom layer and never imports features or routes.",
      severity: "error",
      from: { path: "^src/shared/" },
      to: { path: "^src/(features|app)/" },
    },
    {
      name: "service-client-outside-server",
      comment:
        "Only server/ folders and src/shared/supabase/ may import the service-role client. Automerge requires trust level 3 for both, while lib/ or components/ code can auto-merge at level 1 or 2.",
      severity: "error",
      from: { pathNot: ["(^|/)server/", "^src/shared/supabase/"] },
      to: { path: "^src/shared/supabase/service-client\\.ts$" },
    },
    {
      name: "app-imports-feature-internals",
      comment: "Routes may import a feature only through its index.ts.",
      severity: "error",
      from: { path: "^src/app/" },
      to: { path: "^src/features/", pathNot: "^src/features/[^/]+/index\\.ts$" },
    },
    {
      name: "outside-src-imports-feature-internals",
      comment: "Root files under src/ (instrumentation, proxy) may import a feature only through its index.ts.",
      severity: "error",
      from: { path: "^src/[^/]+$" },
      to: { path: "^src/features/", pathNot: "^src/features/[^/]+/index\\.ts$" },
    },
    {
      name: "src-top-level-folder",
      comment: "src/ holds app/, features/, shared/ and root files (instrumentation, proxy). Other folders would sit outside the rules.",
      severity: "error",
      from: { path: "^src/(?!(app|features|shared)/)[^/]+/" },
      to: {},
    },
    {
      name: "import-into-src-top-level-folder",
      comment: "src/ holds app/, features/, shared/ and root files (instrumentation, proxy). Other folders would sit outside the rules.",
      severity: "error",
      from: {},
      to: { path: "^src/(?!(app|features|shared)/)[^/]+/" },
    },
    {
      name: "unresolvable-import",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "circular-import",
      severity: "error",
      from: {},
      to: { circular: true },
    },
  ],
  allowed: [
    {
      comment: "Packages and Node built-ins.",
      from: {},
      to: { dependencyTypes: ["npm", "npm-dev", "npm-optional", "npm-peer", "core"] },
    },
    {
      comment: "A feature imports its own files.",
      from: { path: "^src/features/([^/]+)/" },
      to: { path: "^src/features/$1/" },
    },
    {
      comment: "Features, routes and root files import src/shared/, and src/shared/ imports only itself.",
      from: { path: "^src/((app|features|shared)/|[^/]+$)" },
      to: { path: "^src/shared/", pathNot: "^src/shared/supabase/service-client\\.ts$" },
    },
    {
      comment: "Server folders and src/shared/supabase/ import the service-role client.",
      from: { path: ["(^|/)server/", "^src/shared/supabase/"] },
      to: { path: "^src/shared/supabase/service-client\\.ts$" },
    },
    {
      comment: "The registry lists the feature manifests.",
      from: { path: "^src/features/registry\\.ts$" },
      to: { path: "^src/features/[^/]+/feature\\.manifest\\.ts$" },
    },
    {
      comment: "Routes and root files import features only through their index.ts.",
      from: { path: "^src/(app/|[^/]+$)" },
      to: { path: "^src/features/[^/]+/index\\.ts$" },
    },
    {
      comment: "Routes import other route files.",
      from: { path: "^src/app/" },
      to: { path: "^src/app/" },
    },
  ],
  allowedSeverity: "error",
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      mainFields: ["module", "main", "types", "typings"],
    },
  },
};
