-- Phase 4c performance follow-up (docs/performance/phase-4c-performance-review.md
-- Finding 1): Admin's Audit Log (features/admin/server/audit-log.ts) fans out
-- to 8 sources, each querying "ORDER BY <timestamp> DESC LIMIT 50" filtered
-- ONLY by an optional [gte, lt) window on that same timestamp column -- never
-- by userId. Two of the eight tables (ReportGenerationEvent, AdminActionLog)
-- already got a dedicated single-column timestamp index for exactly this
-- reason when this same phase created them. This migration carries that same
-- fix back to the six pre-existing tables that Audit Log is the first reader
-- to query in a userId-unscoped way -- every index below is purely additive
-- (no data change, no application-code change required to benefit from it).

-- CreateIndex
CREATE INDEX "budget_advisor_cache_generatedAt_idx" ON "budget_advisor_cache"("generatedAt");

-- CreateIndex
CREATE INDEX "category_suggestion_createdAt_idx" ON "category_suggestion"("createdAt");

-- CreateIndex
CREATE INDEX "financial_health_score_snapshot_capturedAt_idx" ON "financial_health_score_snapshot"("capturedAt");

-- CreateIndex
CREATE INDEX "monthly_summary_generatedAt_idx" ON "monthly_summary"("generatedAt");

-- CreateIndex
CREATE INDEX "notification_createdAt_idx" ON "notification"("createdAt");

-- CreateIndex
CREATE INDEX "spending_insights_cache_generatedAt_idx" ON "spending_insights_cache"("generatedAt");
