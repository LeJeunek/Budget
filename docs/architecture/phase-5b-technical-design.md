# FinanceOS — Phase 5b Technical Design: Reduced-Motion Foundation, Number Counters, Expandable Cards, Page Transitions, Chart Transitions

**Author:** Solution Architect, per `roadmap.md`'s Phase 5b milestone 3 ("Solution Architect pass: designs the shared reduced-motion utility... the reusable expandable-card primitive's ownership boundary... and any shared page-transition wrapper's composition point in the app shell").
**Status:** design-stage. No production code has been written against this document yet. UI Component Engineer's primitive build-out and Frontend Lead's per-route application pass are the next dispatches, gated on this document per the roadmap's own phase-gate sequencing.
**Scope:** the five questions the roadmap's Phase 5b milestone 3 and this dispatch route to this pass — the shared reduced-motion mechanism's shape/location (§1), the Number Counter primitive's integration boundary and the resolution of Risk #55 (§2), the Expandable Card primitive's ownership boundary and its two distinct composition contexts (§3), the Page Transition wrapper's composition point in the app shell (§4), and the Chart Transition wiring approach including the Analytics heatmap's exception (§5) — plus the Cross-Cutting GPU-Compositable-Properties Bar's compliance check (§6), the visual-regression-tooling revisit decision (§7, Risk #45/#52), build order (§8), follow-up doc corrections (§9), and new risks (§10).

This document assumes the reader has already read `docs/product/phase-5b-motion-craft.md` in full (as revised — the Number Counters AC1/AC6 reconciliation is closed, not re-litigated here), `docs/planning/roadmap.md`'s "Phase 5 CTO kickoff pass" and both "Phase 5b CTO resolution pass" sections (2026-08-03, including the "Follow-up re-check"), `docs/architecture/phase-5a-technical-design.md` in full (the component boundaries and conventions this document composes with, not against), and risk-register.md rows #39–#55 — reasoning already settled there (no persisted reduced-motion override, `BottomNav`'s relationship to the hamburger sidebar, the 14-chart-consumer count, the five `DataTableCardList` consumers, Number Counters' ten-surface scope) is not re-litigated here.

Every code path, file, and existing pattern cited below was confirmed by direct inspection of current source (`src/components/shared/stat-card.tsx`, `progress-ring.tsx`, `src/components/ui/progress.tsx`, `package.json`, `src/lib/utils.ts`, `src/app/(dashboard)/currency-preference-provider.tsx`, `src/app/(dashboard)/layout.tsx`, `dashboard-shell.tsx`, `src/app/providers.tsx`, `src/app/layout.tsx`, `src/app/(dashboard)/analytics/loading.tsx`, `src/features/accounts/components/account-card.tsx`, `src/features/debt/components/debt-card.tsx`, `src/features/investments/components/portfolio-overview-section.tsx`, `src/features/financial-health-score/components/financial-health-score-badge.tsx` and `financial-health-score-breakdown.tsx`, `src/features/analytics/components/subscriptions-list.tsx` and `spending-heatmap.tsx`, `src/features/dashboard/components/spending-by-category-chart.tsx`, `src/components/shared/data-table/*`) — the same "trust but verify against actual code, not just spec prose" discipline every prior architecture/resolution pass in this project has used.

---

## 1. The shared reduced-motion mechanism

### 1.1 Two layers, each with a distinct, non-overlapping job — not one mechanism reimplemented five times

**Decision: two composition points, both deriving from the one function Framer Motion already exports and already battle-tests — never a hand-rolled `matchMedia` listener of this codebase's own.**

1. **`<MotionConfig reducedMotion="user">`, mounted once, in `src/app/providers.tsx`** (wrapping `{children}` inside the existing `QueryClientProvider`) — the free, zero-code-change default for any bare, declarative `motion.*` component's `transition`. This is what lets `components/shared/progress-ring.tsx`'s existing `motion.circle` (`initial`/`animate`/`transition` on `strokeDashoffset`) satisfy Reduced-Motion Foundation AC3 with **zero edits to that file's own stroke-animation code** — "bringing it under the mechanism" for the ring's stroke is exactly this one root-level mount, not a rebuild, matching the spec's own instruction verbatim.
2. **`useReducedMotion()`, a single re-exported hook, `components/shared/motion/use-reduced-motion.ts`** (`export { useReducedMotion } from "framer-motion"`) — the one canonical import path for every new primitive this phase adds that must **explicitly** branch on the same boolean, because its animation isn't a bare declarative `motion.*` transition `MotionConfig` can reach automatically: `components/ui/progress.tsx`'s plain CSS `transition-all`, the Number Counter primitive's imperative per-frame tween (§2), Recharts' `isAnimationActive` gate (§5), and the Page Transition/Expandable Card wrappers' own "skip the whole wrapper, not just zero its duration" branch (§3/§4).

```ts
// components/shared/motion/use-reduced-motion.ts
/**
 * The one canonical import path for "does this user's OS say no motion."
 * Re-exports Framer Motion's own hook rather than a second, hand-rolled
 * matchMedia listener — there is exactly one subscription to
 * `(prefers-reduced-motion: reduce)` in this app (Framer Motion's internal
 * one), and both this hook and the root `<MotionConfig reducedMotion="user">`
 * (src/app/providers.tsx) read from it, so the two composition points below
 * can never disagree with each other.
 *
 * Reduced-Motion Foundation AC4 (a live OS-level preference change, not just
 * initial load, is honored without a refresh): satisfied by this same
 * re-export — Framer Motion's `useReducedMotion` subscribes to the
 * `matchMedia` query's `change` event internally and re-renders every
 * consumer automatically; this file adds no polling and no separate
 * subscription of its own.
 */
export { useReducedMotion } from "framer-motion"
```

**Why not build a project-owned `matchMedia` hook instead of re-exporting Framer Motion's:** rejected — Framer Motion is already the sole, CTO-approved animation library, its `useReducedMotion` hook is already a public, documented export, and this codebase's own "avoid duplication" standard (already applied to `lib/recurrence.ts`, `lib/merchant-normalization.ts`) applies identically here: writing a second `matchMedia` subscription that happens to check the same media query would be pure duplication with a real, if small, drift risk (two independent listeners could theoretically fire a render on different ticks). Re-exporting is the entire file; there is nothing to get wrong.

