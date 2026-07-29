import { db } from "@/lib/db"
import type { AdminActionType, CategorySuggestionStatus, Prisma } from "@prisma/client"

import { getReportGenerationEvents } from "@/features/reports/server/audit"
import type {
  AuditLogEntry,
  AuditLogEventType,
  AuditLogOutcome,
  CategoryTemplateChangedDetails,
  DemoDataSeededDetails,
  FeatureFlagToggledDetails,
} from "@/features/admin/types"

/**
 * Audit Logs (admin.md Capability 3) — a pure composition layer merging
 * eight already-existing per-domain reads into one filterable, paginated
 * view (phase-4c-technical-design.md §7.1). Same "leaf, zero business logic
 * of its own" shape as `features/calendar/server/service.ts` — this file
 * computes no outcome that isn't already visible on the source row itself
 * (a null `narrative`/`recommendations`/`insights` column already IS the
 * "did this generation succeed or degrade" signal each owning domain's own
 * schema comment already establishes; this file only reads it and gives it
 * a name).
 *
 * **This is one of this codebase's first-ever query functions not scoped to
 * a single authenticated user's own data** (risk-register.md #33) — a
 * deliberate, narrow exception to risk-register.md #4's standing rule, safe
 * **only** because this function is never called from anywhere except
 * `features/admin/server/actions.ts` and Admin's own `getCurrentAdminUser()`
 * -gated Server Components. This file performs no authorization check
 * itself, per this codebase's standing convention.
 *
 * **Never displays a raw financial figure** (admin.md Capability 3 AC4) —
 * every `summary` string below identifies the event (who/what/when/outcome)
 * without ever interpolating an amount, balance, or other cited figure, even
 * though several of the underlying rows (`BudgetAdvisorCache.recommendations`,
 * `MonthlySummary.citedFigures`) contain exactly that kind of content.
 *
 * ## Pagination: a keyset merge across eight independently-sorted streams
 *
 * Each of the eight source-specific fetchers below independently returns up
 * to `PAGE_SIZE` rows, sorted descending by its own timestamp column,
 * bounded by the same `[gte, lt)` window. This is the standard "merge the
 * top-K of each stream" keyset technique: any row that could possibly land
 * in the final merged top `PAGE_SIZE` must, by definition, already be within
 * its own source's local top `PAGE_SIZE` after the same lower/upper bound —
 * so fetching `PAGE_SIZE` from every source and merging is guaranteed to
 * produce a globally-correct top `PAGE_SIZE`, not an approximation.
 *
 * The one accepted, documented imprecision: the cursor's upper bound
 * (`occurredAt < cursor.occurredAt`) is applied identically across all eight
 * sources regardless of which source the cursor row actually came from. If
 * two rows from *different* sources share the exact same millisecond
 * timestamp and land exactly on a page boundary, a genuinely rare
 * coincidence across independently-timestamped domains, one could in
 * principle be skipped on the next page. This is an acceptable, narrow
 * tradeoff for an internal-only observability view (never a financial
 * figure, never a correctness-critical read) in exchange for not having to
 * invent a compound, cross-table tie-breaking scheme.
 */

const PAGE_SIZE = 50

export interface GetAuditLogOptions {
  type?: AuditLogEventType
  start?: Date
  end?: Date
  /** Base64-encoded `{ occurredAt, id }` of the last row from the previous
   * page. Omit for the first page. */
  cursor?: string
}

export interface GetAuditLogResult {
  entries: AuditLogEntry[]
  nextCursor: string | null
}

interface CursorPayload {
  occurredAt: string
  id: string
}

function encodeCursor(entry: Pick<AuditLogEntry, "occurredAt" | "id">): string {
  const payload: CursorPayload = { occurredAt: entry.occurredAt.toISOString(), id: entry.id }
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64")
}

function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64").toString("utf8")) as unknown
    if (
      typeof decoded === "object" &&
      decoded !== null &&
      typeof (decoded as CursorPayload).occurredAt === "string" &&
      typeof (decoded as CursorPayload).id === "string"
    ) {
      return decoded as CursorPayload
    }
    return null
  } catch {
    return null
  }
}

/** The shared `[gte, lt)` timestamp bound every source fetcher applies to
 * its own timestamp column — `lt` is the tighter of `end` and the decoded
 * cursor's `occurredAt` (both are already exclusive upper bounds, so taking
 * the minimum combines them correctly). Prisma silently omits an `undefined`
 * key from a `where` filter, so passing this object directly as a column's
 * filter value (`{ createdAt: window }`) is equivalent to no constraint on
 * whichever bound(s) weren't supplied. */
