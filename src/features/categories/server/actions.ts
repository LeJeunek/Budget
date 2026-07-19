"use server"

import { getCurrentUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { ok, fail, type ApiResult } from "@/lib/api-response"
import type { Category } from "@/features/categories/types"
import {
  CreateCategorySchema,
  UpdateCategorySchema,
  DeleteCategorySchema,
} from "@/features/categories/server/validation"

/**
 * Mutating Server Actions for the Categories module. Per
 * docs/architecture/api-contracts.md's Categories section: minimal
 * custom-category CRUD, with system categories (isSystem: true, the
 * Charter's fixed 11 seeded at signup) protected from rename/delete but not
 * from color changes.
 *
 * Every action below, per folder-tree.md's rule:
 *   1. Calls getCurrentUser() and fails closed with "UNAUTHENTICATED".
 *   2. Scopes every Prisma call by that user's id — never trusts a
 *      client-supplied userId.
 */

/**
 * Creates a custom category (isSystem is always false for user-created
 * categories — only prisma/seed.ts / the signup seeding flow sets it true).
 *
 * Duplicate-name detection: prisma/schema.prisma's `@@unique([userId, name])`
 * is case-sensitive, so Postgres alone would allow "Food" and "food" to
 * coexist. docs/product/categories.md's edge case requires case-insensitive
 * matching, so this does an explicit case-insensitive lookup first and
 * returns a clear `fail(...)` before attempting the insert.
 */
export async function createCategory(
  input: unknown
): Promise<ApiResult<Category>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = CreateCategorySchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid category data")
  }
  const { name, color } = parsed.data

  const existing = await db.category.findFirst({
    where: {
      userId: user.id,
      name: { equals: name, mode: "insensitive" },
    },
  })
  if (existing) {
    return fail(`A category named "${name}" already exists`)
  }

  const category = await db.category.create({
    data: { userId: user.id, name, color, isSystem: false },
  })

  return ok(category)
}

/**
 * Renames and/or recolors a category.
 *
 * - Color changes are allowed on any category, system or custom (spec
 *   acceptance criterion #5: "System categories' color may be adjustable").
 * - Name changes are rejected outright for isSystem categories — this is
 *   the concrete enforcement of the "Attempting to rename ... a system
 *   category" edge case; the UI is expected to also disable the rename
 *   input, but this check is the actual guarantee.
 * - A name change is also checked for case-insensitive duplicates against
 *   the user's other categories, same rule as createCategory.
 */
export async function updateCategory(
  input: unknown
): Promise<ApiResult<Category>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = UpdateCategorySchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid category data")
  }
  const { id, name, color } = parsed.data

  const category = await db.category.findFirst({
    where: { id, userId: user.id },
  })
  if (!category) {
    return fail("Category not found")
  }

  const isRenaming =
    name !== undefined && name.toLowerCase() !== category.name.toLowerCase()

  if (category.isSystem && isRenaming) {
    return fail(
      "System categories are part of the fixed starter set and cannot be renamed"
    )
  }

  if (isRenaming) {
    const duplicate = await db.category.findFirst({
      where: {
        userId: user.id,
        name: { equals: name, mode: "insensitive" },
        NOT: { id },
      },
    })
    if (duplicate) {
      return fail(`A category named "${name}" already exists`)
    }
  }

  const updated = await db.category.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(color !== undefined ? { color } : {}),
    },
  })

  return ok(updated)
}

/**
 * Deletes a custom category. Rejected for system categories (the
 * "Attempting to ... delete a system category" edge case).
 *
 * Referencing transactions are intentionally NOT touched here: they are not
 * deleted, and this function does not need to null out their categoryId
 * itself — Transaction.categoryId's `onDelete: SetNull`
 * (prisma/schema.prisma) reclassifies them to Uncategorized automatically at
 * the database level as part of this same delete. See
 * docs/database/er-diagram.md's design notes. Callers that need to warn the
 * user with an affected-transaction count before calling this action should
 * call `service.getCategoryUsageCount` first (see server/service.ts).
 */
export async function deleteCategory(
  input: unknown
): Promise<ApiResult<{ id: string }>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = DeleteCategorySchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid category id")
  }
  const { id } = parsed.data

  const category = await db.category.findFirst({
    where: { id, userId: user.id },
  })
  if (!category) {
    return fail("Category not found")
  }

  if (category.isSystem) {
    return fail(
      "System categories are part of the fixed starter set and cannot be deleted"
    )
  }

  await db.category.delete({ where: { id } })

  return ok({ id })
}
