import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import playwright from "eslint-plugin-playwright";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist", "coverage", "playwright-report", "test-results"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      {
        rules: {
          "react-refresh/only-export-components": [
            "error",
            { allowConstantExport: true, allowExportNames: ["useAuthModal"] },
          ],
          // Design-system guard: no raw Tailwind gray-* classes and no arbitrary
          // hex color classes (bg-[#...]) in markup. Use semantic tokens instead
          // (bg-surface/bg-raised/bg-overlay, text-fg/-muted/-subtle, border-line,
          // bg-canvas, bg-rail, accent/danger/success/warning/info). Semantic
          // state-color families (red/green/amber/blue/…) remain allowed. The
          // [var(--accent)] form is fine — only literal -[#hex] is blocked.
          "no-restricted-syntax": [
            "error",
            {
              selector: "Literal[value=/-gray-[0-9]/]",
              message:
                "Raw gray-* class is banned — use a semantic token (bg-surface/text-fg/border-line/etc).",
            },
            {
              selector: "TemplateElement[value.raw=/-gray-[0-9]/]",
              message:
                "Raw gray-* class is banned — use a semantic token (bg-surface/text-fg/border-line/etc).",
            },
            {
              selector: "Literal[value=/-\\[#[0-9a-fA-F]/]",
              message:
                "Arbitrary hex color class (bg-[#...]) is banned — use a semantic token or the accent var.",
            },
            {
              selector: "TemplateElement[value.raw=/-\\[#[0-9a-fA-F]/]",
              message:
                "Arbitrary hex color class (bg-[#...]) is banned — use a semantic token or the accent var.",
            },
          ],
        },
      },
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // Playwright E2E specs + page objects: enforce the practices the harness
    // already follows by hand (no hard sleeps, no focused/conditional tests,
    // every expect asserts, awaited assertions).
    files: ["tests/e2e/**/*.ts", "tests/pages/**/*.ts"],
    extends: [playwright.configs["flat/recommended"]],
    rules: {
      "playwright/no-wait-for-timeout": "error",
      "playwright/no-conditional-in-test": "warn",
      // Off: specs assert through page-object helpers (channel.expectMessage,
      // shell.expectChannelVisible, …). expect-expect can't see the expect()
      // across the file boundary, so it false-positives the good POM pattern.
      "playwright/expect-expect": "off",
      // Off: every force:true in the suite is deliberate — hover-revealed
      // buttons and click-through-backdrop dismissals that actionability
      // checks would refuse.
      "playwright/no-force-option": "off",
      // Runtime test.skip(cond, reason) dependency guards are fine; only the
      // unconditional annotation form stays flagged.
      "playwright/no-skipped-test": ["warn", { allowConditional: true }],
    },
  },
]);
