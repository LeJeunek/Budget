import { db } from "@/lib/db"
import type { SystemCategoryTemplate } from "@prisma/client"

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

  return db.systemCategoryTemplate.update({
    where: { id: input.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
    },
  })
}

/**
 * AC4's explicit reorder action — `orderedIds` is the complete, desired
 * top-to-bottom id order (every existing entry must appear exactly once).
 * Applied as one batch of `order` updates inside a single transaction so a
 * partial reorder can never be observed mid-write.
 */
export async function reorderTemplateEntries(
  orderedIds: string[],
): Promise<SystemCategoryTemplateEntry[]> {
  await db.$transaction(
    orderedIds.map((id, index) =>
      db.systemCategoryTemplate.update({
        where: { id },
        data: { order: index },
      }),
    ),
  )

  return getSystemCategoryTemplate()
}

/**
 * AC6's "never zero entries" guard — counts the table before deleting;
 * removing the last remaining row is rejected outright rather than silently
 * leaving the next signup with no starter categories at all.
 */
export async function deleteTemplateEntry(id: string): Promise<void> {
  const entry = await db.systemCategoryTemplate.findUnique({ where: { id } })
  if (!entry) {
    throw new CategoryTemplateEntryNotFoundError()
  }

  const total = await db.systemCategoryTemplate.count()
  if (total <= 1) {
    throw new CategoryTemplateWouldBeEmptyError()
  }

  await db.systemCategoryTemplate.delete({ where: { id } })
}
