-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'GOAL_ACHIEVED';
ALTER TYPE "NotificationType" ADD VALUE 'LARGE_PURCHASE';
ALTER TYPE "NotificationType" ADD VALUE 'LOW_BALANCE';
ALTER TYPE "NotificationType" ADD VALUE 'MONTHLY_SUMMARY_READY';

-- AlterTable
ALTER TABLE "financial_account" ADD COLUMN     "lowBalanceNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "lowBalanceThresholdOverride" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "financial_goal" ADD COLUMN     "completionNotifiedAt" TIMESTAMP(3);

-- DataMigration: one-time backfill for "financial_goal"."completionNotifiedAt"
-- (phase-4b-technical-design.md §7.3, required, not optional). Column stays
-- nullable — this is purely about correct backfill semantics, not a NOT NULL
-- constraint. Without this, the very first evaluation pass of the new
-- GOAL_ACHIEVED trigger would see every already-completed goal as newly
-- transitioning and fire a burst of stale "you achieved this months ago"
-- notifications, which notifications-v2.md explicitly rules out.
--
-- Each FinancialGoalType's completion formula is replicated here against
-- already-persisted data, matching this schema's own documented conventions
-- for what each type's "effective"/current figure is (see FinancialGoal's
-- and NetWorthSnapshot's own schema comments):
--
--   DEBT_PAYOFF: completed when the linked Debt's effective balance <= 0.
--   Effective balance is the linked Account's balance when the Debt is
--   Credit-Card-linked (Debt.accountId set), else Debt.balance itself — the
--   exact "read live via the join, never copied" rule Debt.balance's own
--   comment documents.
UPDATE "financial_goal" fg
SET "completionNotifiedAt" = NOW()
FROM "debt" d
LEFT JOIN "financial_account" fa ON fa.id = d."accountId"
WHERE fg."linkedDebtId" = d.id
  AND fg."type" = 'DEBT_PAYOFF'
  AND fg."completionNotifiedAt" IS NULL
  AND COALESCE(fa.balance, d.balance) <= 0;

--   NET_WORTH_SAVINGS_TARGET / TOTAL_NET_WORTH basis: completed when the
--   user's most recent NetWorthSnapshot.totalNetWorth (the same persisted
--   figure dashboard.service.getNetWorth's live computation is copied from
--   at capture time, per that model's own comment) is already >=
--   targetAmount. Uses the latest snapshot as of migration time as the
--   practical stand-in for "current" net worth, since no live aggregation
--   query is available inside a SQL-only migration.
UPDATE "financial_goal" fg
SET "completionNotifiedAt" = NOW()
WHERE fg."type" = 'NET_WORTH_SAVINGS_TARGET'
  AND fg."measurementBasis" = 'TOTAL_NET_WORTH'
  AND fg."completionNotifiedAt" IS NULL
  AND fg."targetAmount" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM "net_worth_snapshot" nws
    WHERE nws."userId" = fg."userId"
    ORDER BY nws."capturedAt" DESC
    LIMIT 1
  )
  AND (
    SELECT nws."totalNetWorth"
    FROM "net_worth_snapshot" nws
    WHERE nws."userId" = fg."userId"
    ORDER BY nws."capturedAt" DESC
    LIMIT 1
  ) >= fg."targetAmount";

--   NET_WORTH_SAVINGS_TARGET / ACCOUNT_SUBSET basis: completed when the
--   current sum of the goal's selected Account subset (FinancialGoalAccount)
--   is already >= targetAmount. Unlike the TOTAL_NET_WORTH basis, this is a
--   plain balance sum with no debt subtraction, matching this measurement
--   basis's own "a user-selected subset of Accounts" definition (not a net
--   worth calculation over that subset).
UPDATE "financial_goal" fg
SET "completionNotifiedAt" = NOW()
WHERE fg."type" = 'NET_WORTH_SAVINGS_TARGET'
  AND fg."measurementBasis" = 'ACCOUNT_SUBSET'
  AND fg."completionNotifiedAt" IS NULL
  AND fg."targetAmount" IS NOT NULL
  AND (
    SELECT COALESCE(SUM(fa."balance"), 0)
    FROM "financial_goal_account" fga
    JOIN "financial_account" fa ON fa.id = fga."accountId"
    WHERE fga."financialGoalId" = fg.id
  ) >= fg."targetAmount";

-- NOTE (flagged, not resolved by this migration): SAVINGS_RATE_TARGET goals
-- are DELIBERATELY NOT backfilled above. This type's completion formula
-- (financial-goals.md's own read-time definition, evaluated against
-- whichever "current" savings-rate figure and time window
-- dashboard.service.computeSavingsRate resolves to) is not yet implemented
-- in this codebase as of this migration (no features/financial-goals or
-- features/dashboard server code exists yet — schema/design phase only) and
-- cannot be faithfully replicated in raw SQL without guessing at that
-- window. Known, accepted consequence: any SAVINGS_RATE_TARGET goal that is
-- already at/above its target percent at feature-launch time will fire one
-- (and only one, per the @@unique([financialGoalId, type]) guarantee)
-- retroactive GOAL_ACHIEVED notification the first time it is evaluated,
-- rather than being silently suppressed like the other two types. Before
-- goal-achieved-trigger.ts ships, re-run an equivalent backfill UPDATE for
-- this type using that formula once it exists, or explicitly accept this gap
-- — flagged for the Backend Engineer/Solution Architect, not silently
-- decided here.

-- AlterTable
ALTER TABLE "notification" ADD COLUMN     "accountId" TEXT,
ADD COLUMN     "emailSendError" TEXT,
ADD COLUMN     "emailSentAt" TIMESTAMP(3),
ADD COLUMN     "financialGoalId" TEXT,
ADD COLUMN     "monthlySummaryId" TEXT,
ADD COLUMN     "transactionId" TEXT;

-- CreateTable
CREATE TABLE "notification_preference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_threshold_settings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "largePurchaseThreshold" DECIMAL(14,2),
    "lowBalanceThreshold" DECIMAL(14,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_threshold_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_preference_userId_idx" ON "notification_preference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preference_userId_type_key" ON "notification_preference"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "notification_threshold_settings_userId_key" ON "notification_threshold_settings"("userId");

-- CreateIndex
CREATE INDEX "notification_accountId_idx" ON "notification"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_financialGoalId_type_key" ON "notification"("financialGoalId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "notification_transactionId_type_key" ON "notification"("transactionId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "notification_monthlySummaryId_type_key" ON "notification"("monthlySummaryId", "type");

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_financialGoalId_fkey" FOREIGN KEY ("financialGoalId") REFERENCES "financial_goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "financial_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_monthlySummaryId_fkey" FOREIGN KEY ("monthlySummaryId") REFERENCES "monthly_summary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_threshold_settings" ADD CONSTRAINT "notification_threshold_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

