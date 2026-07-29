"use client"

/**
 * <TimezoneSelect> — Timezone Preference capability AC1: "select their
 * timezone from a searchable list of standard IANA timezone names." Per
 * customization.md's Scope note (binding this phase), this component's own
 * scope is narrow and complete on its own: display/select/persist the field.
 * Nothing here — or anywhere else in this feature — reads
 * `UserPreference.timezone` to compute a date boundary; that consuming-logic
 * rewiring is explicitly deferred to a future, dedicated pass.
 *
 * Built from `Input`/`ScrollArea`/`Button` (no new shadcn primitive, e.g. a
 * `Command`/combobox component, was added — none exists yet under
 * `components/ui/`, and introducing one is the UI Component Engineer's
 * artifact per the Frontend Lead's "assemble, never build reusable
 * components" mandate). A plain filter-as-you-type `Input` over a scrollable
 * result list is a fully searchable, fully accessible substitute that
 * doesn't require that dependency to land first — the ~400-entry IANA list
 * (`Intl.supportedValuesOf("timeZone")`) is filtered client-side on every
 * keystroke, which is cheap enough that no debouncing is warranted.
 */

import { useMemo, useState } from "react"
import { CheckIcon } from "lucide-react"
import { toast } from "sonner"

import type { UserPreferenceView } from "@/features/settings/types"
import { useUpdateTimezone, useUserPreference } from "@/features/settings/hooks/use-user-preference"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** Every valid IANA zone name, computed once at module load — the same
 * runtime source of truth `server/validation.ts`'s `TimezoneSchema` validates
 * against, so this list can never offer a selection the server would reject
 * (Edge Case: extreme-offset zones like `Pacific/Kiritimati` must be
 * selectable exactly like any other). */
const ALL_TIMEZONES = Intl.supportedValuesOf("timeZone")

export interface TimezoneSelectProps {
  initialPreference: UserPreferenceView
}

export function TimezoneSelect({ initialPreference }: TimezoneSelectProps) {
  const { data: preference } = useUserPreference(initialPreference)
  const updateTimezone = useUpdateTimezone()
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return ALL_TIMEZONES
    return ALL_TIMEZONES.filter((zone) => zone.toLowerCase().includes(normalized))
  }, [query])

  function handleSelect(zone: string) {
    if (zone === preference.timezone) return
    updateTimezone.mutate(
      { timezone: zone },
      {
        onError: (error) =>
          toast.error(error instanceof Error ? error.message : "Could not update timezone."),
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Timezone</CardTitle>
        <CardDescription>
          Currently set to <span className="font-medium text-foreground">{preference.timezone}</span>.
          This preference is saved and shown here for reference — it does not
          yet change how any other page in the app computes &ldquo;today&rdquo; or
          &ldquo;this month.&rdquo;
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Input
          type="search"
          placeholder="Search timezones (e.g. America/New_York)"
          aria-label="Search timezones"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <ScrollArea className="h-64 rounded-md border">
          <div className="flex flex-col p-1" role="listbox" aria-label="Timezone options">
            {filtered.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">No matching timezones.</p>
            )}
            {filtered.map((zone) => {
              const selected = zone === preference.timezone
              return (
                <Button
                  key={zone}
                  type="button"
                  variant="ghost"
                  role="option"
                  aria-selected={selected}
                  disabled={updateTimezone.isPending}
                  onClick={() => handleSelect(zone)}
                  className={cn(
                    "justify-start gap-2 font-normal",
                    selected && "bg-accent text-accent-foreground",
                  )}
                >
                  <CheckIcon
                    className={cn("size-4 shrink-0", selected ? "opacity-100" : "opacity-0")}
                    aria-hidden="true"
                  />
                  {zone}
                </Button>
              )
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
