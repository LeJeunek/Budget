-- CreateTable
CREATE TABLE "reasoning_model_call_log" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reasoning_model_call_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reasoning_model_call_log_userId_createdAt_idx" ON "reasoning_model_call_log"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "reasoning_model_call_log_createdAt_idx" ON "reasoning_model_call_log"("createdAt");

-- AddForeignKey
ALTER TABLE "reasoning_model_call_log" ADD CONSTRAINT "reasoning_model_call_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
