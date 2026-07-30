"use client"

/**
 * AuditLogFilters — event-type and date-range filter controls for Admin's
 * Audit Log (admin.md Capability 3 AC3: "filterable by at least event type
 * and date range"). A Client Component only because it navigates
 * (`router.push`) on every change — the actual filtered read still happens
 * server-side, in `app/admin/audit-log/page.tsx`, off the resulting
 * `?type=&start=&end=` searchParams; this component fetches nothing itself.
 *
 * Any filter change resets pagination (`cursor`/`history` are dropped from
 * the URL, since a new filter invalidates whatever page the admin was on) —
 * the same "any filter change jumps back to page 1" rule
 * `TransactionTable`'s own filters already establish.
 */

import { useRouter } from "next/navigation"

import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AUDIT_LOG_EVENT_TYPE_LABELS } from "@/features/admin/lib/audit-log-labels"

// Radix `Select` cannot use an empty string as an item value (it's reserved
// to mean "no selection"), so "All event types" needs its own non-empty
// sentinel, mapped back to "no filter" before navigating — the same pattern
// `TransactionTable`'s own account/category filters already use.
const ALL_TYPES_VALUE = "__all-event-types__"

export interface AuditLogFiltersProps {
  type?: string
  start?: string
  end?: string
}

export function AuditLogFilters({ type, start, end }: AuditLogFiltersProps) {
  const router = useRouter()

  function navigate(next: { type?: string; start?: string; end?: string }) {
    const nextType = next.type ?? type
    const nextStart = next.start ?? start
    const nextEnd = next.end ?? end

    const params = new URLSearchParams()
    if (nextType) params.set("type", nextType)
    if (nextStart) params.set("start", nextStart)
    if (nextEnd) params.set("end", nextEnd)

    const qs = params.toString()
    router.push(qs ? `/admin/audit-log?${qs}` : "/admin/audit-log")
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={type ?? ALL_TYPES_VALUE}
        onValueChange={(value) => navigate({ type: value === ALL_TYPES_VALUE ? "" : value })}
      >
        <SelectTrigger aria-label="Filter by event type">
          <SelectValue placeholder="All event types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_TYPES_VALUE}>All event types</SelectItem>
          {Object.entries(AUDIT_LOG_EVENT_TYPE_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        type="date"
        value={start ?? ""}
        onChange={(event) => navigate({ start: event.target.value })}
        aria-label="From date"
        className="w-36"
      />
      <Input
        type="date"
        value={end ?? ""}
        onChange={(event) => navigate({ end: event.target.value })}
        aria-label="To date"
        className="w-36"
      />
    </div>
  )
}
