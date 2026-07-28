import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  {
    // Phase 4b, `features/reports/` — the CTO's binding directive
    // (docs/product/reports.md's binding constraint 1, restated in
    // docs/architecture/phase-4b-technical-design.md §8): Reports must never
    // call `lib/ai/`, directly or transitively. The Monthly Report's
    // narrative section is a verbatim, read-only reuse of an
    // already-persisted `MonthlySummary.narrative` field — every other
    // report type is exclusively numeric/tabular. This rule turns that
    // constraint into a build-time-enforced guarantee ("verified by
    // construction, not convention," per the design doc's own framing and
    // the AI Budget Advisor's identical precedent in ai-features.md Feature
    // 2's Definition of Done) rather than something a reviewer has to
    // remember to check by reading every diff.
    files: ["src/features/reports/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/ai", "@/lib/ai/*"],
              message:
                "features/reports/** must never import from lib/ai/, directly or transitively — reports.md's binding constraint 1. The Monthly Report's narrative is a verbatim, read-only reuse of the already-persisted MonthlySummary.narrative field (via dashboard.server/monthly-summary.getSummaryForMonth), never a newly generated one.",
            },
          ],
        },
      ],
    },
  },
  {
    // Phase 4b, `features/notifications/` — the same build-time enforcement
    // as `features/reports/**` above, for the identical reason
    // (docs/architecture/phase-4b-technical-design.md §8's recommendation,
    // restated for this module): Large Purchase and Low Balance are
    // deterministic, numeric-threshold-only triggers (notifications-v2.md's
    // binding constraint 1), and the Monthly Summary trigger only ever reads
    // the already-persisted `MonthlySummary.narrative` field verbatim — zero
    // new `lib/ai/` call sites anywhere in this feature. This rule turns
    // that "verified by construction, not convention" requirement into a
    // build-time-enforced guarantee.
    files: ["src/features/notifications/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/ai", "@/lib/ai/*"],
              message:
                "features/notifications/** must never import from lib/ai/, directly or transitively — notifications-v2.md's binding constraint 1 (Large Purchase/Low Balance are deterministic-only) and binding constraint 2 (Monthly Summary is a verbatim, read-only reuse of MonthlySummary.narrative, never a newly generated one).",
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
