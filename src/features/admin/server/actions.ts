"use server"

import { getCurrentAdminUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { ok, fail, type ApiResult } from "@/lib/api-response"

import {
  createTemplateEntry,
  updateTemplateEntry,
  reorderTemplateEntries,
  deleteTemplateEntry,
  DuplicateCategoryTemplateNameError,
  CategoryTemplateEntryNotFoundError,
  CategoryTemplateWouldBeEmptyError,
  CategoryTemplateConcurrentModificationError,
  type SystemCategoryTemplateEntry,
} from "@/features/categories/server/template"
import type { FeatureFlagView } from "@/features/admin/types"
import {
  ToggleFeatureFlagSchema,
  CreateCategoryTemplateEntrySchema,
  UpdateCategoryTemplateEntrySchema,
  ReorderCategoryTemplateEntriesSchema,
  DeleteCategoryTemplateEntrySchema,
} from "@/features/admin/server/validation"

/**
 * Every mutating Server Action Admin exposes (phase-4c-technical-design.md
 * §7.1). **This file is the ONE place "is this caller an admin" is checked
 * for every mutation this module exposes** — every exported function below
 * calls `getCurrentAdminUser()` FIRST, before doing anything else (including
 * before Zod-parsing its own input), and returns a failure `ApiResult`
 * immediately if it's `null`. `getCurrentAdminUser()` is re-checked live on
 * every call (never cached/inferred from a prior check) — per admin.md
 * Capability 1 AC2/Edge Case, an admin's session persisting after their
 * `ADMIN` tier is revoked mid-session must be blocked on the very next
 * request, which is exactly what re-calling this function per-invocation
 * guarantees (see `lib/auth.ts`'s own doc comment on why this is free, given
 * this app's database session strategy).
 *
 * The four category-template actions are thin, admin-gated wrappers over
 * `features/categories/server/template.ts`'s already-built mutations
 * (§4.2's ownership split: Admin owns the *authorization*, Categories owns
 * the *data and its business rules* — this file never reimplements
 * uniqueness/reorder/non-empty-template logic that already lives there).
 *
 * Every one of these six actions writes exactly one `AdminActionLog` row on
 * a successful mutation (§6.2) — except `seedDemoData`, which logs on BOTH
 * success and failure per admin.md Capability 6 AC5's explicit "success or
 * failure" wording (a triggered seed attempt is itself worth recording
 * regardless of outcome, unlike a category-template edit rejected by
 * validation before any write occurred, which is not a "change" to record).
 */

const UNAUTHORIZED = "You must be an admin to perform this action."

// ---------------------------------------------------------------------------
// Feature Flags (admin.md Capability 4)
// ---------------------------------------------------------------------------

/**
 * Flips a feature flag's current `enabled` state (the read-modify-write is
 * a plain `findUnique` + `$transaction`, not a single atomic toggle — an
 * acceptable, narrow TOCTOU window given this is an admin-only, low-frequency
 * action with no financial-correctness stakes, the same class of tolerance
 * this codebase already accepts for other single-authenticated-actor writes).
 * Records `{ flagKey, from, to }` on `AdminActionLog` in the SAME transaction
 * as the flag update, per §6.2.
 */
export async function toggleFeatureFlag(input: unknown): Promise<ApiResult<FeatureFlagView>> {
  const admin = await getCurrentAdminUser()
  if (!admin) return fail(UNAUTHORIZED)

  const parsed = ToggleFeatureFlagSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid feature flag input")
  }
  const { key } = parsed.data

  const existing = await db.featureFlag.findUnique({ where: { key } })
  if (!existing) {
    return fail(`Feature flag "${key}" not found`)
  }

  const nextEnabled = !existing.enabled

  const [updated] = await db.$transaction([
    db.featureFlag.update({
      where: { key },
      data: { enabled: nextEnabled, updatedByUserId: admin.id },
    }),
    db.adminActionLog.create({
      data: {
        adminUserId: admin.id,
        action: "FEATURE_FLAG_TOGGLED",
        details: { flagKey: key, from: existing.enabled, to: nextEnabled },
      },
    }),
  ])

  return ok({
    key: updated.key,
    enabled: updated.enabled,
    updatedAt: updated.updatedAt,
    updatedByUserId: updated.updatedByUserId,
  })
}

// ---------------------------------------------------------------------------
// Manage Categories — starter template (admin.md Capability 5)
// ---------------------------------------------------------------------------

