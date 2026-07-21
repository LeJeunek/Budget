import type {
  AmortizationResult,
  PayoffDebtInput,
  StrategyComparisonResult,
  StrategySummary,
} from "./types"

/**
 * PURE, isomorphic payoff-calculation math for the Debt Tracker feature.
 *
 * Per docs/architecture/naming-standards.md's "(Phase 3a) Isomorphic pure-
 * calculation files" rule: this file lives at the feature root (not under
 * `server/`) specifically so `features/debt/components/strategy-comparison.tsx`
 * (Frontend Lead territory) can import it directly into a Client Component
 * and recompute the snowball/avalanche comparison instantly on every
 * extra-payment keystroke, with no server round-trip (AC6/AC7). This file
 * must NEVER import `lib/db.ts`, `lib/auth.ts`, or anything else server-only
 * — every function here is a plain, side-effect-free function of its
 * arguments, fully unit-testable in isolation.
 *
 * `server/service.ts` also imports this file (for `DebtWithProjection`'s
 * per-debt `payoffDate`/`totalInterestRemaining`/`isNegativeAmortization`
 * fields), so the exact same math backs both the server-rendered debt list
 * and the client-recomputed strategy comparison — one implementation, not
 * two independently-maintained copies that could quietly disagree.
 */

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

/**
 * Safety backstop against a runaway/infinite simulation loop, not a modeled
 * product behavior. Two independent code paths can, in principle, fail to
 * converge for pathological (but not unreasonable-to-enter) inputs:
 *   1. `computeAmortization` for a single debt already detects negative
 *      amortization analytically up front (see below) and never loops in
 *      that case — this cap is pure defense-in-depth for it.
 *   2. `compareSnowballAndAvalanche`'s multi-debt cascading simulation has no
 *      equivalent up-front check: a debt far back in the payoff order can
 *      still be effectively in negative amortization (its own minimum plus
 *      whatever extra has rolled to it so far doesn't cover its accruing
 *      interest) for as long as it takes every debt ahead of it to clear.
 *      For extreme inputs (e.g. a very large balance at a high rate paired
 *      with a very small minimum payment and a small extra payment) that can
 *      take an unrealistic number of months to resolve, if it resolves at
 *      all. 100 years is far beyond any realistic payoff horizon this
 *      feature needs to represent, so hitting this cap is always a
 *      pathological-input backstop, never an expected outcome for the
 *      realistic debts this feature is built around.
 */
const MAX_SIMULATION_MONTHS = 1200

/** `1` cent, in the same currency units `balance`/`minimumPayment` are
 * expressed in — used to treat "effectively zero" balances (which floating-
 * point subtraction can leave as e.g. `0.00000000003`) as fully paid off,
 * and to guard the negative-amortization check against noise at the exact
 * break-even boundary. */
const EPSILON = 0.005

// ---------------------------------------------------------------------------
// Date helpers (UTC calendar-month arithmetic — no timezone drift)
// ---------------------------------------------------------------------------

/** `"YYYY-MM"` for a `Date`, matching this app's established UTC-calendar
 * convention (e.g. `features/investments/server/service.ts`'s
 * `toIsoDateString`, `features/goals`'s month keys). */
function formatYearMonth(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

/** The `"YYYY-MM"` string `monthsFromNow` whole calendar months after
 * `startDate`, computed via `Date.UTC` so month-length/leap-year rollover is
 * handled by the JS date engine rather than hand-rolled arithmetic. */
function monthsAfter(startDate: Date, monthsFromNow: number): string {
  const rolled = new Date(
    Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + monthsFromNow, 1),
  )
  return formatYearMonth(rolled)
}

/** Rounds to whole cents — every intermediate accrual below is a plain JS
 * float, so a final rounding pass keeps the returned totals from displaying
 * IEEE-754 noise (e.g. `1234.5600000000002`). */
function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100
}

// ---------------------------------------------------------------------------
// Single-debt amortization (AC4/AC5, minimum-payment-only pace)
// ---------------------------------------------------------------------------

