/**
 * Client-safe shapes for `features/admin/` (docs/architecture/
 * phase-4c-technical-design.md §7). This feature owns no domain data of its
 * own — every shape below is either a narrow projection over another
 * domain's existing rows (`AdminUserSummary` over Better Auth's `User`/
 * `Session`; `AuditLogEntry` over five other domains' tables) or a thin view
 * over infrastructure Admin merely reads/writes (`FeatureFlagView` over
 * `lib/feature-flags.ts`'s own `FeatureFlag` table).
 */

// ---------------------------------------------------------------------------
// View Users (admin.md Capability 2)
// ---------------------------------------------------------------------------

/**
 * The account-directory projection `admin.server/users.ts`'s `getUsers`
 * returns. Deliberately, exhaustively enumerated — Capability 2 AC3's "never
 * a password, session token, or OAuth token, under any circumstance" is
 * enforced by construction here: this type has no field that could ever
 * hold one, and `getUsers`'s own Prisma `select` is scoped to exactly these
 * five fields, never a bare `db.user.findMany()` that could accidentally
 * widen later to include a credential column added to `User` in some future
 * phase.
 */
export interface AdminUserSummary {
  id: string
  email: string
  name: string
  emailVerified: boolean
  createdAt: Date
  /**
   * `MAX(Session.updatedAt)` for this user, per the CTO resolution pass's
   * already-decided "last active" definition (phase-4c-technical-design.md
   * §7.1) — `null` when the account has zero sessions (Capability 2's own
   * "no activity yet" edge case, never an error or a blank field).
   */
  lastActiveAt: Date | null
}

// ---------------------------------------------------------------------------
// Audit Log (admin.md Capability 3)
// ---------------------------------------------------------------------------

/**
 * The eight underlying event shapes `admin.server/audit-log.ts` composes,
 * collapsed into admin.md Capability 3 AC3's "filterable by at least event
 * type" vocabulary. `CATEGORY_SUGGESTION` alone covers both "generated" and
 * "accepted/rejected" (AC1's two related bullets) — a suggestion's lifecycle
 * outcome (PENDING/ACCEPTED/REJECTED) is carried on `AuditLogEntry.outcome`,
 * not split into a second event type, since AC2 already frames
 * accepted/rejected as an *outcome*, not a distinct kind of event.
 */
export type AuditLogEventType =
  | "CATEGORY_SUGGESTION"
  | "BUDGET_ADVISOR_GENERATION"
  | "MONTHLY_SUMMARY_GENERATION"
  | "SPENDING_INSIGHTS_GENERATION"
  | "HEALTH_SCORE_NARRATIVE_GENERATION"
  | "REPORT_GENERATED"
  | "NOTIFICATION_EMAIL"
  | "ADMIN_ACTION"

/** Per admin.md Capability 3 AC2's own enumerated outcome vocabulary. */
export type AuditLogOutcome =
  | "SUCCESS"
  | "FAILURE"
  | "ACCEPTED"
  | "REJECTED"
  | "DEGRADED"
  | "PENDING"

/**
 * One merged row in Admin's Audit Log — the common shape every one of
 * `audit-log.ts`'s eight underlying sources is projected into. Per
 * Capability 3 AC4, `summary` never carries a raw financial figure (an
 * amount, a balance) — only enough to identify the event (e.g. "a Monthly
 * Report was generated for July 2026").
 */
export interface AuditLogEntry {
  /** The underlying row's own id — unique only *within* `type`, never
   * globally (a `CategorySuggestion` row and a `Notification` row can share
   * the same cuid by pure coincidence of both using the same id generator;
   * `type` + `id` together is the real identity). */
  id: string
  type: AuditLogEventType
  /** The user the event concerns (Capability 3 AC2's "which user it
   * concerns"). For `ADMIN_ACTION` entries this is the acting admin, per
   * `AdminActionLog.adminUserId` — `null` exactly when that admin account
   * has since been removed (the schema's own "a historical record doesn't
   * get deleted along with what it refers to" precedent). */
  userId: string | null
  occurredAt: Date
  outcome: AuditLogOutcome
  summary: string
  /** Small, heterogeneous, per-type extra context for a detail view —
   * never a financial figure, per AC4. */
  details?: Record<string, unknown> | null
}

// ---------------------------------------------------------------------------
// Feature Flags (admin.md Capability 4)
// ---------------------------------------------------------------------------

/**
 * Thin view over `lib/feature-flags.ts`'s own `FeatureFlag` table (Admin
 * reads/writes this table; it never gains a second copy of the flag
 * primitive itself — phase-4c-technical-design.md §7.1). `key` is a plain
 * `string` here rather than `FeatureFlagKey` — this view is a read of
 * whatever rows currently exist in the table, and must render gracefully
 * even if a future phase's key doesn't (yet) match the current
 * `FeatureFlagKey` union (risk-register.md #36's "stale/renamed key degrades
 * gracefully" requirement, applied to this table's own key column).
 */
export interface FeatureFlagView {
  key: string
  enabled: boolean
  updatedAt: Date
  updatedByUserId: string | null
}

// ---------------------------------------------------------------------------
// AdminActionLog detail payloads — shared between the writer
// (`server/actions.ts`) and the reader (`server/audit-log.ts`) so both sides
// of `AdminActionLog.details`'s `Json?` column agree on its shape without a
// second, independently-drifting copy of the same three payload shapes.
// ---------------------------------------------------------------------------

export interface FeatureFlagToggledDetails {
  flagKey: string
  from: boolean
  to: boolean
}

export type CategoryTemplateChangeOperation = "CREATE" | "UPDATE" | "REORDER" | "DELETE"

export interface CategoryTemplateChangedDetails {
  operation: CategoryTemplateChangeOperation
  /** Omitted for REORDER, which has no single entry id of its own. */
  templateEntryId?: string
  name?: string
}

export interface DemoDataSeededDetails {
  success: boolean
  /** Present only when `success` is false — the caught error's message. */
  error?: string
}
