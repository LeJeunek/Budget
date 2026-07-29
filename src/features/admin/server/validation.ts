import { z } from "zod"

/**
 * Zod schemas for `features/admin/server/actions.ts`'s Server Action
 * boundary — "Use Zod for input validation at every boundary" applied to
 * Admin's own six mutations.
 *
 * The category-template name/color rules deliberately mirror
 * `features/categories/server/validation.ts`'s own `categoryName`/`hexColor`
 * exactly (admin.md Capability 5 AC2: "governed by the same case-insensitive
 * name-uniqueness and reasonable-max-length validation `categories.md`
 * already establishes for a user's own custom categories") — duplicated as a
 * small, literal constant here rather than imported, since Categories'
 * `validation.ts` doesn't export those two pieces today and this module's
 * own boundary should not force a private implementation detail of another
 * feature's validation file to become part of its public surface just to
 * satisfy this one, narrow reuse.
 */

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex value like #94a3b8")

const CATEGORY_TEMPLATE_NAME_MAX_LENGTH = 50

const categoryTemplateName = z
  .string()
  .trim()
  .min(1, "Category name is required")
  .max(
    CATEGORY_TEMPLATE_NAME_MAX_LENGTH,
    `Category name must be ${CATEGORY_TEMPLATE_NAME_MAX_LENGTH} characters or fewer`,
  )

// ---------------------------------------------------------------------------
// Feature Flags
// ---------------------------------------------------------------------------

export const ToggleFeatureFlagSchema = z.object({
  key: z.string().min(1, "Flag key is required"),
})

export type ToggleFeatureFlagInput = z.infer<typeof ToggleFeatureFlagSchema>

// ---------------------------------------------------------------------------
// Manage Categories (starter template)
// ---------------------------------------------------------------------------

export const CreateCategoryTemplateEntrySchema = z.object({
  name: categoryTemplateName,
  color: hexColor.default("#94a3b8"),
})

export type CreateCategoryTemplateEntryInput = z.infer<
  typeof CreateCategoryTemplateEntrySchema
>

export const UpdateCategoryTemplateEntrySchema = z.object({
  id: z.string().min(1, "Template entry id is required"),
  name: categoryTemplateName.optional(),
  color: hexColor.optional(),
})

export type UpdateCategoryTemplateEntryInput = z.infer<
  typeof UpdateCategoryTemplateEntrySchema
>

export const ReorderCategoryTemplateEntriesSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1, "At least one entry is required"),
})

export type ReorderCategoryTemplateEntriesInput = z.infer<
  typeof ReorderCategoryTemplateEntriesSchema
>

export const DeleteCategoryTemplateEntrySchema = z.object({
  id: z.string().min(1, "Template entry id is required"),
})

export type DeleteCategoryTemplateEntryInput = z.infer<
  typeof DeleteCategoryTemplateEntrySchema
>
