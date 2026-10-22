import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
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