/**
 * Computes one debt's payoff date and total remaining interest, assuming
 * only its own minimum payment is made every month going forward and no new
 * charges are added (AC4). This is the exact function `server/service.ts`
 * calls (with `extraPayment` omitted) to populate `DebtWithProjection`'s
 * per-debt projection fields, and the exact function
 * `compareSnowballAndAvalanche` calls per-debt for its `extraPayment === 0`
 * fast path (see that function's JSDoc for why $0 extra is handled
 * independently per debt rather than through the shared cascading
 * simulation).
 *
 * **0% interest rate (Edge Cases):** `monthlyRate` is simply `0` — every
 * formula below multiplies by it rather than dividing, so there is no
 * division-by-zero risk; the balance reduces by the minimum payment alone,
 * with zero interest accrual, which is exactly the correct behavior with no
 * special-casing required.
 *
 * **Negative amortization (Edge Cases):** detected analytically up front,
 * not by looping until a cap is hit. Because the payment (`minimumPayment`)
 * is fixed and the balance starts at its highest point *before* any payment
 * has been made, if the minimum payment does not even cover the very first
 * month's interest, the balance can only stay flat or grow from there —
 * meaning it will never cover any subsequent month's interest either (each
 * of which accrues on a balance >= the original). So checking the first
 * month's interest against the minimum payment is both necessary and
 * sufficient to detect this condition for good, with no simulation loop
 * needed at all. `payoffDate`/`totalInterestRemaining` are `null` (never a
 * nonsensical far-future date or an infinite loop) with
 * `isNegativeAmortization: true`.
 *
 * A `balance <= 0` input (already paid off) returns a zero-month projection
 * dated the current month, so a just-paid-off debt never accidentally
 * reports `isNegativeAmortization` or a stale future date.
 */
export function computeAmortization(
  debt: PayoffDebtInput,
  now: Date = new Date(),
): AmortizationResult {
  const { balance, interestRate, minimumPayment } = debt

  if (balance <= 0) {
    return {
      payoffDate: formatYearMonth(now),
      totalInterestRemaining: 0,
      monthsToPayoff: 0,
      isNegativeAmortization: false,
    }
  }

  const monthlyRate = interestRate / 100 / 12
  const firstMonthInterest = balance * monthlyRate

  if (monthlyRate > 0 && minimumPayment <= firstMonthInterest + EPSILON) {
    return {
      payoffDate: null,
      totalInterestRemaining: null,
      monthsToPayoff: null,
      isNegativeAmortization: true,
    }
  }

  let remaining = balance
  let totalInterest = 0
  let months = 0

  while (remaining > EPSILON && months < MAX_SIMULATION_MONTHS) {
    const interest = remaining * monthlyRate
    totalInterest += interest
    const owed = remaining + interest
    const payment = Math.min(minimumPayment, owed)
    remaining = owed - payment
    months += 1
  }

  if (remaining > EPSILON) {
    // Safety backstop only — see MAX_SIMULATION_MONTHS's JSDoc. The
    // up-front analytical check above already rules out true negative
    // amortization for a single debt, so this branch is not expected to be
    // reachable in practice; it exists purely so a floating-point edge case
    // can never manifest as an actual infinite loop.
    return {
      payoffDate: null,
      totalInterestRemaining: null,
      monthsToPayoff: null,
      isNegativeAmortization: true,
    }
  }

  return {
    payoffDate: monthsAfter(now, months),
    totalInterestRemaining: roundCurrency(totalInterest),
    monthsToPayoff: months,
    isNegativeAmortization: false,
  }
}

// ---------------------------------------------------------------------------
// Snowball vs. avalanche comparison (AC6/AC7/AC8, Edge Cases)
// ---------------------------------------------------------------------------

/** Snowball ordering (AC7): smallest current balance first. */
function snowballOrder(debts: PayoffDebtInput[]): PayoffDebtInput[] {
  return [...debts].sort((a, b) => a.balance - b.balance)
}

/** Avalanche ordering (AC7): highest interest rate first. */
function avalancheOrder(debts: PayoffDebtInput[]): PayoffDebtInput[] {
  return [...debts].sort((a, b) => b.interestRate - a.interestRate)
}

interface SimDebt {
  id: string
  balance: number
  monthlyRate: number
  minimumPayment: number
}

