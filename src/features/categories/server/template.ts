import { db } from "@/lib/db"
import { Prisma, type SystemCategoryTemplate } from "@prisma/client"

/**
 * `SystemCategoryTemplate` read/write layer — Admin's DB-backed
 * starter-category template (docs/architecture/phase-4c-technical-design.md
 * §4.2, resolving risk-register.md #25/#35).
 *
 * Ownership: this table is owned and queried by the **Categories** feature
 * (this file), not `features/admin/` — the forcing reason is `lib/auth.ts`'s
 * signup hook (`getSystemCategoryTemplate`, called on every signup, core
 * infrastructure) is the other consumer alongside Admin's own display/edit
 * screen, and core infra must never depend on a feature module, especially
 * not the one explicitly scoped to be this app's smallest, most
 * internal-operations-only module (§4.2's full reasoning).
 *
 * **No `getCurrentAdminUser()` / authorization check anywhere in this file.**
 * Per this codebase's standing convention, authorization is resolved once, at
 * the Server Action/Route Handler boundary, with `service.ts`/`template.ts`
 * -level functions trusting a caller that has already been authorized —
 * exactly as `financial-goals/server/service.ts`'s
 * `assertDebtNotAlreadyLinkedToActiveGoal` and every other domain's
 * business-rule guard already does. `getSystemCategoryTemplate` specifically
 * needs no check at all, admin or otherwise: it is a read of non-sensitive,
 * effectively-public configuration data, called directly by both
 * `lib/auth.ts`'s signup hook and Admin's own display screen. The four
 * mutations below are intended to be called exclusively from
 * `features/admin/server/actions.ts`'s thin, `getCurrentAdminUser()`-gated
 * wrappers (a later Backend Engineer dispatch, not built in this pass) —
 * Admin owns the *authorization*, Categories owns the *data and its business
 * rules*.
 *
 * Business rules enforced here, per §4.2:
 *   - AC2: case-insensitive name uniqueness (application-layer — the
 *     `@@unique` on `SystemCategoryTemplate.name` is a case-sensitive
 *     defense-in-depth backstop only, mirroring `Category`'s own
 *     `@@unique([userId, name])` + case-insensitive-lookup-in-actions.ts
 *     precedent, `features/categories/server/actions.ts`).
 *   - AC4: an explicit reorder function — display order is never left to
 *     implicit creation order the way `Category` itself is.
 *   - AC6: this table must never be reduced to zero entries (every new
 *     signup's starter-category seeding — §4.3 — reads this table; a fully
 *     empty template would silently seed zero categories for the next
 *     signup, a regression no admin action should ever be able to trigger).
 *
 * Each mutation throws a specific, named `Error` subclass on a business-rule
 * violation rather than returning an `ApiResult` itself — matching
 * `financial-goals/server/service.ts`'s `DebtAlreadyLinkedError` /
 * `lib/transaction-link-guard.ts`'s `TransactionAlreadyLinkedError`
 * precedent: the caller one layer up (`features/admin/server/actions.ts`,
 * the actual Server Action boundary) is the one place a raw thrown error is
 * caught and turned into a friendly `ApiResult` failure, never surfaced to a
 * client as-is.
 */

export type SystemCategoryTemplateEntry = SystemCategoryTemplate

export class DuplicateCategoryTemplateNameError extends Error {
  constructor(name: string) {
    super(`A starter-category template entry named "${name}" already exists`)
    this.name = "DuplicateCategoryTemplateNameError"
  }
}

export class CategoryTemplateEntryNotFoundError extends Error {
  constructor() {
    super("Category template entry not found")
    this.name = "CategoryTemplateEntryNotFoundError"
  }
}

/**
 * AC6 — "never reducible to zero entries." Thrown by `deleteTemplateEntry`
 * when the entry being removed is the template's last remaining row, since a
 * fully empty template would silently seed zero starter categories for the
 * very next signup after the deletion.
 */
export class CategoryTemplateWouldBeEmptyError extends Error {
  constructor() {
    super("The starter-category template must always have at least one entry")
    this.name = "CategoryTemplateWouldBeEmptyError"
  }
}