**Why `providers.tsx`, not a new file:** `providers.tsx` is already the established, Frontend-Lead-owned, root-level, client-boundary composition point for exactly this class of thing (`QueryClientProvider`) — see that file's own JSDoc ("root-layout plumbing... not a reusable UI component or domain logic"). `MotionConfig` is root-layout plumbing in the identical sense: mounted once, above the whole app (including `/login` and `/admin/*`, since Reduced-Motion Foundation is explicitly app-wide, unlike Page Transitions' narrower `(dashboard)`-only scope — see §4), rendering no visible output of its own. Adding a second, motion-specific provider file for a one-line `<MotionConfig>` wrap would be an unjustified extra file for a single JSX element with no state of its own.

### 1.2 Bringing the two pre-existing instances under the mechanism, without rebuilding either

| File | What changes | Why |
|---|---|---|
| `components/shared/progress-ring.tsx` | **Nothing, for the existing stroke animation.** Mounting `MotionConfig` at the root is the entire "bring it under the mechanism" step for this file's `motion.circle`. (This file does gain an edit for Number Counters' own AC4 — see §2.4 — but that is a new feature, not a reduced-motion retrofit.) | `MotionConfig`'s `reducedMotion="user"` already governs every declarative `motion.*` transition app-wide; this component's animation is already exactly that shape. |
| `components/ui/progress.tsx` | One explicit edit: import `useReducedMotion` from `components/shared/motion`, and conditionally drop the `transition-all` Tailwind class (`cn("size-full flex-1 bg-primary", !prefersReducedMotion && "transition-all")`) on `ProgressPrimitive.Indicator`. | This is a **plain CSS transition**, not Framer Motion — `MotionConfig` has no reach into it at all. This is the one pre-existing instance that genuinely needs a (small, one-line) code change, not a free retrofit — worth stating explicitly since it's the opposite of the `progress-ring.tsx` row above, and a reader should be able to tell why the two differ. |

Both are verified, not assumed: `progress-ring.tsx`'s `motion.circle` was confirmed by direct read (§ this document's own inspection list); `progress.tsx`'s `transition-all` class and inline `transform` style were likewise confirmed directly.

### 1.3 Reduced-Motion Foundation AC5 ("no animation is ever the sole means information is conveyed") — a design constraint on every primitive below, not a separate mechanism

Every primitive this document designs (§2–§5) is required, by its own construction, to render a fully correct, fully legible static end state with the animation entirely absent — this is threaded through each section below as a stated property of that primitive's own API (e.g., `AnimatedNumber` always renders `format(value)` as real text, whether or not a tween is in flight), not bolted on separately.

---

## 2. Number Counters — the `AnimatedNumber` primitive, and Risk #55's resolution

### 2.1 Decision: a new, standalone primitive — `components/shared/motion/animated-number.tsx` — never a `StatCard` prop split, and never a required `StatCard` migration for the six non-`StatCard` surfaces

Risk #55 named three options. **Resolution: a new, independent primitive (option "a separate `AnimatedStatValue`/`useAnimatedNumber` primitive exists that any of the ten surfaces can drop in independently of `StatCard`"), composed with a minor, non-breaking, additive widening of `StatCard`'s own `value` prop type — not a new `StatCard` prop, and not a mandatory migration.**

```tsx
// components/shared/motion/animated-number.tsx  (illustrative shape)
"use client"

export interface AnimatedNumberProps {
  /** The real, current numeric value — never a pre-formatted string. This is
   * the one thing every current StatCard/plain-<span> call site does NOT
   * have readily in scope today at its call site's own abstraction level in
   * some cases (see §2.3) — passing it here is the one required change. */
  value: number
  /**
   * Turns the in-flight (and final) numeric value into what's actually
   * rendered — a `ReactNode`, not just a `string`, so a caller's existing
   * sign-dependent color treatment (e.g. Investments' `GainLossText`) can be
   * expressed directly inside this callback rather than needing a second,
   * separate live-value subscription. This is the ONLY place a formatted
   * string is ever produced — always by calling the caller's own
   * `formatCurrency`/`useFormatCurrency`-backed function, per AC3's "no
   * second, parallel formatting path" — AnimatedNumber itself contains zero
   * formatting logic of its own.
   */
  format: (current: number) => React.ReactNode
  className?: string
}

export function AnimatedNumber({ value, format, className }: AnimatedNumberProps) {
  const prefersReducedMotion = useReducedMotion()
  const motionValue = useMotionValue(value)
  const [display, setDisplay] = useState<React.ReactNode>(() => format(value))
  const previousValue = useRef(value)

  useEffect(() => {
    if (Object.is(previousValue.current, value)) return // AC1: never re-triggered by an unrelated re-render
    previousValue.current = value

    if (prefersReducedMotion) {
      motionValue.set(value)
      setDisplay(format(value)) // AC5: instant snap, still through the real pipeline
      return
    }

    const controls = animate(motionValue, value, {
      duration: NUMBER_COUNTER_DURATION_MS / 1000,
      ease: "easeOut",
    })
    return () => controls.stop() // AC (rapid successive updates): newest wins, cleanly
  }, [value, prefersReducedMotion])

  useMotionValueEvent(motionValue, "change", (latest) => setDisplay(format(latest)))

  return <span className={className}>{display}</span>
}
```

This satisfies every constraint Risk #55 named:
- **(a) No second, parallel formatting path.** `AnimatedNumber` never formats anything itself — `format` is always the caller's own `formatCurrency`/`useFormatCurrency`-backed function, called on every tick exactly as it would be called once for a static render. There is one formatting call site per consumer, animated or not.
- **(b) Works for all ten AC6 surfaces, not just `StatCard`'s five.** `AnimatedNumber` has no dependency on `StatCard` at all — it is a bare `<span>` any Server or Client Component can render as a child (see §2.3's per-surface mapping — several of the six non-`StatCard` surfaces are Server Components, which can render this Client Component leaf directly, exactly the way `financial-health-score-badge.tsx` already renders the Client Component `Tooltip` inside `spending-heatmap.tsx` today, and exactly the way `financial-health-score-badge.tsx` itself is already a Server Component with no conversion needed).
- **(c) No breaking change forced on `StatCard`'s five existing callers.** See §2.2 — `StatCard`'s `value` prop type widens from `string | number` to `React.ReactNode`, a type-widening that is compile-time-compatible with every existing call site (a `string` is already a valid `ReactNode`) and requires zero edits to any of the five current callers unless/until they're deliberately migrated to pass an `<AnimatedNumber>` instead.

