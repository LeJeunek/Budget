/**
 * Shared motion-duration constants — this codebase's one sanctioned set of
 * animation-duration literals for Phase 5b (Motion & Craft), per
 * `docs/architecture/phase-5b-technical-design.md` §2.5/§3.1/§4/§5 and
 * `naming-standards.md`'s Phase 5b entry. A future feature should import one
 * of these rather than hardcoding a fifth, differently-named duration that
 * could silently drift out of sync.
 *
 * Each value below is deliberately its own literal, even where two
 * capabilities' CTO-set bounds overlap (Number Counters' 300-600ms vs. Chart
 * Transitions' 400-800ms) — a reader should never mistake two capabilities
 * sharing a number for an intentional shared value between them. The one
 * deliberate exception is `components/shared/progress-ring.tsx`'s stroke
 * animation, which imports `NUMBER_COUNTER_DURATION_MS` directly so its
 * percentage label (now an `AnimatedNumber`) and its ring both finish at the
 * same instant — that reuse is explicit (an import), not a coincidence.
 */

/**
 * `AnimatedNumber`'s fixed, non-configurable tween duration (Number Counters
 * AC2: "one shared value used consistently everywhere... not tuned per
 * screen or per consumer"). Set to the top of the CTO-fixed 300-600ms bound
 * because it is `ProgressRing`'s own already-shipped stroke-animation
 * duration — letting that component's percentage label reuse this constant
 * with zero per-call tuning (see `progress-ring.tsx`).
 */
export const NUMBER_COUNTER_DURATION_MS = 600

/**
 * `useChartAnimationProps()`'s shared Recharts entrance/update duration
 * (Chart Transitions AC1's 400-800ms bound, and the same value
 * `components/shared/motion/fade-in.tsx`'s default falls back to for the
 * Analytics heatmap's non-Recharts entrance, per Chart Transitions AC5).
 * Deliberately a different literal than `NUMBER_COUNTER_DURATION_MS` — a
 * chart's multi-element entrance is a visually denser event than one number
 * ticking, and this value sits shorter than Recharts' own ~800-1500ms
 * default entrance durations but longer than a single counter's tick, per
 * `docs/product/phase-5b-motion-craft.md`'s "Open Questions Resolved" item 1.
 */
export const CHART_TRANSITION_DURATION_MS = 500

/**
 * `PageTransition`'s fade/offset duration. The product spec leaves this
 * capability's exact figure unfixed ("bounded, consistent duration," unlike
 * Number Counters'/Chart Transitions' own CTO-set numeric bounds) — 300ms is
 * chosen as a fast, single-property (opacity + `transform: translateY`)
 * fade that stays clear of Page Transitions AC2's binding "no
 * Time-to-Interactive regression" bar: per `fade-in.tsx`'s own JSDoc, the
 * wrapped route content is already interactive underneath the fade for this
 * entire duration, so this number only bounds how long the *decorative*
 * fade plays, never when the page becomes usable.
 */
export const PAGE_TRANSITION_DURATION_MS = 300

/**
 * `ExpandableCard`'s height/opacity reveal duration. Also left unfixed by
 * the product spec beyond "orchestrated via Framer Motion" — 250ms is
 * chosen as a snappy disclosure animation, shorter than the other three
 * constants here, consistent with this phase's own "restrained, not showy"
 * craft goal (`phase-5b-motion-craft.md`'s Business Value section) and
 * comparable to common disclosure-widget conventions elsewhere (Radix's own
 * reference examples typically animate accordion/collapsible content in the
 * 200-300ms range).
 */
export const EXPANDABLE_CARD_DURATION_MS = 250
