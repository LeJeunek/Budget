import { db } from "@/lib/db"

/**
 * The standalone feature-flag primitive (docs/architecture/
 * phase-4c-technical-design.md §6) — deliberately `lib/`-level infrastructure,
 * not an Admin-owned screen with its own private storage. The forcing
 * reason: `lib/ai/generate-structured-output.ts` and
 * `lib/email/send-notification-email.ts` must each check this from their own
 * single existing choke point, and this codebase's binding module-boundary
 * rule forbids either `lib/ai/` or `lib/email/` from ever importing a
 * feature module (including `features/admin/`) — the flag primitive must
 * live in `lib/` for the existing architecture to remain internally
 * consistent at all. `features/admin/server/feature-flags.ts` (a later
 * Backend Engineer dispatch) reads/writes this same table for Admin's own
 * Feature Flags screen; it never gains its own copy.
 */

/**
 * A plain TS string union, deliberately NOT a Prisma enum — the identical
 * expected-to-grow-without-a-migration reasoning as
 * `UserPreference.accentColor`/`currencyDisplay` and
 * `DashboardCardPreference.cardKey` (prisma/schema.prisma's own comments):
 * risk-register.md #32's standing rule requires a future phase to be able to
 * register a new flag key as a one-line constant-array change, never a
 * schema migration.
 */
export type FeatureFlagKey = "AI_FEATURES" | "EMAIL_DELIVERY"

/**
 * Short in-process TTL cache (risk-register.md #34's own non-binding
 * recommendation) so this check adds no meaningful latency to the AI/email
 * hot path it now sits in front of. Deliberately process-local, not a shared
 * cache (Redis, etc.) — this app introduces no caching-layer infrastructure
 * anywhere else (docs/database/performance-considerations.md), and a stale
 * read here is bounded to, at most, this TTL's own short window before the
 * next call re-checks the database.
 */
const CACHE_TTL_MS = 30_000

interface CacheEntry {
  enabled: boolean
  expiresAt: number
}

const cache = new Map<FeatureFlagKey, CacheEntry>()

/**
 * Reads `FeatureFlag.enabled` for `key`. **Fails OPEN, always** — a missing
 * row (defensive only; the two initial flags are seeded at deploy time, so
 * this is not the expected path) and a genuine read failure BOTH resolve to
 * `true`, per risk-register.md #34's explicit, binding requirement: a
 * transient database hiccup on this one small table must never spuriously
 * disable AI or email app-wide. This is the one deliberate asymmetry in this
 * function's design — there is no code path here that can ever resolve to
 * `false` except an explicit, successfully-read `enabled: false` row.
 */
export async function isFeatureEnabled(key: FeatureFlagKey): Promise<boolean> {
  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.enabled
  }

  try {
    const flag = await db.featureFlag.findUnique({ where: { key } })
    // Missing row -> fail open (`true`), not a thrown error and not `false`.
    const enabled = flag?.enabled ?? true
    cache.set(key, { enabled, expiresAt: Date.now() + CACHE_TTL_MS })
    return enabled
  } catch (error) {
    console.error(`[lib/feature-flags] Failed to read flag "${key}", failing open:`, error)
    // Deliberately NOT cached — a transient failure should be retried on the
    // very next call, not pinned as "enabled" for a full TTL window.
    return true
  }
}
