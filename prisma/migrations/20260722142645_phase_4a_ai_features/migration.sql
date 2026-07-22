-- CreateEnum
CREATE TYPE "CategorySuggestionSource" AS ENUM ('AUTOMATIC', 'MANUAL_RECONSIDER');

-- CreateEnum
CREATE TYPE "CategorySuggestionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "FinancialHealthScoreLabel" AS ENUM ('GOOD', 'FAIR', 'NEEDS_ATTENTION');

-- CreateTable
CREATE TABLE "category_suggestion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "suggestedCategoryId" TEXT,
    "status" "CategorySuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "source" "CategorySuggestionSource" NOT NULL,
    "confidence" DECIMAL(3,2),
    "generatorModel" TEXT NOT NULL,
    "shownAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "category_suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_advisor_cache" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "recommendations" JSONB,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_advisor_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_summary" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "narrative" TEXT,
    "citedFigures" JSONB,
    "isPartialMonth" BOOLEAN NOT NULL DEFAULT false,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monthly_summary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spending_insights_cache" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "insights" JSONB,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spending_insights_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_health_score_snapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "capturedDate" DATE NOT NULL,
    "debtToIncomeScore" INTEGER,
    "savingsRateScore" INTEGER,
    "budgetAdherenceScore" INTEGER,
    "netWorthTrendScore" INTEGER,
    "totalScore" INTEGER,
    "label" "FinancialHealthScoreLabel",
    "narrative" TEXT,

    CONSTRAINT "financial_health_score_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "category_suggestion_userId_idx" ON "category_suggestion"("userId");

-- CreateIndex
CREATE INDEX "category_suggestion_transactionId_status_idx" ON "category_suggestion"("transactionId", "status");

-- CreateIndex
CREATE INDEX "category_suggestion_userId_source_status_idx" ON "category_suggestion"("userId", "source", "status");

-- CreateIndex
CREATE INDEX "budget_advisor_cache_userId_month_idx" ON "budget_advisor_cache"("userId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "budget_advisor_cache_userId_month_key" ON "budget_advisor_cache"("userId", "month");

-- CreateIndex
CREATE INDEX "monthly_summary_userId_month_idx" ON "monthly_summary"("userId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_summary_userId_month_key" ON "monthly_summary"("userId", "month");

-- CreateIndex
CREATE INDEX "spending_insights_cache_userId_period_idx" ON "spending_insights_cache"("userId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "spending_insights_cache_userId_period_key" ON "spending_insights_cache"("userId", "period");

-- CreateIndex
CREATE INDEX "financial_health_score_snapshot_userId_capturedAt_idx" ON "financial_health_score_snapshot"("userId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "financial_health_score_snapshot_userId_capturedDate_key" ON "financial_health_score_snapshot"("userId", "capturedDate");

-- AddForeignKey
ALTER TABLE "category_suggestion" ADD CONSTRAINT "category_suggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_suggestion" ADD CONSTRAINT "category_suggestion_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_suggestion" ADD CONSTRAINT "category_suggestion_suggestedCategoryId_fkey" FOREIGN KEY ("suggestedCategoryId") REFERENCES "category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_advisor_cache" ADD CONSTRAINT "budget_advisor_cache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_summary" ADD CONSTRAINT "monthly_summary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spending_insights_cache" ADD CONSTRAINT "spending_insights_cache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_health_score_snapshot" ADD CONSTRAINT "financial_health_score_snapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
