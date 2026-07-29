"use server"

import { getCurrentUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { ok, fail, type ApiResult } from "@/lib/api-response"

import type { DashboardCardView, UserPreferenceView } from "../types"
import { getDashboardCardPreferences, getUserPreference } from "./service"
import {
  ReorderDashboardCardsSchema,
  TimezoneSchema,
  UpdateAccentColorSchema,
  UpdateCurrencyDisplaySchema,
  UpdateDashboardCardVisibilitySchema,
  UpdateTimezoneSchema,
} from "./validation"

/**
 * Mutating Server Actions for the Settings module, per
 * docs/architecture/phase-4c-technical-design.md §3.6 and
 * docs/architecture/naming-standards.md's Phase 4c Server Action list:
 * `updateAccentColor`, `updateCurrencyDisplay`, `updateTimezone`,
 * `captureInferredTimezone`, `updateDashboardCardVisibility`,
 * `reorderDashboardCards`, `resetDashboardLayout`.
 *
 * Every action, per this codebase's standing convention (mirrors
 * `features/notifications/server/actions.ts`'s own top-of-file note):
 *   1. Calls `getCurrentUser()` and fails closed with "UNAUTHENTICATED".
 *   2. Scopes every write to that session's own `user.id` — a client can
 *      never supply its own `userId`, here or anywhere else in this module.
 *   3. Validates its input with this file's own `server/validation.ts`
 *      schemas before touching the database.
 */

/**
 * `UserPreference` is eagerly seeded at signup (§3.2), but every write below
 * still `upsert`s rather than `update`s — the identical defensive fallback
 * `server/service.ts`'s `getUserPreference` already documents for an account
 * that predates that seeding hook, so a preference edit can never fail with
 * a confusing "record not found" for that edge case. `create`'s data always
 * supplies only the one field being changed; every other column falls back
 * to its own `prisma/schema.prisma` `@default`, so a first-write-ever create
 * still resolves to the exact same defaults a normally-seeded row would have
 * started with.
 */
export async function updateAccentColor(
  input: unknown,
): Promise<ApiResult<UserPreferenceView>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = UpdateAccentColorSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid accent color")
  }

  await db.userPreference.upsert({
    where: { userId: user.id },
    update: { accentColor: parsed.data.accentColor },
    create: { userId: user.id, accentColor: parsed.data.accentColor },
  })

  return ok(await getUserPreference(user.id))
}

/**
 * Updates the caller's display-currency preference (Currency Display
 * capability AC1-3) — a pure formatting preference; see
 * `getUserPreference`'s own JSDoc, this write never touches any stored
 * financial figure.
 */
export async function updateCurrencyDisplay(
  input: unknown,
): Promise<ApiResult<UserPreferenceView>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = UpdateCurrencyDisplaySchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid display currency")
  }

  await db.userPreference.upsert({
    where: { userId: user.id },
    update: { currencyDisplay: parsed.data.currencyDisplay },
    create: { userId: user.id, currencyDisplay: parsed.data.currencyDisplay },
  })

  return ok(await getUserPreference(user.id))
}

/**
 * The ordinary, explicit settings-page timezone edit. Per §3.3, ANY explicit
 * user edit flips `timezoneConfirmed` to `true` unconditionally — whether or
 * not browser auto-capture (`captureInferredTimezone` below) ever ran first —
 * closing the cross-device race the same way regardless of which path got
 * there first.
 */
export async function updateTimezone(
  input: unknown,
): Promise<ApiResult<UserPreferenceView>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = UpdateTimezoneSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid timezone")
  }

  await db.userPreference.upsert({
    where: { userId: user.id },
    update: { timezone: parsed.data.timezone, timezoneConfirmed: true },
    create: { userId: user.id, timezone: parsed.data.timezone, timezoneConfirmed: true },
  })

  return ok(await getUserPreference(user.id))
}

/**
 * `timezone-auto-capture.tsx`'s one Server Action — fired once, on first
 * authenticated mount, with the browser's own `Intl.DateTimeFormat()
 * .resolvedOptions().timeZone`. Per §3.3, this is a no-op unless
 * `timezoneConfirmed === false`; when it does apply, it flips the latch in
 * the SAME write, atomically.
 *
 * The `where: { userId, timezoneConfirmed: false }` clause on the
 * `updateMany` below IS the entire race-safety mechanism — never a
 * read-then-write (a plain `findUnique` check followed by a separate
 * `update` would leave a window where two devices' near-simultaneous mounts,
 * or an auto-capture racing an explicit `updateTimezone` edit, could both
 * "win"). Whichever write actually reaches the database first flips
 * `timezoneConfirmed` to `true`; every other attempt's `updateMany` then
 * matches zero rows and silently no-ops, exactly the "upgraded exactly once,
 * by whichever happens first" guarantee §3.3 requires.
 */
