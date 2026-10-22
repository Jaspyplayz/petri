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