/**
 * Thrown by `deleteTemplateEntry` when Postgres's `Serializable` isolation
 * aborts its transaction because a concurrent request against this same
 * table (almost always another concurrent delete) could not be serialized
 * against it — see that function's own JSDoc
 * (category-template-delete-toctou-zero-entries.md). Distinct from
 * `CategoryTemplateWouldBeEmptyError`: this is not a confirmed business-rule
 * violation (the guard never got a clean answer either way), it is "someone
 * else changed this table at the same instant — the safe, correct response
 * is to ask the caller to retry against fresh state," which is what admin
 * users see when this bubbles up as an `ApiResult` failure.
 */
export class CategoryTemplateConcurrentModificationError extends Error {
  constructor() {
    super(
      "The starter-category template was changed by another action at the same moment — please try again",
    )
    this.name = "CategoryTemplateConcurrentModificationError"
  }
}

/** True for Prisma's "record to update/delete not found" error (P2025) —
 * thrown when a row that passed an earlier existence check is concurrently
 * deleted before the write that assumed it still existed. See
 * `updateTemplateEntry`/`reorderTemplateEntries`'s own JSDoc
 * (category-template-update-delete-race-unhandled-error.md). */
function isRecordNotFoundError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025"
}

/** True for Prisma's "transaction failed due to a write conflict or a
 * deadlock" error (P2034) — the error Postgres's `Serializable` isolation
 * surfaces when two concurrent transactions touching this table can't both
 * be serialized. See `deleteTemplateEntry`'s own JSDoc. */
function isTransactionConflictError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034"
}

/**
 * Plain read, ordered by `order` ascending — no admin check (see this file's
 * own doc comment). Called by both `lib/auth.ts`'s signup hook (§4.3) and
 * Admin's own Manage Categories display screen.
 */
export async function getSystemCategoryTemplate(): Promise<SystemCategoryTemplateEntry[]> {
  return db.systemCategoryTemplate.findMany({ orderBy: { order: "asc" } })
}

async function findCaseInsensitiveDuplicate(
  name: string,
  excludeId?: string,
): Promise<SystemCategoryTemplateEntry | null> {
  return db.systemCategoryTemplate.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
  })
}

export interface CreateTemplateEntryInput {
  name: string
  color: string
}

/**
 * Appends a new entry at the end of the current order (AC4's own "new
 * entries are added at the end" default — an admin explicitly reorders
 * afterward via `reorderTemplateEntries` if a different position is wanted).
 */
export async function createTemplateEntry(
  input: CreateTemplateEntryInput,
): Promise<SystemCategoryTemplateEntry> {
  const duplicate = await findCaseInsensitiveDuplicate(input.name)
  if (duplicate) {
    throw new DuplicateCategoryTemplateNameError(input.name)
  }

  const { _max } = await db.systemCategoryTemplate.aggregate({
    _max: { order: true },
  })
  const nextOrder = (_max.order ?? -1) + 1

  return db.systemCategoryTemplate.create({
    data: { name: input.name, color: input.color, order: nextOrder },
  })
}

export interface UpdateTemplateEntryInput {
  id: string
  name?: string
  color?: string
}

/**
 * Renames and/or recolors an entry. A name change is checked for
 * case-insensitive duplicates against every other entry, same rule as
 * `createTemplateEntry`.
 *
 * The final `update()` is wrapped in its own try/catch for Prisma's P2025
 * ("record to update not found"): a real async gap exists between the
 * existence check above and this write (widened further by the extra
 * `findCaseInsensitiveDuplicate` round trip on a rename), during which a
 * concurrent `deleteTemplateEntry` can remove this exact row. Without this,
 * that timing produces a raw, unhandled Prisma error instead of the same
 * friendly `CategoryTemplateEntryNotFoundError` the earlier-timed version of
 * the identical scenario already throws via the `findUnique` check above —
 * see category-template-update-delete-race-unhandled-error.md.
 */