export async function captureInferredTimezone(
  input: unknown,
): Promise<ApiResult<UserPreferenceView>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = TimezoneSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid timezone")
  }

  await db.userPreference.updateMany({
    where: { userId: user.id, timezoneConfirmed: false },
    data: { timezone: parsed.data, timezoneConfirmed: true },
  })

  return ok(await getUserPreference(user.id))
}

// ---------------------------------------------------------------------------
// Dashboard card show/hide/reorder — §3.5. Every write below materializes
// EVERY canonical card key into an explicit row for the caller in one batch
// (never just the one row the caller's input mentions) — the "lazy
// materialization on first customization" pattern §3.5 documents, mirroring
// `NotificationThresholdSettings`'s own upsert-on-first-write precedent.
// ---------------------------------------------------------------------------

/** Writes every entry in `cards` as its own upserted
 * `DashboardCardPreference` row for `userId` — the one place this module
 * turns a fully-resolved, in-memory `DashboardCardView[]` back into durable
 * rows. `Promise.all` (not a `db.$transaction` batch): each upsert targets a
 * distinct `(userId, cardKey)` row with no cross-row invariant to protect
 * (unlike, say, a balance transfer), so there is nothing a transaction would
 * add here beyond what independent, per-row upserts already guarantee. */
async function persistAllCardPreferences(
  userId: string,
  cards: DashboardCardView[],
): Promise<void> {
  await Promise.all(
    cards.map((card) =>
      db.dashboardCardPreference.upsert({
        where: { userId_cardKey: { userId, cardKey: card.key } },
        update: { order: card.order, visible: card.visible },
        create: { userId, cardKey: card.key, order: card.order, visible: card.visible },
      }),
    ),
  )
}

/**
 * Hides or unhides exactly one Dashboard card (AC1). Enforces AC3's "at
 * least one card must remain visible" guard: hiding the last currently
 * visible card is rejected with a clear, user-facing error rather than
 * silently producing an empty Dashboard.
 */
export async function updateDashboardCardVisibility(
  input: unknown,
): Promise<ApiResult<DashboardCardView[]>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = UpdateDashboardCardVisibilitySchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid dashboard card visibility input")
  }
  const { key, visible } = parsed.data

  const current = await getDashboardCardPreferences(user.id)

  if (!visible) {
    const currentlyVisible = current.filter((card) => card.visible)
    const targetIsCurrentlyVisible = currentlyVisible.some((card) => card.key === key)
    if (targetIsCurrentlyVisible && currentlyVisible.length <= 1) {
      return fail(
        "At least one Dashboard card must remain visible — unhide another card before hiding this one.",
      )
    }
  }

  const updated = current.map((card) => (card.key === key ? { ...card, visible } : card))
  await persistAllCardPreferences(user.id, updated)

  return ok(updated)
}

/**
 * Reorders every visible+hidden card in one call (AC2) — `orderedKeys` is
 * the caller's complete new order (validated by `ReorderDashboardCardsSchema`
 * to contain every canonical key exactly once). Visibility is untouched by a
 * reorder — each card keeps whatever show/hide state it already had.
 */
export async function reorderDashboardCards(
  input: unknown,
): Promise<ApiResult<DashboardCardView[]>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = ReorderDashboardCardsSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid dashboard card order input")
  }

  const current = await getDashboardCardPreferences(user.id)
  const currentByKey = new Map(current.map((card) => [card.key, card]))

  const reordered: DashboardCardView[] = parsed.data.orderedKeys.map((key, index) => {
    const existing = currentByKey.get(key)
    return {
      key,
      label: existing?.label ?? key,
      order: index,
      visible: existing?.visible ?? true,
    }
  })

  await persistAllCardPreferences(user.id, reordered)

  return ok(reordered)
}

/**
 * "Reset to Default Layout" (AC4) — a single `deleteMany`, per §3.5: deleting
 * every row for this user returns every card to the pure row-absence default
 * (visible, canonical order) in one statement, with no separate "what is the
 * default" logic to invoke a second time.
 */
export async function resetDashboardLayout(): Promise<ApiResult<DashboardCardView[]>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  await db.dashboardCardPreference.deleteMany({ where: { userId: user.id } })

  return ok(await getDashboardCardPreferences(user.id))
}