### 2.2 `StatCard`'s own change: one type widening, not a new prop

`components/shared/stat-card.tsx`'s `StatCardProps.value: string | number` becomes `value: React.ReactNode`, with its doc comment updated to read: *"Already-formatted value, or an `AnimatedNumber` for a headline figure that should count up/down on change (Number Counters, Phase 5b) — this component performs no formatting or animation logic of its own either way."* No other line of `stat-card.tsx` changes. This is deliberately the smallest possible edit that unlocks the four `StatCard`-based AC6 surfaces (Dashboard, Budgeting, Goals/Financial Goals, Recurring Income): each one's own call site changes from `value={formatCurrency(x, currency)}` to `value={<AnimatedNumber value={x} format={(n) => formatCurrency(n, currency)} />}` — a per-surface Frontend Lead implementation-time edit, not an architecture-time one, mirroring 5a's own "this pass fixes the mechanism, not the per-feature visual choice" precedent for `ResponsiveDataTable`'s `meta.cardDisplay` migration.

**Rejected alternative — a new, second `StatCard` prop (e.g. `rawValue: number` + `format`) alongside the existing `value` prop:** rejected. It would require `StatCard` to internally decide which of two mutually-exclusive props "wins," adds a second code path inside an already-simple, five-line render function, and buys nothing the type-widening above doesn't already give for free — the existing `value` prop already accepts anything renderable once its type is widened, so a second prop would be pure duplication of the same capability.

### 2.3 Per-surface mapping — grounding the design in the ten actual AC6 surfaces, not an abstraction

