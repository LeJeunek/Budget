-- CreateEnum
CREATE TYPE "FinancialGoalType" AS ENUM ('DEBT_PAYOFF', 'NET_WORTH_SAVINGS_TARGET', 'SAVINGS_RATE_TARGET');

-- CreateEnum
CREATE TYPE "MeasurementBasis" AS ENUM ('TOTAL_NET_WORTH', 'ACCOUNT_SUBSET');

-- CreateTable
CREATE TABLE "dismissed_subscription_merchant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "normalizedMerchantName" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dismissed_subscription_merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_goal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FinancialGoalType" NOT NULL,
    "linkedDebtId" TEXT,
    "startingBalance" DECIMAL(14,2),
    "targetAmount" DECIMAL(14,2),
    "measurementBasis" "MeasurementBasis",
    "targetPercent" DECIMAL(5,2),
    "targetDate" DATE,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_goal_account" (
    "financialGoalId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,

    CONSTRAINT "financial_goal_account_pkey" PRIMARY KEY ("financialGoalId","accountId")
);

-- CreateIndex
CREATE INDEX "dismissed_subscription_merchant_userId_idx" ON "dismissed_subscription_merchant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "dismissed_subscription_merchant_userId_normalizedMerchantNa_key" ON "dismissed_subscription_merchant"("userId", "normalizedMerchantName");

-- CreateIndex
CREATE INDEX "financial_goal_userId_idx" ON "financial_goal"("userId");

-- CreateIndex
CREATE INDEX "financial_goal_linkedDebtId_idx" ON "financial_goal"("linkedDebtId");

-- AddForeignKey
ALTER TABLE "dismissed_subscription_merchant" ADD CONSTRAINT "dismissed_subscription_merchant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_goal" ADD CONSTRAINT "financial_goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_goal" ADD CONSTRAINT "financial_goal_linkedDebtId_fkey" FOREIGN KEY ("linkedDebtId") REFERENCES "debt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_goal_account" ADD CONSTRAINT "financial_goal_account_financialGoalId_fkey" FOREIGN KEY ("financialGoalId") REFERENCES "financial_goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_goal_account" ADD CONSTRAINT "financial_goal_account_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "financial_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
