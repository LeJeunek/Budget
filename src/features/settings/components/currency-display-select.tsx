"use client"

/**
 * <CurrencyDisplaySelect> — Currency Display capability AC1/AC3.
 *
 * AC3 is a *product requirement*, not a UI nicety: the label/helper copy
 * below must make the "formatting, not conversion" distinction explicit,
 * since a re-symbolized number could otherwise read as a converted one. The
 * live preview underneath (an arbitrary fixed sample amount, formatted via
 * `formatCurrency(amount, preference.currencyDisplay)`) is this dispatch's
 * required demonstration that `formatCurrency`'s own `currency` parameter is
 * genuinely wired end-to-end for at least one real surface — see
 * `src/lib/utils.ts`'s `formatCurrency` JSDoc for the full app-wide-rollout
 * scope note (this settings page is not that rollout).
 */

import { toast } from "sonner"

import type { UserPreferenceView } from "@/features/settings/types"
import { CURRENCY_DISPLAY_OPTIONS } from "@/features/settings/server/validation"
import {
  useUpdateCurrencyDisplay,
  useUserPreference,
} from "@/features/settings/hooks/use-user-preference"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatCurrency } from "@/lib/utils"

/** An arbitrary, fixed sample amount for the live preview below — large
 * enough to show grouping separators, with cents, so JPY's zero-decimal
 * convention reads as a visibly different format rather than a coincidental
 * match (Currency Display's own Edge Case: "must still format legibly"). */
const PREVIEW_AMOUNT = 1234.56

export interface CurrencyDisplaySelectProps {
  initialPreference: UserPreferenceView
}

export function CurrencyDisplaySelect({ initialPreference }: CurrencyDisplaySelectProps) {
  const { data: preference } = useUserPreference(initialPreference)
  const updateCurrencyDisplay = useUpdateCurrencyDisplay()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Currency display format</CardTitle>
        <CardDescription>
          Changes how amounts are shown throughout the app — your data stays
          in USD. This only re-formats the symbol and number grouping; it
          never converts, recalculates, or changes any stored figure.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="currency-display">Display currency</Label>
          <Select
            value={preference.currencyDisplay}
            onValueChange={(value) =>
              updateCurrencyDisplay.mutate(
                { currencyDisplay: value },
                {
                  onError: (error) =>
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "Could not update display currency.",
                    ),
                },
              )
            }
            disabled={updateCurrencyDisplay.isPending}
          >
            <SelectTrigger id="currency-display" className="w-full sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCY_DISPLAY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Preview: {formatCurrency(PREVIEW_AMOUNT, preference.currencyDisplay)}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