/**
 * Runs the month-by-month cascading-extra-payment simulation for one
 * strategy's fixed targeting order (AC7's rolling mechanic, Edge Cases'
 * "a debt paid off mid-strategy ... rolls onto the next debt ... for the
 * remainder of the projection").
 *
 * **The targeting order is fixed at the start**, based on each debt's
 * *current* balance/rate, and is not re-evaluated as balances change over
 * time. This matches how the snowball/avalanche method is actually practiced
 * (a user picks an order once and works through it) and how AC7/Edge Cases
 * describe it ("the next debt in that strategy's order" — a predetermined
 * sequence, not a dynamically-resorted one).
 *
 * **Within-month cascading:** each month, every still-active debt accrues
 * interest and receives its own minimum payment; the current front-of-order
 * debt additionally receives the shared "extra" pool (the user's
 * `extraPayment` plus every already-paid-off debt's former minimum payment,
 * per AC7). If that debt is fully retired with money left over from the
 * pool, the leftover cascades to the next active debt in the order within
 * the *same* month (rather than being wasted for a month), which matters for
 * realistic inputs where a large extra payment can clear more than one small
 * balance in a single month. The per-debt math below (`neededBeyondMinimum`/
 * `extraUsed`) is written so this cascading is correct in every case:
 *   - the front debt's minimum alone retires it (no extra needed at all —
 *     the extra passes through completely untouched to the next debt),
 *   - minimum + some extra retires it (only the needed portion of the extra
 *     is consumed; the remainder cascades onward), or
 *   - minimum + all remaining extra still isn't enough (the entire
 *     remaining extra is consumed here; nothing cascades further this
 *     month).
 *
 * A debt further down the order can also occasionally reach $0 purely from
 * its own minimum payment, before ever becoming the front-of-order target —
 * this is handled uniformly by the same per-debt logic (it simply never
 * needed any extra to begin with) and is recorded in `payoffOrder` at the
 * month it actually happens, which is why `payoffOrder` is documented as the
 * *actual chronological finish order*, not always byte-for-byte identical to
 * the strategy's nominal targeting order (though in the overwhelmingly
 * common case, where debts are paid off one at a time in sequence, they
 * coincide exactly).
 */
function simulateWithExtraPayment(
  debts: PayoffDebtInput[],
  extraPayment: number,
  order: PayoffDebtInput[],
): StrategySummary {
  const sims = new Map<string, SimDebt>(
    debts.map((debt) => [
      debt.id,
      {
        id: debt.id,
        balance: debt.balance,
        monthlyRate: debt.interestRate / 100 / 12,
        minimumPayment: debt.minimumPayment,
      },
    ]),
  )
  const orderedIds = order.map((debt) => debt.id)

  const paidOff = new Set<string>()
  const payoffOrder: string[] = []
  let totalInterestPaid = 0
  let months = 0

  // Debts that start already at (or below) zero are immediately "paid off"
  // with no simulation month consumed — defensive, since `service.ts`/
  // callers are expected to only pass active (balance > 0) debts here, but
  // costs nothing to handle correctly if one slips through.
  for (const debt of sims.values()) {
    if (debt.balance <= 0) {
      paidOff.add(debt.id)
      payoffOrder.push(debt.id)
    }
  }

  while (paidOff.size < sims.size && months < MAX_SIMULATION_MONTHS) {
    months += 1

    // 1. Accrue interest on every still-active debt.
    for (const debt of sims.values()) {
      if (paidOff.has(debt.id)) continue
      const interest = debt.balance * debt.monthlyRate
      debt.balance += interest
      totalInterestPaid += interest
    }

    // 2. This month's shared extra pool: the user's own extra payment, plus
    //    the former minimum payment of every debt already paid off (AC7's
    //    "former minimum payment plus the extra amount rolls onto the next").
    let extraAvailable = extraPayment
    for (const id of orderedIds) {
      if (paidOff.has(id)) {
        extraAvailable += sims.get(id)!.minimumPayment
      }
    }

    // 3. Walk the fixed order, applying each debt's own minimum plus
    //    whatever extra is still available (cascading — see JSDoc above).
    for (const id of orderedIds) {
      if (paidOff.has(id)) continue
      const debt = sims.get(id)!
      const amountOwed = debt.balance
      const neededBeyondMinimum = Math.max(0, amountOwed - debt.minimumPayment)
      const extraUsed = Math.min(extraAvailable, neededBeyondMinimum)
      extraAvailable -= extraUsed

      const payment = Math.min(debt.minimumPayment + extraUsed, amountOwed)
      debt.balance = amountOwed - payment

      if (debt.balance <= EPSILON) {
        debt.balance = 0
        paidOff.add(id)
        payoffOrder.push(id)
      }
    }
  }

  return {
    monthsToDebtFree: months,
    totalInterestPaid: roundCurrency(totalInterestPaid),
    payoffOrder,
  }
}

