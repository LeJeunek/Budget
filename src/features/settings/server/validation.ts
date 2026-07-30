import { z } from "zod"

import { DASHBOARD_CARD_KEYS } from "@/features/dashboard/dashboard-cards"

import type { AccentColorOption, CurrencyDisplayOption } from "../types"

/**
 * Server-Action input validation for the Settings module, per
 * docs/architecture/naming-standards.md's `PascalCase` + `Schema` convention
 * and phase-4c-technical-design.md §3.6's exact schema list:
 * `AccentColorSchema`, `CurrencyDisplaySchema`, `TimezoneSchema`,
 * `UpdateDashboardCardVisibilitySchema`, `ReorderDashboardCardsSchema`.
 */

// ---------------------------------------------------------------------------
// Accent color — a small, fixed, code-owned palette (customization.md AC1:
// "on the order of five to eight options"). Deliberately a plain Zod string
// union, not a Prisma enum (§3.4) — adding a ninth preset is meant to be a
// one-line change to this array, never a schema migration.
//
// `ACCENT_COLOR_OPTIONS` doubles as both the validation source of truth and
// the picker component's display data (`swatchClassName` maps to an existing
// Tailwind color utility, not a new design-system decision) — one array, no
// second hardcoded copy of "what accent colors exist."
// ---------------------------------------------------------------------------
export const ACCENT_COLOR_OPTIONS: AccentColorOption[] = [
  { value: "blue", label: "Blue", swatchClassName: "bg-blue-500" },
  { value: "violet", label: "Violet", swatchClassName: "bg-violet-500" },
  { value: "emerald", label: "Emerald", swatchClassName: "bg-emerald-500" },
  { value: "amber", label: "Amber", swatchClassName: "bg-amber-500" },
  { value: "rose", label: "Rose", swatchClassName: "bg-rose-500" },
  { value: "teal", label: "Teal", swatchClassName: "bg-teal-500" },
]

const ACCENT_COLOR_VALUES = ACCENT_COLOR_OPTIONS.map((option) => option.value)

/**
 * `accentColor` itself is nullable at the schema/DB level (`null` = product
 * default, Theme & Accent Color's own Edge Case) — this schema validates only
 * the non-null "user picked a preset" case; `updateAccentColor`'s own input
 * schema (`server/actions.ts`) is what allows `null` through as an explicit
 * "clear my preference" input.
 */
export const AccentColorSchema = z.enum(ACCENT_COLOR_VALUES as [string, ...string[]], {
  error: "Must be one of the supported accent color presets",
})

export type AccentColorInput = z.infer<typeof AccentColorSchema>

// ---------------------------------------------------------------------------
// Currency display — customization.md AC1's fixed six-currency starting list.
// Same String-not-enum reasoning as accent color (§3.4): expanding this list
// later is meant to be additive, never a migration.
// ---------------------------------------------------------------------------
export const CURRENCY_DISPLAY_OPTIONS: CurrencyDisplayOption[] = [
  { value: "USD", label: "US Dollar (USD)" },
  { value: "EUR", label: "Euro (EUR)" },
  { value: "GBP", label: "British Pound (GBP)" },
  { value: "CAD", label: "Canadian Dollar (CAD)" },
  { value: "AUD", label: "Australian Dollar (AUD)" },
  { value: "JPY", label: "Japanese Yen (JPY)" },
]

const CURRENCY_DISPLAY_VALUES = CURRENCY_DISPLAY_OPTIONS.map((option) => option.value)

export const CurrencyDisplaySchema = z.enum(
  CURRENCY_DISPLAY_VALUES as [string, ...string[]],
  { error: "Must be one of the supported display currencies" },
)

export type CurrencyDisplayInput = z.infer<typeof CurrencyDisplaySchema>

