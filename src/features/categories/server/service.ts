import { db } from "@/lib/db"
import type { Category } from "@/features/categories/types"

/**
 * Read-side queries for the Categories module. Called directly from Server
 * Components (no Server Action needed for reads) per
 * docs/architecture/api-contracts.md's "List categories" row.
 *
 * Every query here is scoped by `userId` per folder-tree.md's rule that
 * every features/<domain>/server/*.ts file must scope Prisma calls by the
 * authenticated user's id — callers are expected to pass the id returned by
 * `getCurrentUser()`, not a client-supplied value.
 */

/**
 * Returns every category (system + custom) belonging to a user.
 *
 * Ordering: system categories (the Charter's fixed 11, isSystem: true) are
 * grouped first so the list/legend/filter UI renders the baseline set in a
 * stable, predictable position regardless of when a user's custom categories
 * were created; within each group, categories are alphabetized by name.
 */
export async function getCategories(userId: string): Promise<Category[]> {
  return db.category.findMany({
    where: { userId },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  })
}

/**
 * Counts transactions currently classified under a category, scoped to the
 * owning user. Used by a future Frontend Lead confirmation dialog to warn
 * the user before deleting a custom category — see
 * docs/product/categories.md's "Deleting a custom category that has
 * transactions assigned to it" edge case ("12 transactions will become
 * Uncategorized"). Does not mutate anything; the actual reclassification to
 * Uncategorized happens automatically via Transaction.categoryId's
 * `onDelete: SetNull` when the category is later deleted (see
 * docs/database/er-diagram.md).
 */
export async function getCategoryUsageCount(
  userId: string,
  categoryId: string
): Promise<number> {
  return db.transaction.count({
    where: { userId, categoryId },
  })
}