interface TimeWindow {
  gte?: Date
  lt?: Date
}

function resolveWindow(options: GetAuditLogOptions): TimeWindow {
  const cursor = options.cursor ? decodeCursor(options.cursor) : null
  const cursorDate = cursor ? new Date(cursor.occurredAt) : undefined

  const lt =
    options.end && cursorDate
      ? new Date(Math.min(options.end.getTime(), cursorDate.getTime()))
      : cursorDate ?? options.end

  return { gte: options.start, lt }
}

function formatMonthLabel(month: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(month)
}

function formatDateLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(date)
}

const REPORT_TYPE_LABELS: Record<string, string> = {
  MONTHLY: "Monthly",
  YEARLY: "Yearly",
  TAX_SUMMARY: "Tax Summary",
  INCOME: "Income",
  EXPENSE: "Expense",
  CASH_FLOW: "Cash Flow",
}

// ---------------------------------------------------------------------------
// Source 1 — Transactions' CategorySuggestion history (admin.md Capability 3
// AC1's "each ... suggestion generated" and "category suggestion
// accept/reject decisions" bullets, collapsed into one event type per
// features/admin/types.ts's own doc comment — the lifecycle outcome is
// carried on `outcome`, not split into a second event type).
// ---------------------------------------------------------------------------

function describeSuggestionStatus(status: CategorySuggestionStatus): string {
  switch (status) {
    case "PENDING":
      return "generated, awaiting a decision"
    case "ACCEPTED":
      return "accepted"
    case "REJECTED":
      return "rejected"
  }
}

function mapSuggestionOutcome(status: CategorySuggestionStatus): AuditLogOutcome {
  switch (status) {
    case "PENDING":
      return "PENDING"
    case "ACCEPTED":
      return "ACCEPTED"
    case "REJECTED":
      return "REJECTED"
  }
}

async function fetchCategorySuggestionEntries(window: TimeWindow): Promise<AuditLogEntry[]> {
  const rows = await db.categorySuggestion.findMany({
    where: { createdAt: window },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
    select: { id: true, userId: true, status: true, source: true, createdAt: true },
  })

  return rows.map((row) => ({
    id: row.id,
    type: "CATEGORY_SUGGESTION" as const,
    userId: row.userId,
    occurredAt: row.createdAt,
    outcome: mapSuggestionOutcome(row.status),
    summary: `${row.source === "AUTOMATIC" ? "Automatic" : "Manual reconsider"} category suggestion — ${describeSuggestionStatus(row.status)}`,
    details: { source: row.source, status: row.status },
  }))
}

// ---------------------------------------------------------------------------
// Source 2 — Notifications' Notification.emailSentAt/emailSendError (admin.md
// Capability 3 AC1's "each notification email attempted" bullet). Only rows
// where an email was actually attempted (success or failure) are included —
// an in-app-only notification (no email configured for its type) never
// appears here, since it never attempted an email send at all.
// ---------------------------------------------------------------------------

async function fetchNotificationEmailEntries(window: TimeWindow): Promise<AuditLogEntry[]> {
  const rows = await db.notification.findMany({
    where: {
      createdAt: window,
      OR: [{ emailSentAt: { not: null } }, { emailSendError: { not: null } }],
    },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
    select: {
      id: true,
      userId: true,
      type: true,
      emailSentAt: true,
      emailSendError: true,
      createdAt: true,
    },
  })

  return rows.map((row) => ({
    id: row.id,
    type: "NOTIFICATION_EMAIL" as const,
    userId: row.userId,
    // `Notification` has no dedicated "email attempted at" column distinct
    // from its own `createdAt` (email dispatch runs once, immediately, for
    // each newly-created row, per `email-dispatch.ts`'s own doc comment) —
    // `createdAt` is used uniformly here rather than `emailSentAt` (which is
    // null on a failed attempt) so every attempt, success or failure, sorts
    // and filters on the exact same column.
    occurredAt: row.createdAt,
    outcome: row.emailSendError ? "FAILURE" : "SUCCESS",
    summary: `${row.type} notification email ${row.emailSendError ? "failed to send" : "sent"}`,
    details: row.emailSendError
      ? { notificationType: row.type, error: row.emailSendError }
      : { notificationType: row.type },
  }))
}

