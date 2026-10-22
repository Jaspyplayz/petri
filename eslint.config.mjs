import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";
import tseslint from "typescript-eslint";
import { petriPlugin } from "./lint-rules/index.mjs";

const skippedTestMessage = "Do not skip or focus tests. Fix the test or the code: a skipped test is a weakened guardrail.";

function testModifiers({ allowExpectedFailure = false } = {}) {
  return `/^(only|skip|skipIf|runIf|fixme|todo|fails${allowExpectedFailure ? "" : "|fail"})$/`;
}

function alwaysBanned(options) {
  return [
    {
      selector: "TSAsExpression[expression.type='TSAsExpression'][expression.typeAnnotation.type='TSUnknownKeyword']",
      message: "`as unknown as` bypasses the type checker. Narrow the value (Zod, a type guard) instead.",
    },
    {
      selector: `MemberExpression[object.name=/^(test|it|describe|suite)$/][property.name=${testModifiers(options)}]`,
      message: skippedTestMessage,
    },
    {
      selector: "MemberExpression[object.property.name='describe'][property.name=/^(only|skip|fixme)$/]",
      message: skippedTestMessage,
    },
  ];
}

function testFileBans(options) {
  const modifiers = testModifiers(options);
  return [
    {
      selector: `MemberExpression[property.name=${modifiers}]:not([object.name=/^(test|it|describe|suite|assert|expect)$/])`,
      message: skippedTestMessage,
    },
    { selector: `ObjectPattern > Property[key.name=${modifiers}]`, message: skippedTestMessage },
  ];
}

const effectsMessage =
  "Effects live only in src/shared/ui/effects/. Prefer a server component, an event handler, useSyncExternalStore or derived state.";
const envMessage = "Read environment variables only in src/shared/env.ts (Zod-validated).";
const consoleMessage = "Log through src/shared/lib/log.ts.";
const defaultExportMessage = "Use named exports. Default exports are only for Next.js route files in src/app/.";
const reactNamespaceMessage = 'Import React APIs by name (import { useState } from "react") so the effects ban sees every hook.';
const dynamicImportMessage = "Import restricted modules statically, and only by a fixed path, so the import bans see them.";
const fixtureMessage =
  "The console-error fixture belongs to the harness. Fix the error instead of reading, clearing or replacing `problems`.";
const harnessMessage =
  "Use the page and context fixtures from @/shared/testing/e2e-fixture. Fixture overrides, removed listeners and other browsers or contexts skip the console-error check.";

const effectHookName = "/^use(Layout|Insertion)?Effect$/";
const effectHookImports = [
  { name: "react", importNames: ["useEffect", "useLayoutEffect", "useInsertionEffect"], message: effectsMessage },
];
const processImports = [
  { name: "process", message: envMessage },
  { name: "node:process", message: envMessage },
];
const playwrightImports = {
  group: ["@playwright/test", "@playwright/test/*", "playwright", "playwright/*", "playwright-core", "playwright-core/*"],
  message: "Import `test` and `expect` from @/shared/testing/e2e-fixture so every e2e test fails on console and page errors.",
};

