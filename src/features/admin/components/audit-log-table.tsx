"use client"

/**
 * AuditLogTable — Audit Logs (admin.md Capability 3). Renders one already-
 * fetched, already-filtered page of `admin.server/audit-log.ts`'s
 * `getAuditLog` result: event type, which user it concerns, when it
 * happened, and its outcome (AC2) — never a raw financial figure (AC4;
 * `AuditLogEntry.summary` is already scrubbed of those by `audit-log.ts`
 * itself, this component only renders the string it's given).
 *
 * Same "one server-fetched page in, `enablePagination={false}`" shape as
 * `UserTable` — see that file's JSDoc for why (`DataTable` itself doesn't
 * drive `?cursor=` URL pagination).
 */

import type { ColumnDef } from "@tanstack/react-table"

import { DataTable } from "@/components/shared/data-table"
import { Badge } from "@/components/ui/badge"
import {
  AUDIT_LOG_EVENT_TYPE_LABELS,
  AUDIT_LOG_OUTCOME_BADGE_VARIANT,
} from "@/features/admin/lib/audit-log-labels"
import type { AuditLogEntry } from "@/features/admin/types"

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date)
}

export interface AuditLogTableProps {
  entries: AuditLogEntry[]
}

export function AuditLogTable({ entries }: AuditLogTableProps) {
  const columns: ColumnDef<AuditLogEntry>[] = [
    {
      id: "type",
      header: "Event",
      cell: ({ row }) => (
        <Badge variant="outline">
          {AUDIT_LOG_EVENT_TYPE_LABELS[row.original.type] ?? row.original.type}
        </Badge>
      ),
    },
    {
      id: "summary",
      header: "Summary",
      cell: ({ row }) => <span className="text-sm">{row.original.summary}</span>,
    },
    {
      id: "user",
      header: "User",
      cell: ({ row }) =>
        row.original.userId ? (
          <span className="font-mono text-xs text-muted-foreground">{row.original.userId}</span>
        ) : (
          // Capability 3's "since-deleted user" edge case — the entry still
          // displays plainly, never errors or disappears.
          <span className="text-muted-foreground">Deleted account</span>
        ),
    },
    {
      id: "occurredAt",
      header: "When",
      cell: ({ row }) => (
        <span className="whitespace-nowrap">{formatDateTime(row.original.occurredAt)}</span>
      ),
    },
    {
      id: "outcome",
      header: "Outcome",
      cell: ({ row }) => (
        <Badge variant={AUDIT_LOG_OUTCOME_BADGE_VARIANT[row.original.outcome]}>
          {row.original.outcome}
        </Badge>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      data={entries}
      enablePagination={false}
      emptyMessage="No audit log entries found for these filters."
    />
  )
}