export async function createCategoryTemplateEntry(
  input: unknown,
): Promise<ApiResult<SystemCategoryTemplateEntry>> {
  const admin = await getCurrentAdminUser()
  if (!admin) return fail(UNAUTHORIZED)

  const parsed = CreateCategoryTemplateEntrySchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid category template data")
  }

  try {
    const created = await createTemplateEntry(parsed.data)

    await db.adminActionLog.create({
      data: {
        adminUserId: admin.id,
        action: "CATEGORY_TEMPLATE_CHANGED",
        details: { operation: "CREATE", templateEntryId: created.id, name: created.name },
      },
    })

    return ok(created)
  } catch (error) {
    if (error instanceof DuplicateCategoryTemplateNameError) {
      return fail(error.message)
    }
    throw error
  }
}

export async function updateCategoryTemplateEntry(
  input: unknown,
): Promise<ApiResult<SystemCategoryTemplateEntry>> {
  const admin = await getCurrentAdminUser()
  if (!admin) return fail(UNAUTHORIZED)

  const parsed = UpdateCategoryTemplateEntrySchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid category template data")
  }

  try {
    const updated = await updateTemplateEntry(parsed.data)

    await db.adminActionLog.create({
      data: {
        adminUserId: admin.id,
        action: "CATEGORY_TEMPLATE_CHANGED",
        details: { operation: "UPDATE", templateEntryId: updated.id, name: updated.name },
      },
    })

    return ok(updated)
  } catch (error) {
    if (
      error instanceof DuplicateCategoryTemplateNameError ||
      error instanceof CategoryTemplateEntryNotFoundError
    ) {
      return fail(error.message)
    }
    throw error
  }
}

/**
 * AC4's explicit reorder action — `orderedIds` is the complete, desired
 * top-to-bottom id order. No single `templateEntryId` applies to a reorder,
 * so its `AdminActionLog.details` omits that field (per
 * `CategoryTemplateChangedDetails`'s own comment).
 *
 * Wrapped in try/catch (previously this action had none at all — see
 * category-template-update-delete-race-unhandled-error.md): a concurrent
 * `deleteCategoryTemplateEntry` can remove one of `orderedIds`' rows
 * mid-reorder, which `reorderTemplateEntries` now translates to
 * `CategoryTemplateEntryNotFoundError` instead of letting Prisma's raw
 * P2025 escape.
 */
export async function reorderCategoryTemplateEntries(
  input: unknown,
): Promise<ApiResult<SystemCategoryTemplateEntry[]>> {
  const admin = await getCurrentAdminUser()
  if (!admin) return fail(UNAUTHORIZED)

  const parsed = ReorderCategoryTemplateEntriesSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid reorder input")
  }

  try {
    const reordered = await reorderTemplateEntries(parsed.data.orderedIds)

    await db.adminActionLog.create({
      data: {
        adminUserId: admin.id,
        action: "CATEGORY_TEMPLATE_CHANGED",
        details: { operation: "REORDER" },
      },
    })

    return ok(reordered)
  } catch (error) {
    if (error instanceof CategoryTemplateEntryNotFoundError) {
      return fail(error.message)
    }
    throw error
  }
}

/**
 * AC6's "never zero entries" guard is enforced by `template.ts`'s
 * `deleteTemplateEntry` itself (`CategoryTemplateWouldBeEmptyError`) — this
 * wrapper only translates that thrown error into a friendly `ApiResult`
 * failure, never re-implements the count check. Also translates
 * `CategoryTemplateConcurrentModificationError` — `deleteTemplateEntry`'s
 * Serializable-transaction fix for the count-then-delete TOCTOU race
 * (category-template-delete-toctou-zero-entries.md) — into the same kind of
 * friendly, try-again failure, rather than letting Postgres's raw
 * serialization-conflict error escape.
 */
export async function deleteCategoryTemplateEntry(
  input: unknown,
): Promise<ApiResult<{ id: string }>> {
  const admin = await getCurrentAdminUser()
  if (!admin) return fail(UNAUTHORIZED)

  const parsed = DeleteCategoryTemplateEntrySchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid category template id")
  }
  const { id } = parsed.data

  try {
    await deleteTemplateEntry(id)

    await db.adminActionLog.create({
      data: {
        adminUserId: admin.id,
        action: "CATEGORY_TEMPLATE_CHANGED",
        details: { operation: "DELETE", templateEntryId: id },
      },
    })

    return ok({ id })
  } catch (error) {
    if (
      error instanceof CategoryTemplateEntryNotFoundError ||
      error instanceof CategoryTemplateWouldBeEmptyError ||
      error instanceof CategoryTemplateConcurrentModificationError
    ) {
      return fail(error.message)
    }
    throw error
  }
}