export async function updateTemplateEntry(
  input: UpdateTemplateEntryInput,
): Promise<SystemCategoryTemplateEntry> {
  const entry = await db.systemCategoryTemplate.findUnique({
    where: { id: input.id },
  })
  if (!entry) {
    throw new CategoryTemplateEntryNotFoundError()
  }

  const isRenaming =
    input.name !== undefined && input.name.toLowerCase() !== entry.name.toLowerCase()

  if (isRenaming) {
    const duplicate = await findCaseInsensitiveDuplicate(input.name as string, input.id)
    if (duplicate) {
      throw new DuplicateCategoryTemplateNameError(input.name as string)
    }
  }

  try {
    return await db.systemCategoryTemplate.update({
      where: { id: input.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
      },
    })
  } catch (error) {
    if (isRecordNotFoundError(error)) {
      throw new CategoryTemplateEntryNotFoundError()
    }
    throw error
  }
}

/**
 * AC4's explicit reorder action — `orderedIds` is the complete, desired
 * top-to-bottom id order (every existing entry must appear exactly once).
 * Applied as one batch of `order` updates inside a single transaction so a
 * partial reorder can never be observed mid-write.
 *
 * Same P2025 risk as `updateTemplateEntry` above, widened here across
 * however many ids `orderedIds` contains: any one of them can be
 * concurrently deleted between this function being called and its own
 * `update()` for that id executing inside the batch. Caught and translated
 * to the same friendly `CategoryTemplateEntryNotFoundError` rather than
 * left to escape as a raw Prisma error (previously this function had no
 * error handling around the transaction at all).
 */
export async function reorderTemplateEntries(
  orderedIds: string[],
): Promise<SystemCategoryTemplateEntry[]> {
  try {
    await db.$transaction(
      orderedIds.map((id, index) =>
        db.systemCategoryTemplate.update({
          where: { id },
          data: { order: index },
        }),
      ),
    )
  } catch (error) {
    if (isRecordNotFoundError(error)) {
      throw new CategoryTemplateEntryNotFoundError()
    }
    throw error
  }

  return getSystemCategoryTemplate()
}

/**
 * AC6's "never zero entries" guard. The existence check, the "would this
 * leave zero entries" count, and the delete itself are wrapped in a single
 * `db.$transaction` under `Serializable` isolation — a fix for a
 * count-then-delete TOCTOU race (bug report:
 * category-template-delete-toctou-zero-entries.md): two concurrent deletes
 * of the last two remaining entries could each read `count() === 2` before
 * either had deleted anything, both pass the `total <= 1` guard, and both
 * succeed, leaving zero rows.
 *
 * `Serializable` (not just wrapping the two statements in an ordinary
 * transaction) is what actually closes this — this is a textbook "write
 * skew" anomaly: the two concurrent deletes never touch the SAME row, so
 * even `Repeatable Read` would let both through unmodified. Only
 * `Serializable`'s cross-transaction read/write dependency tracking
 * recognizes that each transaction's own `count()` read was invalidated by
 * the other's concurrent `delete()`, and aborts one of them with Postgres's
 * "could not serialize access" error (Prisma's `P2034`) rather than letting
 * both commit. That abort is caught below and re-surfaced as
 * `CategoryTemplateConcurrentModificationError` — the caller (`deleteCategoryTemplateEntry`)
 * translates it into the same kind of friendly, try-again `ApiResult`
 * failure as every other guard in this file, never a raw unhandled error.
 * Mirrors `features/settings/server/actions.ts`'s
 * `updateDashboardCardVisibility` fix for the identical class of bug, for
 * consistency across this codebase's two "never let a count drop to zero
 * under concurrency" guards.
 */
export async function deleteTemplateEntry(id: string): Promise<void> {
  try {
    await db.$transaction(
      async (tx) => {
        const entry = await tx.systemCategoryTemplate.findUnique({ where: { id } })
        if (!entry) {
          throw new CategoryTemplateEntryNotFoundError()
        }

        const total = await tx.systemCategoryTemplate.count()
        if (total <= 1) {
          throw new CategoryTemplateWouldBeEmptyError()
        }

        await tx.systemCategoryTemplate.delete({ where: { id } })
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
  } catch (error) {
    // `CategoryTemplateEntryNotFoundError`/`CategoryTemplateWouldBeEmptyError`
    // thrown inside the callback above propagate through `$transaction`
    // unchanged (Prisma re-throws whatever the callback threw once it rolls
    // back), so only the Serializable-conflict case needs translating here.
    if (isTransactionConflictError(error)) {
      throw new CategoryTemplateConcurrentModificationError()
    }
    throw error
  }
}
