/**
 * Client-safe return shapes for `features/settings/server/service.ts`, per
 * docs/architecture/phase-4c-technical-design.md §3.6 and
 * docs/product/customization.md. Every read function this feature exposes is
 * a Server-Component-direct-call (there is no `GET` route/hook for either —
 * same "no TanStack Query read" contract Notifications' Phase 4b preferences
 * screen already established), so the shapes below only ever need to be
 * plain, serializable values.
 */

/**
 * A single accent color preset (AC1 of customization.md's Theme & Accent
 * Color capability — "a fixed set of preset options... on the order of five
 * to eight"). `value` is the validated key persisted to
 * `UserPreference.accentColor`; `swatchClassName` is a Tailwind utility class
 * (or CSS color token) the picker component renders as a visual swatch — kept
 * here, not hardcoded a second time in the component, so the palette itself
 * has exactly one source of truth (`server/validation.ts`'s
 * `ACCENT_COLOR_OPTIONS`, re-exported via this type).
 */
export interface AccentColorOption {
  value: string
  label: string
  swatchClassName: string
}

/**
 * A single currency-display option (Currency Display capability AC1 — the
 * fixed USD/EUR/GBP/CAD/AUD/JPY list). `value` is the ISO 4217 code persisted
 * to `UserPreference.currencyDisplay`; `label` is the human-readable name
 * shown in the select.
 */
export interface CurrencyDisplayOption {
  value: string
  label: string
}

/**
 * The caller's fully-resolved preferences row. Per
 * phase-4c-technical-design.md §3.2, `UserPreference` is eagerly seeded at
 * signup, so this always reflects a real row — `accentColor` is the one
 * field still nullable here, since `null` is itself a meaningful, valid state
 * ("product default, unchanged from today" — Theme & Accent Color's own Edge
 * Case), not an absent-row placeholder.
 */
export interface UserPreferenceView {
  accentColor: string | null
  currencyDisplay: string
  timezone: string
  /**
   * Internal race-safety latch (§3.3) — included here only because
   * `timezone-auto-capture.tsx` and `updateTimezone`/`captureInferredTimezone`
   * need to reason about it; the settings UI itself has no reason to render
   * this field directly (customization.md never asks for it to be shown).
   */
  timezoneConfirmed: boolean
}

/**
 * One Dashboard card's fully-resolved show/hide/order state for the caller,
 * per `server/service.ts`'s `getDashboardCardPreferences` materialization
 * (§3.5) — every entry in `DASHBOARD_CARD_KEYS` is always represented here,
 * regardless of whether the user has ever customized that specific card.
 */
export interface DashboardCardView {
  key: string
  label: string
  order: number
  visible: boolean
}
