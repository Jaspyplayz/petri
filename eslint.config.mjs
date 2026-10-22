import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";
import tseslint from "typescript-eslint";
import { petriPlugin } from "./lint-rules/index.mjs";

const skippedTestMessage = "Do not skip or focus tests. Fix the test or the code: a skipped test is a weakened guardrail.";

const alwaysBanned = [
  {
    selector: "TSAsExpression[expression.type='TSAsExpression'][expression.typeAnnotation.type='TSUnknownKeyword']",
    message: "`as unknown as` bypasses the type checker. Narrow the value (Zod, a type guard) instead.",
  },
  {
    selector:
      "MemberExpression[object.name=/^(test|it|describe|suite)$/][property.name=/^(only|skip|skipIf|runIf|fixme|todo)$/]",
    message: skippedTestMessage,
  },
  {
    selector: "MemberExpression[object.property.name='describe'][property.name=/^(only|skip|fixme)$/]",
    message: skippedTestMessage,
  },
];

const effectsMessage =
  "Effects live only in src/shared/ui/effects/. Prefer a server component, an event handler, useSyncExternalStore or derived state.";
const envMessage = "Read environment variables only in src/shared/env.ts (Zod-validated).";
const defaultExportMessage = "Use named exports. Default exports are only for Next.js route files in src/app/.";

const effectHookImports = [
  { name: "react", importNames: ["useEffect", "useLayoutEffect", "useInsertionEffect"], message: effectsMessage },
];
const processImports = [
  { name: "process", message: envMessage },
  { name: "node:process", message: envMessage },
];
const playwrightTestImports = [
  {
    name: "@playwright/test",
    importNames: ["test"],
    message: "Import `test` from @/shared/testing/e2e-fixture so every e2e test fails on console and page errors.",
  },
];

const effectHookMembers = [
  { selector: "MemberExpression[property.name=/^use(Layout|Insertion)?Effect$/]", message: effectsMessage },
];
const defaultExports = [
  { selector: "ExportDefaultDeclaration", message: defaultExportMessage },
  { selector: "ExportSpecifier[exported.name='default']", message: defaultExportMessage },
  { selector: "ExportAllDeclaration[exported.name='default']", message: defaultExportMessage },
];

const problemsFixtureAccess = [
  {
    selector: "ObjectPattern > Property[key.name='problems']",
    message: "The console-error fixture belongs to the harness. Fix the error instead of reading or clearing `problems`.",
  },
];

function srcBans({
  allowEffects = false,
  allowDefaultExport = false,
  allowPlaywrightTest = false,
  banProblemsFixture = false,
} = {}) {
  return {
    "no-restricted-imports": [
      "error",
      {
        paths: [
          ...processImports,
          ...(allowEffects ? [] : effectHookImports),
          ...(allowPlaywrightTest ? [] : playwrightTestImports),
        ],
      },
    ],
    "no-restricted-syntax": [
      "error",
      ...alwaysBanned,
      ...(allowEffects ? [] : effectHookMembers),
      ...(allowDefaultExport ? [] : defaultExports),
      ...(banProblemsFixture ? problemsFixtureAccess : []),
    ],
  };
}

const nextRouteFiles = [
  "src/app/**/{page,layout,template,default,loading,error,global-error,not-found,forbidden,unauthorized}.tsx",
  "src/app/**/{icon,apple-icon,opengraph-image,twitter-image,sitemap,robots,manifest}.{ts,tsx}",
];

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  ...tseslint.configs.strictTypeChecked,
  {
    name: "petri/linter-options",
    linterOptions: {
      noInlineConfig: true,
      reportUnusedDisableDirectives: "error",
      reportUnusedInlineConfigs: "error",
    },
  },
  {
    name: "petri/type-safety",
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": ["error", { fixToUnknown: false, ignoreRestArgs: false }],
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-expect-error": true, "ts-ignore": true, "ts-nocheck": true, "ts-check": false },
      ],
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        { assertionStyle: "as", objectLiteralTypeAssertions: "allow-as-parameter" },
      ],
      "@typescript-eslint/switch-exhaustiveness-check": [
        "error",
        {
          allowDefaultCaseForExhaustiveSwitch: false,
          considerDefaultExhaustiveForUnions: false,
          requireDefaultForNonUnion: true,
        },
      ],
      "@typescript-eslint/no-unused-vars": "error",
      "@typescript-eslint/no-unused-expressions": "error",
      "no-restricted-syntax": ["error", ...alwaysBanned],
    },
  },
  {
    name: "petri/plain-js",
    files: ["**/*.{js,mjs,cjs}"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    name: "petri/a11y",
    files: ["**/*.tsx"],
    rules: {
      ...jsxA11y.flatConfigs.strict.rules,
      "jsx-a11y/alt-text": ["error", { elements: ["img"], img: ["Image"] }],
    },
  },
  {
    name: "petri/src",
    files: ["src/**/*.{ts,tsx}"],
    plugins: { petri: petriPlugin },
    rules: {
      "petri/no-comments": "error",
      "no-console": "warn",
      "no-restricted-properties": ["error", { object: "process", property: "env", message: envMessage }],
      ...srcBans(),
    },
  },
  {
    name: "petri/src/next-route-files",
    files: nextRouteFiles,
    rules: srcBans({ allowDefaultExport: true }),
  },
  {
    name: "petri/src/effects-allow-list",
    files: ["src/shared/ui/effects/**/*.{ts,tsx}"],
    rules: srcBans({ allowEffects: true }),
  },
  {
    name: "petri/src/e2e-tests",
    files: ["src/**/*.e2e.ts"],
    ignores: ["src/shared/testing/**"],
    rules: srcBans({ banProblemsFixture: true }),
  },
  {
    name: "petri/src/e2e-fixture",
    files: ["src/shared/testing/e2e-fixture.ts"],
    rules: srcBans({ allowPlaywrightTest: true }),
  },
  {
    name: "petri/src/env-reader",
    files: ["src/shared/env.ts"],
    rules: { "no-restricted-properties": "off" },
  },
  {
    name: "petri/src/log-sink",
    files: ["src/shared/lib/log.ts"],
    rules: { "no-console": "off" },
  },
  {
    name: "petri/src/server-only",
    files: ["src/**/server/**/*.{ts,tsx}", "src/shared/supabase/service-client.ts"],
    rules: { "petri/server-only-first": "error" },
  },
  {
    files: ["src/**/*.e2e.ts", "src/shared/testing/**"],
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "artifacts/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
    "src/shared/supabase/database.types.ts",
  ]),
]);
