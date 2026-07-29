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
  {
    // Phase 4c, `features/calendar/server/` — turns
    // phase-4c-technical-design.md §2.2's "verified by construction, not
    // convention" guarantee into a build-time check, the same recommendation
    // and pattern as the two rules above: this is a pure composition layer
    // over Bills' and Recurring Income's own already-exported service
    // functions, and must never gain a direct database dependency or reach
    // into either domain's pure status-math modules (which would let
    // business logic quietly get duplicated/re-derived here instead of
    // staying owned by the domain that already computes it once).
    files: ["src/features/calendar/server/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/db", "@/lib/db/*", "@prisma/client"],
              message:
                "features/calendar/server/** must never import from lib/db or @prisma/client, directly — phase-4c-technical-design.md §2.2. This module is pure composition over bills.server/service.ts's and recurring-income.server/service.ts's own already-exported functions; it has no data of its own to query.",
            },
            {
              group: [
                "@/features/bills/server/occurrence",
                "@/features/recurring-income/server/occurrence",
              ],
              message:
                "features/calendar/server/** must never import either domain's pure status-math module directly — every occurrence's status is already computed once by bills.server/service.ts / recurring-income.server/service.ts's own exported functions; re-deriving it here would duplicate business logic this composition layer must not own.",
            },
          ],
        },
      ],
    },
  },
  {
    // Phase 4c, `features/admin/` — the same build-time enforcement as
    // `features/reports/**`/`features/notifications/**` above, for the
    // identical reason (phase-4c-technical-design.md §9's explicit
    // recommendation): admin.md's carried-over scope item 4 states none of
    // Admin's six capabilities generate, call, or depend on AI-generated
    // content — the Audit Log capability only *surfaces* records of AI
    // feature usage 4a/4b already produced (via the already-existing
    // generation-cache tables' own `generatedAt`/nullable-content columns),
    // it never calls a model itself. This rule turns that "zero new lib/ai/
    // call sites" confirmation into a build-time-enforced guarantee.
    files: ["src/features/admin/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/ai", "@/lib/ai/*"],
              message:
                "features/admin/** must never import from lib/ai/, directly or transitively — admin.md's carried-over scope item 4. The Audit Log surfaces already-persisted records of AI feature usage (generation-cache tables' generatedAt/nullable-content signal); it never generates new AI content itself.",
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