// ---------------------------------------------------------------------------
// Timezone — §3.3: validated against Node's own `Intl.supportedValuesOf`
// rather than a hand-maintained list, so this always matches whatever
// IANA tz database version the running Node/ICU actually ships.
//
// Validated with TWO checks ANDed together, not `Intl.DateTimeFormat`
// construction alone (bug report:
// timezone-schema-accepts-raw-utc-offsets.md — this file's own PRIOR
// version of this function accepted raw UTC-offset strings like `"+05:00"`
// and legacy aliases like `"PST"`/`"US/Pacific"`/`"EST5EDT"` as "valid,"
// because `Intl.DateTimeFormat`'s constructor is deliberately more
// permissive than "is this an IANA zone name" per ECMA-402 — it also
// resolves raw fixed offsets and legacy compatibility aliases. Accepting a
// raw offset directly contradicts customization.md's own reason for
// choosing an IANA-name dropdown over an offset picker in the first place:
// a fixed offset silently breaks twice a year in a DST-observing region):
//
//   1. `Intl.DateTimeFormat` construction succeeds for `value` (Intl can
//      resolve it at all — kept from the original implementation, still the
//      cheapest first-pass rejection of outright nonsense strings), AND
//   2. `value` is a member of `Intl.supportedValuesOf("timeZone")` — the
//      actual "is this a genuine, canonical IANA zone name" check — OR
//      `value === "UTC"`.
//
// The `=== "UTC"` carve-out preserves this file's own earlier-fixed
// finding, re-stated here so it is never accidentally reintroduced by a
// future edit: confirmed by direct testing against this project's actual
// Node/ICU build that `supportedValuesOf("timeZone")` does NOT include
// `"UTC"`, even though `"UTC"` is a universally valid, ECMA-402-recognized
// timezone identifier and is this exact column's own `prisma/schema.prisma`
// `@default` / safety-net-of-last-resort value (§3.3's Edge Case). Requiring
// set-membership WITHOUT this carve-out would reject the schema's own
// documented default; requiring `Intl.DateTimeFormat` success ALONE (this
// function's pre-fix behavior) accepts far more than genuine IANA names.
// Combining both is what closes the raw-offset/legacy-alias hole while
// keeping "UTC" valid and keeping the "always in sync with the running
// Node/ICU version, never a hand-maintained list" property intact — a
// future ICU update that adds/renames canonical zones is picked up
// automatically by `supportedValuesOf` the same way it always was.
// Computed once at module load, not per-call inside `isValidIanaTimezone` —
// `Intl.supportedValuesOf("timeZone")` allocates a fresh array on every
// call, and this module-level `Set` gives every validation an O(1)
// membership check instead. Still "always in sync with the running Node/ICU
// version" (the whole point of using `supportedValuesOf` at all): this is
// computed once per process, from the same live Intl data, never a
// hand-maintained/checked-in list.
const SUPPORTED_IANA_TIMEZONES = new Set(Intl.supportedValuesOf("timeZone"))

function isValidIanaTimezone(value: string): boolean {
  try {
    // The `resolvedOptions().timeZone` read (rather than a bare
    // `new Intl.DateTimeFormat(...)` statement) is what actually triggers
    // Intl's timezone validation in some engines' lazy-resolution
    // implementations — this also gives the function a real return value to
    // discard instead of an unused constructed instance.
    new Intl.DateTimeFormat(undefined, { timeZone: value }).resolvedOptions()
  } catch {
    return false
  }

  return value === "UTC" || SUPPORTED_IANA_TIMEZONES.has(value)
}

export const TimezoneSchema = z
  .string()
  .refine(isValidIanaTimezone, {
    message: "Must be a valid IANA timezone name",
  })

export type TimezoneInput = z.infer<typeof TimezoneSchema>

