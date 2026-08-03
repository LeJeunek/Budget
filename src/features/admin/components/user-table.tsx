"use client"

/**
 * UserTable — View Users (admin.md Capability 2). Renders one already-
 * fetched page of `admin.server/users.ts`'s `getUsers` result: email,
 * display name, signup date, email-verification status, and a "last
 * active" signal (AC1) — deliberately nothing else (AC3/AC4: no credential/
 * secret field exists on `AdminUserSummary` to accidentally render, and no
 * financial data is ever fetched for this view in the first place).
 *
 * Per the dispatch note: `components/shared/data-table/` paginates
 * client-side or via an imperative callback, not `?cursor=` URL navigation,
 * so this component only ever receives one page's worth of rows and renders
 * with `enablePagination={false}` — `app/admin/users/page.tsx` owns
 * fetching/paging via searchParams and renders its own Prev/Next
 * (`CursorPaginationControls`) alongside this table.
 */

import type { ColumnDef } from "@tanstack/react-table"

import { ResponsiveDataTable } from "@/components/shared/data-table"
import { Badge } from "@/components/ui/badge"
import type { AdminUserSummary } from "@/features/admin/types"

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date)
}

export interface UserTableProps {
  users: AdminUserSummary[]
}

export function UserTable({ users }: UserTableProps) {
  const columns: ColumnDef<AdminUserSummary>[] = [
    {
      id: "email",
      header: "Email",
      cell: ({ row }) => <span className="font-medium">{row.original.email}</span>,
      // Phase 5a (phase-5a-technical-design.md §3.1): email + verification
      // status are this table's card-list "primary" columns — the two facts
      // an admin scanning the user list on mobile needs at a glance.
      meta: { cardDisplay: "primary" },
    },
    {
      id: "name",
      header: "Name",
      cell: ({ row }) =>
        row.original.name || <span className="text-muted-foreground">—</span>,
    },
    {
      id: "signedUp",
      header: "Signed up",
      cell: ({ row }) => (
        <span className="whitespace-nowrap">{formatDateTime(row.original.createdAt)}</span>
      ),
      // Phase 5b (Expandable Cards, phase-5b-technical-design.md §3.2): an
      // admin scanning this card-list on mobile needs email + verification
      // status (already "primary") and last-active (a dormancy signal) at a
      // glance — signup date is real, but the least time-sensitive of the
      // three, so it moves behind this card's own expand affordance instead.
      meta: { cardDisplay: "expandable" },
    },
    {
      id: "emailVerified",
      header: "Email verified",
      cell: ({ row }) =>
        row.original.emailVerified ? (
          <Badge variant="secondary">Verified</Badge>
        ) : (
          <Badge variant="outline">Unverified</Badge>
        ),
      meta: { cardDisplay: "primary" },
    },
    {
      id: "lastActive",
      header: "Last active",
      cell: ({ row }) =>
        row.original.lastActiveAt ? (
          <span className="whitespace-nowrap">{formatDateTime(row.original.lastActiveAt)}</span>
        ) : (
          // Capability 2's own "a user with zero sessions" edge case: a
          // plain indicator, never an error or a blank field.
          <span className="text-muted-foreground">No activity yet</span>
        ),
    },
  ]

  return (
    <ResponsiveDataTable
      columns={columns}
      data={users}
      enablePagination={false}
      emptyMessage="No accounts found."
    />
  )
}