// ---------------------------------------------------------------------------
// Sources 3-6 — the AI generation-cache tables' generatedAt/nullable-content
// -as-outcome signal (admin.md Capability 3 AC1's "each AI Budget Advisor /
// Monthly Summary / Spending Insights / Financial Health Score narrative
// generation attempt" bullet). Each of these is a single mutable
// cache/snapshot row per (user, period) — updated on every generation
// *attempt*, success or failure — not an append-only log, so this view shows
// each row's own most recent attempt, not a full history of every past
// attempt for that period (the same limitation the underlying tables
// themselves accept, per their own schema comments).
// ---------------------------------------------------------------------------

async function fetchBudgetAdvisorEntries(window: TimeWindow): Promise<AuditLogEntry[]> {
  const rows = await db.budgetAdvisorCache.findMany({
    where: { generatedAt: window },
    orderBy: { generatedAt: "desc" },
    take: PAGE_SIZE,
    select: { id: true, userId: true, month: true, recommendations: true, generatedAt: true },
  })

  return rows.map((row) => ({
    id: row.id,
    type: "BUDGET_ADVISOR_GENERATION" as const,
    userId: row.userId,
    occurredAt: row.generatedAt,
    outcome: row.recommendations ? "SUCCESS" : "DEGRADED",
    summary: `Budget Advisor generated for ${formatMonthLabel(row.month)}`,
  }))
}

async function fetchMonthlySummaryEntries(window: TimeWindow): Promise<AuditLogEntry[]> {
  const rows = await db.monthlySummary.findMany({
    where: { generatedAt: window },
    orderBy: { generatedAt: "desc" },
    take: PAGE_SIZE,
    select: { id: true, userId: true, month: true, narrative: true, generatedAt: true },
  })

  return rows.map((row) => ({
    id: row.id,
    type: "MONTHLY_SUMMARY_GENERATION" as const,
    userId: row.userId,
    occurredAt: row.generatedAt,
    outcome: row.narrative ? "SUCCESS" : "DEGRADED",
    summary: `Monthly Summary generated for ${formatMonthLabel(row.month)}`,
  }))
}

async function fetchSpendingInsightsEntries(window: TimeWindow): Promise<AuditLogEntry[]> {
  const rows = await db.spendingInsightsCache.findMany({
    where: { generatedAt: window },
    orderBy: { generatedAt: "desc" },
    take: PAGE_SIZE,
    select: { id: true, userId: true, period: true, insights: true, generatedAt: true },
  })

  return rows.map((row) => ({
    id: row.id,
    type: "SPENDING_INSIGHTS_GENERATION" as const,
    userId: row.userId,
    occurredAt: row.generatedAt,
    outcome: row.insights ? "SUCCESS" : "DEGRADED",
    summary: `Spending Insights generated for period "${row.period}"`,
  }))
}

/**
 * Financial Health Score's audit entry covers ONLY the narrative layer, per
 * Feature Flags AC2's own "the Health Score's own deterministic numeric
 * formula" carve-out — `totalScore`/component scores have zero AI
 * dependency and are never gated by the AI_FEATURES flag, so this entry's
 * outcome is keyed off `narrative`'s nullability, never `totalScore`'s.
 */
async function fetchHealthScoreNarrativeEntries(window: TimeWindow): Promise<AuditLogEntry[]> {
  const rows = await db.financialHealthScoreSnapshot.findMany({
    where: { capturedAt: window },
    orderBy: { capturedAt: "desc" },
    take: PAGE_SIZE,
    select: { id: true, userId: true, capturedDate: true, narrative: true, capturedAt: true },
  })

  return rows.map((row) => ({
    id: row.id,
    type: "HEALTH_SCORE_NARRATIVE_GENERATION" as const,
    userId: row.userId,
    occurredAt: row.capturedAt,
    outcome: row.narrative ? "SUCCESS" : "DEGRADED",
    summary: `Financial Health Score narrative generated for ${formatDateLabel(row.capturedDate)}`,
  }))
}

// ---------------------------------------------------------------------------
// Source 7 — Reports' NEW getReportGenerationEvents (§5.3). Delegated to
// verbatim rather than queried directly — Reports owns
// `ReportGenerationEvent`, this file only composes its already-projected,
// audit-log-safe summary shape.
// ---------------------------------------------------------------------------