// ---------------------------------------------------------------------------
// Server-Action input wrappers — per naming-standards.md's Phase 4c Zod
// schema list, each mutating action's own input is a small object schema
// wrapping the bare value schema above (`AccentColorSchema`/
// `CurrencyDisplaySchema`/`TimezoneSchema`), rather than the action parsing a
// raw scalar directly — the same `{ field: value }` shape every other
// action's input schema in this codebase already uses (e.g.
// `UpdateNotificationPreferenceSchema`).
// ---------------------------------------------------------------------------

/** `updateAccentColor` input. `accentColor` is nullable here (unlike
 * `AccentColorSchema` itself) — `null` is the explicit, valid "clear my
 * preference, go back to the product default" input (Theme & Accent Color's
 * own Edge Case), not an omitted/invalid value. */
export const UpdateAccentColorSchema = z.object({
  accentColor: AccentColorSchema.nullable(),
})

export type UpdateAccentColorInput = z.infer<typeof UpdateAccentColorSchema>

/** `updateCurrencyDisplay` input. */
export const UpdateCurrencyDisplaySchema = z.object({
  currencyDisplay: CurrencyDisplaySchema,
})

export type UpdateCurrencyDisplayInput = z.infer<typeof UpdateCurrencyDisplaySchema>

/** `updateTimezone` input. `captureInferredTimezone` deliberately does NOT
 * use this wrapper — it parses the browser-supplied timezone string directly
 * against the bare `TimezoneSchema`, since that action's one argument is
 * itself a plain string (`Intl.DateTimeFormat().resolvedOptions().timeZone`),
 * never an object. */
export const UpdateTimezoneSchema = z.object({
  timezone: TimezoneSchema,
})

export type UpdateTimezoneInput = z.infer<typeof UpdateTimezoneSchema>

// ---------------------------------------------------------------------------
// Dashboard card show/hide/reorder — validated against the canonical,
// code-owned card-key list (`features/dashboard/dashboard-cards.ts`), per
// §3.5's "cardKey is validated against the canonical list at the application
// layer" requirement. Ownership stays with Dashboard for *what cards exist*;
// this file only consumes that list to validate Settings' own inputs.
// ---------------------------------------------------------------------------
const VALID_CARD_KEYS = new Set(DASHBOARD_CARD_KEYS.map((card) => card.key))

const DashboardCardKeySchema = z.string().refine((value) => VALID_CARD_KEYS.has(value), {
  message: "Must be a recognized Dashboard card key",
})

/**
 * `updateDashboardCardVisibility` input — hide/unhide exactly one card. The
 * "at least one card must remain visible" guard (AC3) cannot be expressed as
 * a pure schema check (it depends on every *other* card's current state, not
 * just this input), so it is enforced in `server/actions.ts` after this
 * schema's structural validation passes.
 */
export const UpdateDashboardCardVisibilitySchema = z.object({
  key: DashboardCardKeySchema,
  visible: z.boolean(),
})

export type UpdateDashboardCardVisibilityInput = z.infer<
  typeof UpdateDashboardCardVisibilitySchema
>

/**
 * `reorderDashboardCards` input — the caller's complete desired order, as an
 * array of every canonical card key exactly once (never a partial list).
 * Requiring the full set here (rather than a sparse "move this one card"
 * delta) keeps the write side a single, unambiguous "here is the new order"
 * statement, mirroring the read side's own "always resolve every key"
 * contract (`getDashboardCardPreferences`) — a caller never has to reason
 * about how a partial reorder interacts with cards it didn't mention.
 */
export const ReorderDashboardCardsSchema = z
  .object({
    orderedKeys: z.array(DashboardCardKeySchema),
  })
  .refine(
    (input) => {
      const unique = new Set(input.orderedKeys)
      return (
        unique.size === DASHBOARD_CARD_KEYS.length &&
        input.orderedKeys.length === DASHBOARD_CARD_KEYS.length
      )
    },
    {
      message: "orderedKeys must contain every Dashboard card key exactly once",
      path: ["orderedKeys"],
    },
  )

export type ReorderDashboardCardsInput = z.infer<typeof ReorderDashboardCardsSchema>
