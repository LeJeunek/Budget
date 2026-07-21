"use client"

/**
 * ExtraPaymentInput — the single "extra monthly payment" input driving the
 * snowball/avalanche comparison (debt-tracker.md AC6). Deliberately its own
 * small file, not inlined into strategy-comparison.tsx, so that file can stay
 * focused on rendering the comparison itself (single responsibility).
 *
 * Validates via `features/debt/server/validation.ts`'s `ExtraPaymentSchema`
 * rather than a hand-rolled duplicate check — that module's own JSDoc
 * explicitly carves out this exact reuse ("so
 * features/debt/components/extra-payment-input.tsx has a single, shared
 * source of truth for validating the raw input before it ever reaches
 * payoff-math.ts's pure functions"). `ExtraPaymentSchema` is plain Zod with
 * no server-only imports (no `lib/db`/`lib/auth`), so importing it into this
 * Client Component is safe — unlike `server/service.ts`, which this feature's
 * other Client Components never import.
 */

import { ExtraPaymentSchema } from "@/features/debt/server/validation"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/** Parses a raw extra-payment input string into a validated, non-negative
 * number for `payoff-math.ts`'s `compareSnowballAndAvalanche`, plus a
 * friendly error message when the input isn't a well-formed number. An empty
 * string parses to `0` (AC6: "optional, defaults to $0"), not an error. */
export function parseExtraPaymentInput(raw: string): {
  value: number
  error: string | null
} {
  if (raw.trim() === "") {
    return { value: 0, error: null }
  }

  const numeric = Number(raw)
  if (!Number.isFinite(numeric)) {
    return { value: 0, error: "Extra payment amount must be a number" }
  }

  const parsed = ExtraPaymentSchema.safeParse(numeric)
  if (!parsed.success) {
    return { value: 0, error: parsed.error.issues[0]?.message ?? "Invalid amount" }
  }

  return { value: parsed.data, error: null }
}

export interface ExtraPaymentInputProps {
  value: string
  onChange: (value: string) => void
  error: string | null
}

export function ExtraPaymentInput({ value, onChange, error }: ExtraPaymentInputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="extra-payment">Extra monthly payment</Label>
      <Input
        id="extra-payment"
        type="number"
        step="0.01"
        min="0"
        placeholder="0"
        className="max-w-48"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error !== null}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        Money available above your combined minimum payments, to put toward
        faster payoff.
      </p>
    </div>
  )
}
