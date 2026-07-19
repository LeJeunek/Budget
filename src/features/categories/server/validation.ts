import { z } from "zod"

/**
 * Zod schemas for the Categories module's server boundary (Server Actions).
 * Per docs/architecture/api-contracts.md's Categories section and
 * naming-standards.md's Zod schema conventions (PascalCase + "Schema").
 */

// Category colors are stored as hex strings and applied via inline `style`
// (see naming-standards.md's CSS section) — not free-form user text, so a
// strict hex format is enforced here rather than left to the DB.
const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex value like #94a3b8")

// Keeps category names readable wherever they're rendered densely (category
// list rows, the transaction table's category cell, and the Dashboard's
// Spending by Category legend) — see docs/product/categories.md's "Very long
// category names" edge case.
const CATEGORY_NAME_MAX_LENGTH = 50

const categoryName = z
  .string()
  .trim()
  .min(1, "Category name is required")
  .max(
    CATEGORY_NAME_MAX_LENGTH,
    `Category name must be ${CATEGORY_NAME_MAX_LENGTH} characters or fewer`
  )

// Note: Zod cannot check per-user name uniqueness (it has no DB access) —
// the case-insensitive duplicate check ("Food" vs "food", per the product
// spec's edge case) happens in server/actions.ts against the authenticated
// user's existing categories.
export const CreateCategorySchema = z.object({
  name: categoryName,
  // Mirrors the Prisma model's own default (see prisma/schema.prisma
  // Category.color) so a category created without an explicit color still
  // gets a deterministic value from the validated input, not an implicit
  // DB-side default the action layer never sees.
  color: hexColor.default("#94a3b8"),
})

export type CreateCategoryInput = z.infer<typeof CreateCategorySchema>

export const UpdateCategorySchema = z.object({
  id: z.string().min(1, "Category id is required"),
  name: categoryName.optional(),
  color: hexColor.optional(),
})

export type UpdateCategoryInput = z.infer<typeof UpdateCategorySchema>

export const DeleteCategorySchema = z.object({
  id: z.string().min(1, "Category id is required"),
})

export type DeleteCategoryInput = z.infer<typeof DeleteCategorySchema>
