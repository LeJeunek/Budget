-- CreateEnum
CREATE TYPE "DebtType" AS ENUM ('CREDIT_CARD', 'PERSONAL_LOAN', 'AUTO_LOAN', 'STUDENT_LOAN', 'MORTGAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('STOCK', 'ETF', 'MUTUAL_FUND', 'BOND', 'CRYPTO', 'RETIREMENT_FUND', 'OTHER');

-- CreateEnum
CREATE TYPE "Sector" AS ENUM ('TECHNOLOGY', 'HEALTHCARE', 'FINANCIALS', 'ENERGY', 'CONSUMER', 'REAL_ESTATE', 'INDUSTRIALS', 'OTHER');

-- CreateEnum
CREATE TYPE "IncomeType" AS ENUM ('SALARY', 'SIDE_HUSTLE', 'DIVIDEND', 'RENTAL', 'BONUS', 'OTHER');

-- CreateEnum
CREATE TYPE "IncomeSchedule" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY', 'IRREGULAR');

-- CreateTable
CREATE TABLE "debt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DebtType" NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL,
    "interestRate" DECIMAL(5,2) NOT NULL,
    "minimumPayment" DECIMAL(14,2) NOT NULL,
    "accountId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "debt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assetType" "AssetType" NOT NULL,
    "sector" "Sector",
    "costBasis" DECIMAL(14,2) NOT NULL,
    "currentValue" DECIMAL(14,2) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "holding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holding_value_history" (
    "id" TEXT NOT NULL,
    "holdingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "previousValue" DECIMAL(14,2) NOT NULL,
    "newValue" DECIMAL(14,2) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "holding_value_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dividend_entry" (
    "id" TEXT NOT NULL,
    "holdingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dividend_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "income_stream" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "IncomeType" NOT NULL,
    "schedule" "IncomeSchedule" NOT NULL,
    "expectedAmount" DECIMAL(14,2),
    "anchorDate" DATE,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "income_stream_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "income_occurrence" (
    "id" TEXT NOT NULL,
    "streamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expectedDate" DATE NOT NULL,
    "receivedAmount" DECIMAL(14,2),
    "receivedDate" DATE,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "income_occurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "irregular_income_event" (
    "id" TEXT NOT NULL,
    "streamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "date" DATE NOT NULL,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "irregular_income_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "net_worth_snapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "capturedDate" DATE NOT NULL,
    "totalAccountBalance" DECIMAL(14,2) NOT NULL,
    "totalUnlinkedDebtLiability" DECIMAL(14,2) NOT NULL,
    "totalNetWorth" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "net_worth_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "debt_accountId_key" ON "debt"("accountId");

-- CreateIndex
CREATE INDEX "debt_userId_idx" ON "debt"("userId");

-- CreateIndex
CREATE INDEX "holding_userId_idx" ON "holding"("userId");

-- CreateIndex
CREATE INDEX "holding_accountId_idx" ON "holding"("accountId");

-- CreateIndex
CREATE INDEX "holding_value_history_holdingId_recordedAt_idx" ON "holding_value_history"("holdingId", "recordedAt");

-- CreateIndex
CREATE INDEX "holding_value_history_userId_idx" ON "holding_value_history"("userId");

-- CreateIndex
CREATE INDEX "dividend_entry_holdingId_date_idx" ON "dividend_entry"("holdingId", "date");

-- CreateIndex
CREATE INDEX "dividend_entry_userId_idx" ON "dividend_entry"("userId");

-- CreateIndex
CREATE INDEX "income_stream_userId_idx" ON "income_stream"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "income_occurrence_transactionId_key" ON "income_occurrence"("transactionId");

-- CreateIndex
CREATE INDEX "income_occurrence_userId_expectedDate_idx" ON "income_occurrence"("userId", "expectedDate");

-- CreateIndex
CREATE INDEX "income_occurrence_streamId_idx" ON "income_occurrence"("streamId");

-- CreateIndex
CREATE UNIQUE INDEX "income_occurrence_streamId_expectedDate_key" ON "income_occurrence"("streamId", "expectedDate");

-- CreateIndex
CREATE UNIQUE INDEX "irregular_income_event_transactionId_key" ON "irregular_income_event"("transactionId");

-- CreateIndex
CREATE INDEX "irregular_income_event_userId_date_idx" ON "irregular_income_event"("userId", "date");

-- CreateIndex
CREATE INDEX "irregular_income_event_streamId_idx" ON "irregular_income_event"("streamId");

-- CreateIndex
CREATE INDEX "net_worth_snapshot_userId_capturedAt_idx" ON "net_worth_snapshot"("userId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "net_worth_snapshot_userId_capturedDate_key" ON "net_worth_snapshot"("userId", "capturedDate");

-- AddForeignKey
ALTER TABLE "debt" ADD CONSTRAINT "debt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt" ADD CONSTRAINT "debt_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "financial_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holding" ADD CONSTRAINT "holding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holding" ADD CONSTRAINT "holding_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "financial_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holding_value_history" ADD CONSTRAINT "holding_value_history_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES "holding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holding_value_history" ADD CONSTRAINT "holding_value_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dividend_entry" ADD CONSTRAINT "dividend_entry_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES "holding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dividend_entry" ADD CONSTRAINT "dividend_entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_stream" ADD CONSTRAINT "income_stream_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_occurrence" ADD CONSTRAINT "income_occurrence_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "income_stream"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_occurrence" ADD CONSTRAINT "income_occurrence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_occurrence" ADD CONSTRAINT "income_occurrence_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "irregular_income_event" ADD CONSTRAINT "irregular_income_event_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "income_stream"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "irregular_income_event" ADD CONSTRAINT "irregular_income_event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "irregular_income_event" ADD CONSTRAINT "irregular_income_event_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "net_worth_snapshot" ADD CONSTRAINT "net_worth_snapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
