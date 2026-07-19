import type { Category as PrismaCategory } from "@prisma/client"

/**
 * Category shape returned to callers (Server Components, Server Actions).
 *
 * Re-exported as-is from the Prisma-generated type: unlike Account.balance,
 * Category has no Decimal/numeric fields that need reshaping before crossing
 * the server/client boundary, so the Prisma model is already the API shape.
 * See docs/architecture/api-contracts.md's Categories section for the exact
 * service/action signatures this type backs, and prisma/schema.prisma (owned
 * by the Database Architect) for the field definitions.
 */
export type Category = PrismaCategory

/**
 * Result of `service.getCategoryUsageCount` — the number of transactions
 * currently classified under a given category. Consumed by a future
 * Frontend Lead confirmation dialog to warn the user before deleting a
 * custom category ("N transactions will become Uncategorized"), per
 * docs/product/categories.md's "Deleting a custom category that has
 * transactions assigned to it" edge case.
 */
export interface CategoryUsageCount {
  categoryId: string
  transactionCount: number
}