/**
 * `$0` extra payment (Edge Cases): "both strategies produce identical
 * results, since there's no shared extra-payment pool to reallocate between
 * debts when everyone is only ever paying their own minimum." This is a
 * deliberately distinct code path from `simulateWithExtraPayment` above, not
 * that function called with `extraPayment: 0` — the two are *not*
 * equivalent. Feeding `extraPayment: 0` through the cascading simulation
 * would still roll each paid-off debt's former minimum payment into the
 * shared pool once it clears (per AC7's own mechanic), which would make
 * snowball and avalanche diverge (they'd redirect that freed-up capacity to
 * different next debts, depending on order) — contradicting this edge case's
 * explicit requirement that both tie exactly at $0 extra.
 *
 * Resolving that tension: the snowball/avalanche method's entire premise is
 * a *deliberate, extra-budget-anchored plan* to keep redirecting freed
 * capacity toward one target debt at a time. With no extra budget committed
 * at all, there is no such plan to speak of — each debt is realistically
 * just paid down independently, at whatever pace its own minimum implies,
 * and a freed-up minimum payment simply stops being paid rather than being
 * redirected anywhere. That makes the two "strategies" mathematically
 * identical (order genuinely doesn't matter when nothing is being
 * reallocated), which is exactly what this function computes: each debt's
 * own independent minimum-payment-only amortization (reusing
 * `computeAmortization`, so this is guaranteed to agree with each debt's own
 * `DebtWithProjection` figures), summed for `totalInterestPaid` and
 * maxed for `monthsToDebtFree` (the group isn't "debt-free" until every
 * debt individually reaches $0).
 *
 * `payoffOrder` here reflects each debt's own actual payoff month (ascending
 * — the true chronological order they'd each hit $0 in), which is what makes
 * this function's result independent of whichever nominal
 * (snowball-vs-avalanche) ordering the caller applied — both strategies call
 * this exact same function and therefore always agree, satisfying
 * `isIdentical` structurally rather than by coincidence.
 *
 * A debt in negative amortization here can never reach $0 — `monthsToPayoff`
 * for such a debt is treated as effectively infinite (sorted last, and
 * contributes `MAX_SIMULATION_MONTHS` toward the overall max) rather than
 * silently breaking the aggregate figures for the rest of the comparison.
 */
function computeIndependentMinimumOnlyTotals(debts: PayoffDebtInput[]): StrategySummary {
  const perDebt = debts.map((debt) => ({
    id: debt.id,
    result: computeAmortization(debt),
  }))

  const monthsToDebtFree = perDebt.reduce(
    (max, { result }) => Math.max(max, result.monthsToPayoff ?? MAX_SIMULATION_MONTHS),
    0,
  )
  const totalInterestPaid = roundCurrency(
    perDebt.reduce((sum, { result }) => sum + (result.totalInterestRemaining ?? 0), 0),
  )
  const payoffOrder = [...perDebt]
    .sort((a, b) => (a.result.monthsToPayoff ?? MAX_SIMULATION_MONTHS) - (b.result.monthsToPayoff ?? MAX_SIMULATION_MONTHS))
    .map(({ id }) => id)

  return { monthsToDebtFree, totalInterestPaid, payoffOrder }
}

/**
 * Compares the snowball and avalanche payoff strategies across a user's
 * active debts, given an optional extra monthly payment amount (AC6/AC7).
 * Pure function — no I/O, safe to call from a Client Component on every
 * keystroke of the extra-payment input (that is this function's entire
 * reason for living at the feature root instead of under `server/`).
 *
 * **Zero or one debt (Edge Cases: "only one active debt"):** both strategies
 * necessarily produce identical results (there is nothing to reorder), which
 * falls out of the general algorithm with no special-casing needed — the
 * explicit `isIdentical` check below still flags it for the UI's messaging.
 *
 * **`isIdentical`** is `true` whenever `extraPayment <= 0` or there is one
 * (or zero) active debt — driving the "add an extra payment amount to see
 * how each strategy differs" messaging rather than a UI implying one
 * strategy "wins" when the numbers are mathematically forced to tie.
 */
export function compareSnowballAndAvalanche(
  debts: PayoffDebtInput[],
  extraPayment: number = 0,
): StrategyComparisonResult {
  // Defensive: only ever compare debts that actually still have a balance —
  // a caller accidentally including an already-paid-off debt shouldn't
  // change the comparison's outcome.
  const activeDebts = debts.filter((debt) => debt.balance > 0)
  const normalizedExtraPayment = Math.max(0, extraPayment)

  const isIdentical = normalizedExtraPayment <= 0 || activeDebts.length <= 1

  const snowball =
    normalizedExtraPayment <= 0
      ? computeIndependentMinimumOnlyTotals(activeDebts)
      : simulateWithExtraPayment(activeDebts, normalizedExtraPayment, snowballOrder(activeDebts))

  const avalanche =
    normalizedExtraPayment <= 0
      ? computeIndependentMinimumOnlyTotals(activeDebts)
      : simulateWithExtraPayment(activeDebts, normalizedExtraPayment, avalancheOrder(activeDebts))

  return {
    extraPayment: normalizedExtraPayment,
    snowball,
    avalanche,
    isIdentical,
  }
}
