import { db } from "@/lib/db"

import type { FeatureFlagView } from "@/features/admin/types"

/**
 * Feature Flags (admin.md Capability 4) — a thin read over `lib/
 * feature-flags.ts`'s own `FeatureFlag` table (phase-4c-technical-design.md
 * §7.1: "kept in lib/ since lib/ai//lib/email/ both need to read it — Admin
 * only needs to read/write it, never gains its own copy"). No authorization
 * check here, per this codebase's standing convention — `server/actions.ts`
 * is the one place `getCurrentAdminUser()` is checked before this (or the
 * toggle write) is ever called from a mutating path; the Server Component
 * that renders the Feature Flags screen is itself behind `app/admin/
 * layout.tsx`'s guard.
 *
 * Deliberately queries every row in the table rather than validating against
 * `lib/feature-flags.ts`'s `FeatureFlagKey` union — this view must render
 * whatever currently exists in the table, including a key a future phase has
 * since retired, gracefully (risk-register.md #36), not filter/crash against
 * a compile-time union that may have moved on since a given row was seeded.
 */
export async function getFeatureFlags(): Promise<FeatureFlagView[]> {
  const flags = await db.featureFlag.findMany({
    orderBy: { key: "asc" },
  })

  return flags.map((flag) => ({
    key: flag.key,
    enabled: flag.enabled,
    updatedAt: flag.updatedAt,
    updatedByUserId: flag.updatedByUserId,
  }))
}
