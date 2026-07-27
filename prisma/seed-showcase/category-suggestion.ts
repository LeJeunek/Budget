// Transaction Auto-Categorization: one PENDING/AUTOMATIC CategorySuggestion
// against the Uncategorized transaction expense-transactions.ts seeded
// specifically for this purpose, mirroring prisma/seed.ts's own precedent so
// the Auto-Categorization review UI has a real row to show.
import { CategorySuggestionSource, CategorySuggestionStatus } from "@prisma/client"
import { prisma } from "./client"

export async function createCategorySuggestion(
  userId: string,
  uncategorizedTransactionId: string,
  foodCategoryId: string,
): Promise<void> {
  await prisma.categorySuggestion.create({
    data: {
      userId,
      transactionId: uncategorizedTransactionId,
      suggestedCategoryId: foodCategoryId,
      status: CategorySuggestionStatus.PENDING,
      source: CategorySuggestionSource.AUTOMATIC,
      confidence: 0.91,
      generatorModel: "fastModel:claude-haiku:2026-08",
    },
  })

  console.log("  Category Suggestion: 1 PENDING/AUTOMATIC row against the Uncategorized transaction.")
}