async function fetchReportGenerationEntries(window: TimeWindow): Promise<AuditLogEntry[]> {
  const events = await getReportGenerationEvents({ start: window.gte, end: window.lt })

  return events.map((event) => ({
    id: event.id,
    type: "REPORT_GENERATED" as const,
    userId: event.userId,
    occurredAt: event.generatedAt,
    // `ReportGenerationEvent` rows are written only on the success path
    // (features/reports/server/service.ts's generateReport, §5.2) — every
    // row here IS a success, by construction.
    outcome: "SUCCESS" as const,
    summary: `${REPORT_TYPE_LABELS[event.type] ?? event.type} report generated for ${event.periodLabel}`,
  }))
}

// ---------------------------------------------------------------------------
// Source 8 — AdminActionLog (§6.2) — Admin's own native actions (feature
// flag toggles, starter-category template edits, demo-data seed triggers).
// `details`'s shape is shared with the writer, `server/actions.ts`, via
// features/admin/types.ts, so both sides of this Json column agree without
// a second, independently-drifting copy of the same three payload shapes.
// ---------------------------------------------------------------------------

function describeAdminAction(
  action: AdminActionType,
  details: Record<string, unknown> | null,
): { outcome: AuditLogOutcome; summary: string } {
  switch (action) {
    case "FEATURE_FLAG_TOGGLED": {
      const d = details as Partial<FeatureFlagToggledDetails> | null
      return {
        outcome: "SUCCESS",
        summary: d?.flagKey
          ? `Feature flag "${d.flagKey}" toggled ${String(d.from)} → ${String(d.to)}`
          : "Feature flag toggled",
      }
    }
    case "CATEGORY_TEMPLATE_CHANGED": {
      const d = details as Partial<CategoryTemplateChangedDetails> | null
      const operation = d?.operation ? d.operation.toLowerCase() : "changed"
      return {
        outcome: "SUCCESS",
        summary: `Starter-category template ${operation}${d?.name ? ` — "${d.name}"` : ""}`,
      }
    }
    case "DEMO_DATA_SEEDED": {
      const d = details as Partial<DemoDataSeededDetails> | null
      const success = d?.success !== false
      return {
        outcome: success ? "SUCCESS" : "FAILURE",
        summary: success
          ? "Demo data seed triggered — succeeded"
          : `Demo data seed triggered — failed${d?.error ? `: ${d.error}` : ""}`,
      }
    }
  }
}

async function fetchAdminActionEntries(window: TimeWindow): Promise<AuditLogEntry[]> {
  const rows = await db.adminActionLog.findMany({
    where: { createdAt: window },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
    select: { id: true, adminUserId: true, action: true, details: true, createdAt: true },
  })

  return rows.map((row) => {
    const details = normalizeJsonDetails(row.details)
    const { outcome, summary } = describeAdminAction(row.action, details)
    return {
      id: row.id,
      type: "ADMIN_ACTION" as const,
      userId: row.adminUserId,
      occurredAt: row.createdAt,
      outcome,
      summary,
      details,
    }
  })
}

function normalizeJsonDetails(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

type SourceFetcher = (window: TimeWindow) => Promise<AuditLogEntry[]>

const SOURCE_FETCHERS: Record<AuditLogEventType, SourceFetcher> = {
  CATEGORY_SUGGESTION: fetchCategorySuggestionEntries,
  NOTIFICATION_EMAIL: fetchNotificationEmailEntries,
  BUDGET_ADVISOR_GENERATION: fetchBudgetAdvisorEntries,
  MONTHLY_SUMMARY_GENERATION: fetchMonthlySummaryEntries,
  SPENDING_INSIGHTS_GENERATION: fetchSpendingInsightsEntries,
  HEALTH_SCORE_NARRATIVE_GENERATION: fetchHealthScoreNarrativeEntries,
  REPORT_GENERATED: fetchReportGenerationEntries,
  ADMIN_ACTION: fetchAdminActionEntries,
}

/**
 * Returns up to `PAGE_SIZE` audit entries, most-recent-first, optionally
 * filtered by `type` and/or a `[start, end)` `occurredAt` range (admin.md
 * Capability 3 AC3). See this file's header comment for the merge/pagination
 * algorithm.
 */
export async function getAuditLog(
  options: GetAuditLogOptions = {},
): Promise<GetAuditLogResult> {
  const window = resolveWindow(options)
  const fetchers = options.type ? [SOURCE_FETCHERS[options.type]] : Object.values(SOURCE_FETCHERS)

  const results = await Promise.all(fetchers.map((fetch) => fetch(window)))
  const merged = results
    .flat()
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
  const page = merged.slice(0, PAGE_SIZE)

  const last = page[page.length - 1]
  const nextCursor = page.length === PAGE_SIZE && last ? encodeCursor(last) : null

  return { entries: page, nextCursor }
}