| Surface | Today | Change |
|---|---|---|
| Dashboard, Budgeting, Goals/Financial Goals, Recurring Income (`StatCard` consumers) | `value={formatCurrency(x, currency)}` | `value={<AnimatedNumber value={x} format={(n) => formatCurrency(n, currency)} />}` — `StatCard` itself unchanged beyond §2.2's type widening. |
| Accounts (`account-card.tsx`, Client Component, already has `formatCurrency` bound via `useFormatCurrency()`) | `<span>{formatCurrency(account.balance)}</span>` | `<AnimatedNumber value={account.balance} format={formatCurrency} className="font-heading text-2xl font-semibold text-foreground" />` — `useFormatCurrency()`'s return type, `(amount: number) => string`, already matches `format`'s signature exactly; no wrapper needed. |
| Debt (`debt-card.tsx`, same shape as Accounts) | `<span>{formatCurrency(debt.effectiveBalance)}</span>` | Identical pattern to Accounts — `format={formatCurrency}` directly. |
| Investments (`portfolio-overview-section.tsx`, **Server Component**, `currency` already threaded as a prop) | `{formatCurrency(overview.totalCurrentValue, currency)}`; `GainLossText`'s sign-based color | `<AnimatedNumber value={overview.totalCurrentValue} format={(n) => formatCurrency(n, currency)} .../>`. `GainLossText`'s existing red/green sign logic moves **inside** the `format` callback (`format={(n) => <span className={n < 0 ? "text-red-700..." : "text-emerald-700..."}>{n < 0 ? "" : "+"}{formatCurrency(n, currency)}</span>}`) — this is what correctly satisfies the spec's "sign-dependent visual treatment switches at the exact moment the value crosses zero" edge case: because `format` is re-invoked with the live, in-flight value on every tick (§2.1), the color flips mid-animation at the real crossing point, not only at the final settled value. A `GainLossText`-shaped helper *function* (not a component) can still exist for this, called from inside `format` — a Frontend Lead implementation-time call, not fixed here. |
| Financial Health Score badge (`financial-health-score-badge.tsx`, **Server Component**, plain integer score, no currency) | `<span>{breakdown.score}</span>` | `<AnimatedNumber value={breakdown.score} format={(n) => Math.round(n).toString()} .../>` — no currency involved; AC4's "percentage/score figures get identical treatment to currency figures" is satisfied by using the exact same primitive, just a different `format` callback. Server Component parent renders this Client Component leaf directly, no `"use client"` conversion of the badge itself — identical composition rule already established by this same file rendering `HeartPulse` and by `spending-heatmap.tsx` rendering `Tooltip`. |
| Financial Health Score breakdown grid (`financial-health-score-breakdown.tsx`, **Server Component**, four subscores) | `{value === null ? "Not enough data" : value}` per component | The `null` branch is unchanged (AC1's edge case: never interpolate to/from a non-numeric state) — only the non-null branch swaps to `<AnimatedNumber value={value} format={(n) => Math.round(n).toString()} />`. |
| Analytics (multiple components, e.g. `subscriptions-list.tsx`'s `activeAnnualizedTotal`) | `{formatCurrency(activeAnnualizedTotal)}` (via `useFormatCurrency()`, already a Client Component) | Same pattern as Accounts/Debt — `format={formatCurrency}` directly. Analytics' own AC7 "headline, not row-level" line is what scopes this to the one or two genuine headline figures per Analytics surface (e.g. this running total), never every table row — a Frontend Lead per-component judgment call, not an architecture-time enumeration, mirroring 5a's identical "primary column" per-consumer judgment call. |

### 2.4 `ProgressRing`'s own change — the label, not the ring

`components/shared/progress-ring.tsx`'s default label (`{Math.round(clamped)}%`, currently a plain, non-animated text node) is Number Counters' second named existing mechanism (AC1). It gains: `showDefaultLabel && (label ?? <AnimatedNumber value={clamped} format={(n) => `${Math.round(n)}%`} />)`. **The shared duration constant is deliberately set to 600ms (§2.5) specifically so this file needs no `durationMs` override** — the label's new counting animation and the ring's own pre-existing 600ms stroke transition finish at the same instant, for free, because they now both derive from the same one number. As a small, low-risk "avoid duplication" bonus, the ring's own existing `transition={{ duration: 0.6, ... }}` is changed to `transition={{ duration: NUMBER_COUNTER_DURATION_MS / 1000, ... }}` — ties an already-shipped value to the new shared constant rather than leaving two independent `0.6`/`600` literals that could silently drift apart in a future edit.

### 2.5 The shared constant, and why `AnimatedNumber` exposes no `durationMs` override

`components/shared/motion/constants.ts` exports `NUMBER_COUNTER_DURATION_MS = 600` — the top of the CTO-fixed 300–600ms bound, chosen specifically because it is `progress-ring.tsx`'s own already-shipped, already-reasonable stroke-animation duration (§2.4), letting the ring's label need zero per-call tuning. **`AnimatedNumber` deliberately does not accept a `durationMs` prop at all** — Number Counters AC2 ("one shared value used consistently everywhere... not tuned per screen or per consumer") is safer as a hard API constraint than a documented convention a future caller could quietly ignore; a consumer that genuinely needs a different duration is a product-scope question for a future spec revision, not an implementation-time knob this primitive should offer today.

### 2.6 Edge cases, resolved by construction

- **Null/undefined values**: `AnimatedNumber` requires a `number` — callers with a nullable figure branch **before** rendering it (`value === null ? <span>—</span> : <AnimatedNumber value={value} ... />`), the identical pattern `financial-health-score-badge.tsx`/`-breakdown.tsx` already use today for their own null branches. Keeping `AnimatedNumber` itself non-nullable is a single-responsibility choice — it animates a definite number; deciding what a missing figure renders as is each surface's own existing, unchanged concern.
- **Zero-crossing**: resolved in §2.3's Investments row — sign-dependent styling lives inside `format`, called with the live in-flight value every frame, so it switches at the true crossing point.
- **Large single-update jumps**: duration is a fixed constant (§2.5), never magnitude-scaled, by construction.
- **`StatCard`'s loading skeleton resolving to a value**: unaffected — `StatCard`'s existing `loading` boolean branch is untouched; once `loading` becomes `false`, the value slot (now possibly an `<AnimatedNumber>`) mounts fresh and animates from its own default starting point, exactly the ordinary AC1a mount case.

---

## 3. Expandable Cards — ownership boundary and the two composition contexts

### 3.1 File layout: a raw Radix semantics wrapper in `components/ui/`, the actual animated primitive in `components/shared/motion/`

**Decision:**
```
components/ui/
└── collapsible.tsx            # NEW — thin Radix wrapper (Root/Trigger/Content), no Framer Motion,
                                #   no animation at all — shadcn-style, matching dialog.tsx/sheet.tsx/
                                #   progress.tsx's existing "import { X as XPrimitive } from 'radix-ui'"
                                #   convention exactly
components/shared/motion/
├── use-reduced-motion.ts       # §1.1
├── constants.ts                # §2.5 + this section + §4/§5
├── expandable-card.tsx         # NEW — ExpandableCard: composes ui/collapsible.tsx + Framer Motion's
                                 #   height/opacity reveal + the shared reduced-motion hook
├── animated-number.tsx         # §2
├── fade-in.tsx                 # §4/§5
├── page-transition.tsx         # §4
└── index.ts                    # re-exports all of the above — one import surface, mirroring
                                 #   data-table/index.ts's existing convention
```

**Why this split, not one file:** `components/ui/collapsible.tsx` is the exact same tier as `dialog.tsx`/`sheet.tsx`/`progress.tsx` — a raw, unstyled-but-typed Radix primitive wrapper, reusable by anything, carrying zero FinanceOS-specific visual or animation opinion. `components/shared/motion/expandable-card.tsx` is the actual product-level "expandable card" the spec names — Framer-Motion-orchestrated, reduced-motion-aware, this codebase's own opinion on top of Radix's semantics. This mirrors 5a's own established layering exactly (`components/ui/sheet.tsx`'s raw Radix `Dialog` primitive vs. `features/calendar/components/day-detail-sheet.tsx`'s feature-specific composition on top of it) — reuse the battle-tested primitive for the accessibility-critical wiring, add the product's own animation as a distinct, separate layer.

**Why Radix's `Collapsible`, not hand-rolled `aria-expanded`/`aria-controls`:** rejected the hand-rolled alternative outright. AC2's whole point is closing the exact gap (`subscriptions-list.tsx`'s missing `aria-controls`) that comes from hand-wiring this by hand in the first place. Radix's `Collapsible.Trigger`/`Collapsible.Content` generate and link a matching id automatically, with zero opt-in configuration — the identical "already solved by the library FinanceOS already depends on" reasoning 5a's §5.2 already used for `Dialog`/`Sheet` focus-trap/return. Reinventing it here would be the same class of unnecessary, riskier duplication.

```tsx
// components/shared/motion/expandable-card.tsx (illustrative shape)
"use client"

export interface ExpandableCardProps {
  /** Content of the always-visible trigger control (label + chevron, etc.)
   * — NOT a summary of the disclosed content; this component renders no
   * `Card`/border chrome of its own (see note below). */
  trigger: React.ReactNode
  /** The disclosed detail, hidden until expanded. */
  children: React.ReactNode
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  className?: string
}

export function ExpandableCard({ trigger, children, ...rest }: ExpandableCardProps) {
  const prefersReducedMotion = useReducedMotion()

  return (
    <Collapsible {...rest}>
      <CollapsibleTrigger asChild>{trigger}</CollapsibleTrigger>
      <CollapsibleContent forceMount>
        {/* forceMount hands unmount/remount timing to AnimatePresence below,
            instead of Radix's own default instant show/hide — the standard
            Radix-primitive-plus-Framer-Motion-visual-layer composition. */}
        <AnimatePresence initial={false}>
          {(rest.open ?? rest.defaultOpen) !== false /* Collapsible's own open state, read via Radix context in the real impl */ && (
            <motion.div
              initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={prefersReducedMotion ? undefined : { height: 0, opacity: 0 }}
              transition={{ duration: prefersReducedMotion ? 0 : EXPANDABLE_CARD_DURATION_MS / 1000 }}
            >
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </CollapsibleContent>
    </Collapsible>
  )
}
```

**Important, explicit note carried into this file's own JSDoc:** `ExpandableCard` renders **no** `Card`/border chrome of its own — it is the disclosure mechanism only. This is deliberate, so it composes correctly inside a `DataTableCardList` row's own existing `<Card>` (§3.2) and inside `SubscriptionsList`'s own existing outer `<Card>` (§3.3) without ever double-nesting a second border/shadow.

**The height-reveal is this phase's one named GPU exception** (Cross-Cutting AC2) — Framer Motion's ability to animate to/from `height: "auto"` directly (measuring the actual rendered content height) is used rather than a manual `ResizeObserver`/CSS-custom-property technique, since Framer Motion already provides this natively and reliably.

### 3.2 Composition inside `DataTableCardList` — a new, additive `meta.cardDisplay` value, never a reinterpretation of `"secondary"`

**Decision: 5a's existing `ColumnDef.meta.cardDisplay: "primary" | "secondary" | "hidden"` union gains a fourth, purely additive value: `"expandable"`.** `"primary"` and `"secondary"` columns render exactly as 5a shipped them — always visible, unchanged behavior, unchanged default. A column annotated `"expandable"` is rendered **only** inside a new `ExpandableCard` region appended to the bottom of the card, with a small, dedicated trigger control (a chevron + "Show more" affordance, copy/exact placement a Frontend Lead call) — **distinct from, not a repurposing of, `"primary"`/`"secondary"` content**, and distinct from the row's own existing per-row action control (Mark Paid/`MoreHorizontal` menu), per the spec's own touch-target-adjacency edge case.

**Why not reinterpret `"secondary"` as "hidden until expanded" instead of adding a fourth value:** rejected. 5a's `"secondary"` default explicitly exists so an unannotated column degrades safely to *visible*, not hidden (Risk #51) — a decision already Bug-Hunter/axe-core-verified and shipped. Silently changing what `"secondary"` means would be an undocumented regression against an already-reviewed guarantee for all five existing consumers, discovered only by a careful diff, not a clean, additive change a reviewer can see in one line. A new, opt-in fourth value costs nothing and regresses nothing.

`DataTableCardList` gains one small conditional: if any column in a given table's `columns` has `meta.cardDisplay === "expandable"`, that row's card wraps those cells' `flexRender`ed content in `<ExpandableCard>`; if none do, the row renders exactly as it does today, with no `ExpandableCard` wrapper at all — a hypothetical future `DataTableCardList` consumer that never needs per-row expansion isn't forced into carrying the primitive's DOM/JS at all. Which fields each of the five consumers (Transactions, Admin's `UserTable`/`AuditLogTable`, Bills'/Recurring Income's `OccurrenceHistoryTable`) marks `"expandable"` is the Frontend Lead's/UI Component Engineer's implementation-time call, per the product spec's own explicit deferral — this pass fixes the mechanism only.

### 3.3 Composition for Analytics' dismissed-merchants toggle — a direct, standalone drop-in, no card-list involvement

`subscriptions-list.tsx`'s existing ad hoc block (`useState<boolean>` + `Button` with `ChevronDown`/`ChevronRight` + `aria-expanded`, no `aria-controls`) is replaced directly:

```tsx
<ExpandableCard
  trigger={
    <Button variant="ghost" size="sm" className="w-fit gap-1 px-2 text-muted-foreground">
      <ChevronRight /* Radix Collapsible's data-state drives the icon swap via CSS, not manual state */ />
      Dismissed merchants ({dismissedMerchants.length})
    </Button>
  }
>
  <Table>{/* unchanged existing table markup */}</Table>
</ExpandableCard>
```

This is a genuinely different composition context from §3.2 — no `DataTableCardList`/`ColumnDef` involvement at all, `ExpandableCard` used directly inside `SubscriptionsList`'s own existing `<Card>`. Demonstrating both contexts work from the same, single, unmodified primitive is the concrete proof that AC1's "one single, reusable... primitive... used everywhere" holds, not an assumption. The existing dismiss/undismiss Server-Action behavior is untouched, per the spec's own "only the toggle's own implementation changes" instruction.

### 3.4 Reduced motion and edge cases

- **Instant show/hide, `aria-expanded` still correct**: Radix's `Collapsible` state (and therefore `aria-expanded`) is entirely independent of the Framer Motion visual layer — toggling still works, and `aria-expanded` still flips, with zero visual transition, purely by setting `transition={{ duration: 0 }}` and skipping the `initial`/`exit` height/opacity states when `prefersReducedMotion` is true (§3.1's sketch).
- **Multiple cards expanded simultaneously**: each `ExpandableCard` instance owns its own independent open state (uncontrolled by default) — no shared/global expanded-index state exists anywhere, so this holds by construction, not by convention.
- **Data changes while expanded**: `ExpandableCard`'s open state lives in Radix's own internal state (or the caller's controlled `open` prop), entirely independent of the `children` content passed in — new data simply re-renders inside the still-open region, exactly as any other React child update would, with no code path that could collapse it as a side effect.

---

## 4. Page Transitions — composition point in the app shell

### 4.1 Decision: a new `src/app/(dashboard)/template.tsx`, not a change to `dashboard-shell.tsx`

**Decision: Next.js's own `template.tsx` file convention, scoped to `(dashboard)/`, is the composition point — not a wrapper inside `dashboard-shell.tsx`'s existing `{children}` slot.**

Next.js layouts persist across navigations within their scope (state doesn't reset); templates create a **new instance of their children on every navigation** within their scope, specifically designed for exactly this "animate on every route change" need. `(dashboard)/layout.tsx` and `dashboard-shell.tsx` must keep persisting unchanged — `DashboardShell`'s own `mobileNavOpen`/`lastMobileNavOpenTriggerRef` state (5a, `dashboard-shell.tsx`'s own JSDoc) would break if that file remounted on every navigation. `template.tsx` sits **inside** `layout.tsx`'s children slot (rendered by Next.js between the layout and each route's own Suspense/`loading.tsx` boundary) — `Sidebar`/`TopNav`/`BottomNav` keep their continuous, un-remounted lifecycle exactly as 5a built them; only the route segment's own content (which already unmounts/remounts on every navigation today, template.tsx or not) gains an animated wrapper around that already-existing boundary.

```tsx
// src/app/(dashboard)/template.tsx (NEW — Frontend Lead composition, thin)
import type { ReactNode } from "react"
import { PageTransition } from "@/components/shared/motion"

export default function DashboardTemplate({ children }: { children: ReactNode }) {
  return <PageTransition>{children}</PageTransition>
}
```

```tsx
// components/shared/motion/page-transition.tsx (NEW — UI Component Engineer primitive)
"use client"

export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <FadeIn durationMs={PAGE_TRANSITION_DURATION_MS} offsetY={8}>
      {children}
    </FadeIn>
  )
}
```

`PageTransition` is a thin, named wrapper around the shared `FadeIn` primitive (§4.2) with the page-specific duration constant — it exists as its own file/name purely for call-site clarity at `template.tsx` (self-documenting: a reader sees "page transition," not a generic "fade"), not because its mechanism differs from `FadeIn` in any way.

**Rejected alternative — animate inside `dashboard-shell.tsx`'s `{children}` slot via a manual `key={pathname}` on a wrapping `motion.div`:** rejected. This requires reading `usePathname()` and manually forcing a remount via `key`, which is a less standard, more fragile hand-rolled substitute for a mechanism (`template.tsx`) Next.js already built and documents for precisely this use case — and it does not sidestep §4.3's caching-interaction question either (any per-navigation-remount approach has the identical characteristic), so it buys no advantage while adding hand-rolled complexity `template.tsx` doesn't require.

### 4.2 `FadeIn` — the one shared primitive both Page Transitions and the Analytics heatmap (§5.3) reuse

```tsx
// components/shared/motion/fade-in.tsx (NEW)
"use client"

export interface FadeInProps {
  children: React.ReactNode
  durationMs?: number
  /** Optional vertical offset the content animates up from, in pixels. */
  offsetY?: number
  className?: string
}

export function FadeIn({ children, durationMs = CHART_TRANSITION_DURATION_MS, offsetY = 0, className }: FadeInProps) {
  const prefersReducedMotion = useReducedMotion()

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div> // AC5: no motion wrapper at all, not just a zeroed duration
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: offsetY }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: durationMs / 1000, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  )
}
```

Factoring this out avoids re-implementing "mount fade + explicit reduced-motion branch" three times (page transitions, the heatmap's entrance, and any future mount-fade need) — the exact "genuinely cross-feature, needed by more than one consumer" bar this codebase's own `lib/` utilities are already held to, applied here inside `components/shared/motion/` since this is a UI-rendering primitive, not business logic.

**Why an explicit branch here too, given `MotionConfig` is already mounted (§1.1):** consistency and testability. Every new primitive this phase builds branches explicitly on the same one hook, rather than some relying on `MotionConfig`'s implicit reach and others not — one uniform, directly-assertable pattern (a Playwright test can assert "no `motion.div`/no animation-bearing attribute is present at all" rather than "duration resolved to zero"), not a mix of two different reduced-motion mechanisms depending on which primitive you're reading.

### 4.3 Interaction with `loading.tsx` (AC3) — composes around it by construction, one caveat flagged for verification

Next.js's render hierarchy places `template.tsx` **outside** each route's own Suspense boundary (`loading.tsx`). `PageTransition`'s fade plays once, on `template.tsx`'s own mount for the new navigation; the inner `loading.tsx`-to-real-content swap (where one exists — today, only `analytics/loading.tsx`) happens **inside** that already-settled wrapper, with zero animation of its own layered on top — satisfying AC3 by construction, not by a special-cased check for the one route that has a `loading.tsx` today.

**One real, flagged tradeoff, not silently assumed away:** because `template.tsx` forces a fresh component-instance mount on every navigation within `(dashboard)/`, repeat navigation to an already-visited route (most concretely `/analytics`, the one route with its own dedicated `loading.tsx`) may re-play that loading skeleton even when Next.js's Router Cache would otherwise make that navigation feel instant — this is a known characteristic of `template.tsx`, not something this design can avoid while still using the standard mechanism (any per-navigation-remount approach, including the rejected `key`-based alternative above, has the identical characteristic). Flagged for the Frontend Lead to verify empirically and for the Performance Engineer's TTI-regression review (Page Transitions AC2) to measure directly — see new Risk #58.

### 4.4 Edge cases, resolved by construction

- **Navigating to the currently-active route**: no Next.js navigation/template remount occurs at all for a same-URL click, so no transition plays — true by construction, not a special case this design has to detect.
- **Rapid successive navigation / back-forward**: each navigation produces its own fresh `template.tsx` instance with its own fresh `FadeIn` mount, with no reference to any prior instance's state to desync from — true by construction.
- **Slow dynamic-route fetch**: the transition only wraps the shell-to-content handoff (§4.3) and never extends its own fixed duration to wait on a fetch.

---

## 5. Chart Transitions — the shared gate, and the heatmap's exception

### 5.1 `useChartAnimationProps()` — one hook, spread onto all 14 Recharts consumers

```ts
// components/shared/motion/chart-animation.ts (NEW)
"use client"

export interface ChartAnimationProps {
  isAnimationActive: boolean
  animationDuration: number
  animationEasing: "ease" | "ease-in" | "ease-out" | "ease-in-out" | "linear"
}

export function useChartAnimationProps(): ChartAnimationProps {
  const prefersReducedMotion = useReducedMotion()
  return {
    isAnimationActive: !prefersReducedMotion,
    animationDuration: CHART_TRANSITION_DURATION_MS,
    animationEasing: "ease-out",
  }
}
```

Each of the 14 chart components (§0's own inspection list — Dashboard's four, Analytics' six, Investments' two, Financial Goals' one, Financial Health Score's one) spreads this onto its Recharts primitive(s):

```tsx
// spending-by-category-chart.tsx (illustrative diff)
const chartAnimationProps = useChartAnimationProps()
<Pie data={data} dataKey="amount" nameKey="categoryName" {...chartAnimationProps}>
```

This is the entire mechanism per AC3 — Recharts' own native `isAnimationActive`/`animationDuration`/`animationEasing` props are the mechanism, this hook is only the one shared source for the constant/gate every one of the 14 consumers reads identically, closing exactly the "14 chart consumers... reinvent it" risk the dispatch named. `CHART_TRANSITION_DURATION_MS = 500` lives in `components/shared/motion/constants.ts`, alongside `NUMBER_COUNTER_DURATION_MS` — within the spec's own 400–800ms bound, deliberately a different literal value than the counter's 600ms so a reader never mistakes the coincidence of two capabilities' constants for one shared value between them (they are not the same capability and must not be tuned together).

**"Update, without full remount" (AC1's second half) requires no additional wiring** — Recharts re-animates on a `data` prop change natively as long as `isAnimationActive` stays `true` and nothing forces a full component remount. **Flagged as an implementation-time risk, not solved architecturally here:** a chart consumer that keys its Recharts primitive by something that changes every render (e.g. a derived string from `data` itself) would force a remount and retrigger the *entrance* animation on every update instead of Recharts' own native update-interpolation — worth a one-time check across all 14 consumers at implementation time, the same class of "verify the annotation is actually correct" review 5a's Risk #51 already established for `cardDisplay`.

### 5.2 CLS (AC2) — unaffected by this wiring, already the existing container's job

Every chart's container already reserves its final dimensions via its existing fixed-height wrapper (e.g. `spending-by-category-chart.tsx`'s `h-64` `div`) before `ResponsiveContainer`/Recharts render anything — `useChartAnimationProps()` only affects the chart's *internal* drawing, never the container's box, so AC2 requires no new mechanism, only a confirmation (Frontend Lead/Bug Hunter's implementation-time pass) that no consumer's existing container sizing was accidentally coupled to its data.

### 5.3 The Analytics heatmap — `FadeIn`, no new file, no `"use client"` conversion

`spending-heatmap.tsx` is not a Recharts component (confirmed — no `recharts` import) and is a **Server Component today**. Its entrance treatment reuses §4.2's `FadeIn` directly:

```tsx
// spending-heatmap.tsx (illustrative diff — wraps the existing returned grid JSX)
import { FadeIn } from "@/components/shared/motion"
// ...
return (
  <Card>
    <CardHeader>...</CardHeader>
    <CardContent className="flex flex-col gap-4">
      <FadeIn durationMs={CHART_TRANSITION_DURATION_MS}>
        {/* existing grid JSX, unchanged */}
      </FadeIn>
    </CardContent>
  </Card>
)
```

**No new file, and no conversion of `DailySpendingHeatmap` itself to a Client Component**, is needed — a Server Component can render a Client Component (`FadeIn`) directly as a child, passing already-server-rendered JSX as `children`, exactly the same composition rule this file already relies on for `Tooltip` (also a Client Component, already rendered as a child today, per this file's own header comment). This is the smallest possible change satisfying AC5's "identical bounded, CLS-free entrance treatment... via Framer Motion" requirement: an opacity-only fade introduces zero layout shift by construction, since no dimension changes at all — CLS-free trivially, not by a separate check.

---

## 6. Cross-Cutting GPU-Compositable-Properties Bar — compliance check

Every primitive in §2–§5 animates only `opacity`/`transform`(`y`) — `AnimatedNumber` (text content re-render, not a CSS property animation at all — see the risk flagged below), `FadeIn`/`PageTransition` (`opacity`, `y`-as-`transform`), the two named exceptions (`ExpandableCard`'s `height` reveal, `ProgressRing`'s pre-existing `strokeDashoffset`) are exactly the spec's own two accepted exceptions, unchanged and un-added-to by this design.

**One tension surfaced, not silently reconciled: Recharts' own native animation mechanism (§5.1, this phase's mandated tool per AC3) animates SVG geometry attributes directly (bar height/position, arc angle, line path) — not the CSS `transform`/`opacity` properties the GPU bar's own AC1/AC3 ask for**, and AC3 explicitly places "native Recharts animation" in the "no exception... must comply without one" bucket. This is not something this design can resolve by building a different chart-animation mechanism (that would violate AC3's own tool-fit instruction to use Recharts' native props, not a Framer Motion reimplementation) — it is a genuine, unreconciled tension in the product spec's own text, flagged here rather than silently complied-with-on-paper. Routed to the Performance Engineer's review gate as new Risk #56, where it can actually be measured (does Recharts' own animation in practice run acceptably, e.g. because the animated SVG regions are small/composited layers anyway) rather than asserted either way at the architecture stage.

---

## 7. Visual-regression tooling — re-examined fresh, still not adopted, trigger refined

Per Risk #45/#52's own standing instruction ("5b's... Solution Architect pass should weigh it fresh"), this is that fresh weighing — not a silent skip.

**Decision: still not adopted, for a reason specific to this pass's own position in the pipeline, not a repeat of 5a's reasoning.** Risk #52's own trigger requires "a real, shipped visual regression this phase's structural checks plus manual review missed." **This architecture pass produces no rendered pixel of 5b's own output at all** — no chart, page transition, expandable card, or counter this document designs has been built yet. There is, by construction, no evidence for the trigger's own bar to apply to at this exact point in the pipeline; adopting (or re-declining) based on a guess about what implementation will produce would be exactly the "speculative infrastructure ahead of a demonstrated need" this project has already declined four times (Risk #28, the reduced-motion-override rejection, 5a's cross-browser-Playwright-scope decision, 5a's own visual-regression decision).

**The trigger is refined, not left unresolved indefinitely:** the next point in this sub-phase's own pipeline where actual rendered output first exists to evaluate is the Bug Hunter's cross-surface motion review and the E2E Test Engineer's reduced-motion Playwright pass (roadmap Section 6 milestone 5) — **that** is where Risk #52's "real, shipped visual regression" evidence bar can actually be checked against something real, not this pass. If either of those finds a genuine visual regression this phase's motion work introduced that the structural/manual checks missed, that reviewer (or the Release Manager at the review gate) should raise the visual-regression-tooling question at that point — not send it back through a second Solution Architect pass first. See Risk #52's updated entry in the risk register.

---

## 8. Build order for the UI Component Engineer, and what the Frontend Lead's later pass depends on

**Foundation, built first, blocking everything else:** `components/shared/motion/use-reduced-motion.ts` + `constants.ts` — zero dependents, every other file in this phase imports one or both.

**`<MotionConfig reducedMotion="user">` mounted in `src/app/providers.tsx`** (Frontend Lead, root-plumbing ownership) can and should happen immediately alongside the foundation above — it depends on nothing else and is what lets `progress-ring.tsx`'s existing stroke animation satisfy Reduced-Motion Foundation AC3 for free (§1.2), the single highest-value, lowest-risk edit available on day one.

**`AnimatedNumber` (§2), built next, as this phase's pattern-establishing primitive** — mirroring 4a's own foundation-first build order (auto-categorization built first because it established the reusable prompt/structured-output/Zod pattern the other four AI features then followed), `AnimatedNumber` plays the identical role here: it is the primitive with the highest surface count (ten AC6 consumers, more than any other capability), it has zero dependency on Radix's `Collapsible` or the App Router's `template.tsx` mechanism (the smallest, most self-contained thing to validate the "explicit shared-hook branch + one shared duration constant" shape in isolation), and it is the one capability the CTO's own resolution passes (Risk #53/#55) scrutinized most heavily — stabilizing its pattern first, before `ExpandableCard`/`FadeIn`/`PageTransition` each reuse the identical "explicit `useReducedMotion()` branch, no per-call duration override" shape, is the same "surface problems here first while there's still schedule slack" reasoning 4a's own build order used.

**Then, in any order (no dependency between them):** `components/ui/collapsible.tsx` → `components/shared/motion/expandable-card.tsx` (§3); `components/shared/motion/fade-in.tsx` → `page-transition.tsx` (§4); `components/shared/motion/chart-animation.ts` (§5) — each independent of the other two once the foundation above exists.

**What the Frontend Lead's later per-route application pass depends on from this document, concretely:**
- `StatCard`'s `value` prop type widening (§2.2) must land before any `StatCard`-consuming surface can pass an `<AnimatedNumber>`.
- The `ColumnDef.meta.cardDisplay` union's new `"expandable"` value (§3.2) must be typed/recognized by `DataTableCardList` before any of the five card-list consumers can annotate a column with it.
- `(dashboard)/template.tsx` (§4.1) is a one-file, one-time mount — no per-route work follows from it beyond the Frontend Lead's own empirical Router-Cache-interaction check (§4.3, Risk #58).
- `useChartAnimationProps()` (§5.1) is a pure spread-in at each of the 14 chart consumers' own existing Recharts JSX — no new prop plumbing needed beyond that.

---

## 9. Follow-up corrections owed to sibling architecture documents (not made in this pass)

Mirroring 5a's own §8 precedent — this pass's deliverable is this one file; the following pointer/correction edits are recommended for the same dispatch that begins implementation:

- **`Architecture.md`**: gains a short "Phase 5b status note" pointer to this document (mirroring the existing Phase 4a/4b/4c/5a notes), plus a one-line addition to the module-boundary table for `components/shared/motion/`'s new exports and `components/ui/collapsible.tsx` (both UI Component Engineer-owned, no new import direction), and a one-line note that `StatCard.value`'s type widened (§2.2).
- **`folder-tree.md`**: gains `components/shared/motion/` and `components/ui/collapsible.tsx` under the existing `components/` tree, and `src/app/(dashboard)/template.tsx` under the existing `(dashboard)/` tree.
- **`naming-standards.md`**: gains a Phase 5b entry recording `ColumnDef.meta.cardDisplay`'s now-four-value convention (`"primary" | "secondary" | "hidden" | "expandable"`, the fourth value additive per §3.2), and records `NUMBER_COUNTER_DURATION_MS`/`CHART_TRANSITION_DURATION_MS`/`PAGE_TRANSITION_DURATION_MS`/`EXPANDABLE_CARD_DURATION_MS` as this codebase's one sanctioned set of motion-duration constants, so a future feature doesn't hardcode a fifth, differently-named duration literal.
- **`api-contracts.md`**: no new entry required — this phase introduces zero new Server Actions, Route Handlers, or Server-Component-direct-call read functions (every change described in this document is presentation-layer, reusing existing data/props). Worth stating explicitly, matching prior phases' own "name what did not change" precedent.

---

## 10. Risks — new items surfaced by this pass

Four new risks (#56–#59) are appended to `docs/planning/risk-register.md`, continuing from its current highest row (#55); Risk #52 and Risk #55's own existing rows are also updated in place to record this pass's resolution/re-check, per that file's own established "mark resolved/re-checked in place, don't delete" convention.

- **#56** — Recharts' native chart-animation mechanism (this phase's own AC3-mandated tool) animates SVG geometry attributes directly, not `transform`/`opacity` — a genuine, unreconciled tension with the Cross-Cutting GPU-Compositable-Properties Bar's own "no exception" wording for this exact surface (§6), not resolvable by a different chart-animation mechanism without violating AC3 itself. Routed to the Performance Engineer's gate for measurement, not asserted either way here.
- **#57** — `AnimatedNumber`'s per-frame `format` callback (ultimately `formatCurrency`, which constructs a fresh `Intl.NumberFormat` instance per call, confirmed by direct read of `lib/utils.ts`) runs roughly 20–36 times over one 600ms tween at 60fps, multiplied across every simultaneously-mounting counter (e.g. Dashboard's several `StatCard`s on first load) — a real, additive runtime cost distinct from Framer Motion's own bundle-size delta (Risk #44), flagged for the same Performance Engineer gate to measure directly.
- **#58** — `(dashboard)/template.tsx`'s per-navigation remount (§4.1, the correct, standard Next.js mechanism for this phase's page-transition wrapper) may interact with the Next.js Router Cache such that a previously-visited, already-cached route (most concretely `/analytics`, the one route with its own dedicated `loading.tsx`) visibly re-plays its loading skeleton on repeat navigation even where caching would otherwise make it feel instant — flagged for the Frontend Lead to verify empirically and the Performance Engineer to measure against Page Transitions' own TTI-regression bar (AC2), not assumed either way by this pass.
- **#59** — `DataTableCardList`'s new `meta.cardDisplay: "expandable"` value (§3.2) is additive to 5a's already-shipped `"primary" | "secondary" | "hidden"` enum, not a reinterpretation of any existing value — but an implementer moving quickly could still mistakenly reassign an already-visible `"secondary"` column to `"expandable"` instead of choosing genuinely new content to disclose, silently hiding data 5a's own Bug Hunter/axe-core pass already verified as visible-by-default. Flagged for a one-time per-consumer review at implementation time, the same discipline Risk #51 already established for `cardDisplay` generally.

Full text, likelihood/impact, and mitigation columns for all four rows live in `docs/planning/risk-register.md` — see that file for the complete entries, plus the in-place updates to rows #52 and #55.
