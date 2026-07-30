import type { AuditLogEventType, AuditLogOutcome } from "@/features/admin/types"

/**
 * Display vocabulary for `AuditLogEventType`/`AuditLogOutcome`
 * (`features/admin/types.ts`) — shared between `audit-log-filters.tsx` (the
 * type-filter dropdown) and `audit-log-table.tsx` (each row's badge) so both
 * sides of the same vocabulary can't independently drift out of sync.
 */

export const AUDIT_LOG_EVENT_TYPE_LABELS: Record<AuditLogEventType, string> = {
  CATEGORY_SUGGESTION: "Category Suggestion",
  BUDGET_ADVISOR_GENERATION: "Budget Advisor Generation",
  MONTHLY_SUMMARY_GENERATION: "Monthly Summary Generation",
  SPENDING_INSIGHTS_GENERATION: "Spending Insights Generation",
  HEALTH_SCORE_NARRATIVE_GENERATION: "Health Score Narrative Generation",
  REPORT_GENERATED: "Report Generated",
  NOTIFICATION_EMAIL: "Notification Email",
  ADMIN_ACTION: "Admin Action",
}

type BadgeVariant = "default" | "secondary" | "destructive" | "outline"

export const AUDIT_LOG_OUTCOME_BADGE_VARIANT: Record<AuditLogOutcome, BadgeVariant> = {
  SUCCESS: "secondary",
  ACCEPTED: "secondary",
  PENDING: "outline",
  DEGRADED: "outline",
  FAILURE: "destructive",
  REJECTED: "destructive",
}