const effectHookAccess = [
  { selector: `Identifier[name=${effectHookName}]:not(ImportSpecifier > Identifier)`, message: effectsMessage },
  { selector: `Literal[value=${effectHookName}]`, message: effectsMessage },
  { selector: `TemplateElement[value.raw=${effectHookName}]`, message: effectsMessage },
  {
    selector:
      "ImportDeclaration[source.value='react'][importKind!='type'] > :matches(ImportNamespaceSpecifier, ImportDefaultSpecifier)",
    message: reactNamespaceMessage,
  },
];
const globalsAccess = [
  { selector: "ObjectPattern > Property[key.name=/^(console|process)$/]", message: `${consoleMessage} ${envMessage}` },
  { selector: "ObjectPattern > Property[key.value=/^(console|process)$/]", message: `${consoleMessage} ${envMessage}` },
];
const dynamicImports = [
  { selector: "ImportExpression[source.type!='Literal']", message: dynamicImportMessage },
  {
    selector: "ImportExpression[source.value=/^(react|process|node:process|@playwright\\/test|playwright(-core)?)(\\/|$)/]",
    message: dynamicImportMessage,
  },
];
const defaultExports = [
  { selector: "ExportDefaultDeclaration", message: defaultExportMessage },
  { selector: "ExportSpecifier[exported.name='default']", message: defaultExportMessage },
  { selector: "ExportAllDeclaration[exported.name='default']", message: defaultExportMessage },
];
const e2eBans = [
  { selector: "Property[key.name='problems']", message: fixtureMessage },
  { selector: "Property[key.value='problems']", message: fixtureMessage },
  { selector: "MemberExpression[property.name='problems']", message: fixtureMessage },
  { selector: "CallExpression[callee.property.name='extend']", message: harnessMessage },
  {
    selector: "MemberExpression[property.name=/^(removeAllListeners|removeListener|off|browser|newContext)$/]",
    message: harnessMessage,
  },
  { selector: "ObjectPattern > Property[key.name=/^(browser|browserType|playwright)$/]", message: harnessMessage },
];

function restrictedGlobals({ allowProcess = false, allowConsole = false } = {}) {
  return [
    "error",
    {
      globals: [
        ...(allowProcess ? [] : [{ name: "process", message: envMessage }]),
        ...(allowConsole ? [] : [{ name: "console", message: consoleMessage }]),
      ],
      checkGlobalObject: true,
      globalObjects: ["global"],
    },
  ];
}

function srcBans({
  allowEffects = false,
  allowDefaultExport = false,
  allowPlaywright = false,
  allowExpectedFailure = false,
  testFile = false,
  e2eFile = false,
} = {}) {
  return {
    "no-restricted-imports": [
      "error",
      {
        paths: [...processImports, ...(allowEffects ? [] : effectHookImports)],
        ...(allowPlaywright ? {} : { patterns: [playwrightImports] }),
      },
    ],
    "no-restricted-syntax": [
      "error",
      ...alwaysBanned({ allowExpectedFailure }),
      ...globalsAccess,
      ...dynamicImports,
      ...(allowEffects ? [] : effectHookAccess),
      ...(allowDefaultExport ? [] : defaultExports),
      ...(testFile ? testFileBans({ allowExpectedFailure }) : []),
      ...(e2eFile ? e2eBans : []),
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
      "no-restricted-syntax": ["error", ...alwaysBanned()],
    },
  },
  {
    name: "petri/tests",
    files: ["**/*.test.{ts,tsx}"],
    ignores: ["src/**"],
    rules: { "no-restricted-syntax": ["error", ...alwaysBanned(), ...testFileBans()] },
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
      "no-console": "error",
      "no-restricted-globals": restrictedGlobals(),
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
    name: "petri/src/unit-tests",
    files: ["src/**/*.test.{ts,tsx}"],
    rules: srcBans({ testFile: true }),
  },
  {
    name: "petri/src/e2e-tests",
    files: ["src/**/*.e2e.ts"],
    ignores: ["src/shared/testing/**"],
    rules: srcBans({ testFile: true, e2eFile: true }),
  },
  {
    name: "petri/src/e2e-fixture-self-test",
    files: ["src/shared/testing/**/*.e2e.ts"],
    rules: srcBans({ testFile: true, allowExpectedFailure: true }),
  },
  {
    name: "petri/src/e2e-fixture",
    files: ["src/shared/testing/e2e-fixture.ts"],
    rules: srcBans({ allowPlaywright: true }),
  },
  {
    name: "petri/src/env-reader",
    files: ["src/shared/env.ts"],
    rules: { "no-restricted-properties": "off", "no-restricted-globals": restrictedGlobals({ allowProcess: true }) },
  },
  {
    name: "petri/src/log-sink",
    files: ["src/shared/lib/log.ts"],
    rules: { "no-console": "off", "no-restricted-globals": restrictedGlobals({ allowConsole: true }) },
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
