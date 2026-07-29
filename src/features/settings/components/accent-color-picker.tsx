"use client"

/**
 * <AccentColorPicker> — Theme & Accent Color capability AC1: "a fixed set of
 * preset options ... on the order of five to eight." Deliberately additive
 * to, never a replacement for, the existing light/dark/system `ThemeToggle`
 * (AC2/AC3 — that quick-switcher stays exactly where it is, unmodified; this
 * picker lives only on this settings page).
 *
 * `ACCENT_COLOR_OPTIONS` (`server/validation.ts`) is the one source of truth
 * for both the valid-value set the server enforces and the swatch grid
 * rendered here — no second, hand-maintained palette copy.
 *
 * Built entirely from the already-installed `Button`/`Card` primitives (no
 * new shadcn primitive added, per the Frontend Lead's "assemble, never build
 * reusable components" mandate) — a swatch is a small square `Button` whose
 * background comes from `AccentColorOption.swatchClassName`, with a check
 * mark overlay on the currently-selected preset.
 */

import { CheckIcon } from "lucide-react"
import { toast } from "sonner"

import type { UserPreferenceView } from "@/features/settings/types"
import { ACCENT_COLOR_OPTIONS } from "@/features/settings/server/validation"
import {
  useUpdateAccentColor,
  useUserPreference,
} from "@/features/settings/hooks/use-user-preference"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

export interface AccentColorPickerProps {
  initialPreference: UserPreferenceView
}

export function AccentColorPicker({ initialPreference }: AccentColorPickerProps) {
  const { data: preference } = useUserPreference(initialPreference)
  const updateAccentColor = useUpdateAccentColor()

  function handleSelect(value: string) {
    // Selecting the already-active preset clears it back to the product
    // default (`null`) — a simple, discoverable way to satisfy the "user
    // who never sets an accent color sees the current default" edge case
    // without a separate "Clear" control.
    const nextValue = preference.accentColor === value ? null : value

    updateAccentColor.mutate(
      { accentColor: nextValue },
      {
        onError: (error) =>
          toast.error(error instanceof Error ? error.message : "Could not update accent color."),
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Accent color</CardTitle>
        <CardDescription>
          Choose a preset accent color. This is independent of the light/dark
          mode toggle in the top navigation — pair any accent with any mode.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-3" role="group" aria-label="Accent color presets">
          {ACCENT_COLOR_OPTIONS.map((option) => {
            const selected = preference.accentColor === option.value
            return (
              <Button
                key={option.value}
                type="button"
                variant="outline"
                size="icon"
                aria-pressed={selected}
                aria-label={`${option.label}${selected ? " (selected)" : ""}`}
                title={option.label}
                disabled={updateAccentColor.isPending}
                onClick={() => handleSelect(option.value)}
                className={cn(
                  "relative size-9 rounded-full border-2",
                  option.swatchClassName,
                  selected ? "border-foreground" : "border-transparent",
                )}
              >
                {selected && (
                  <CheckIcon
                    className="size-4 text-white drop-shadow"
                    aria-hidden="true"
                  />
                )}
              </Button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
