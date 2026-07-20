"use client"

/**
 * NotificationBell — the notification inbox's single entry point, per
 * docs/product/calendar-and-notifications.md's AC3 ("visible from a single,
 * persistent location reachable from anywhere ... a bell icon in the top
 * nav with a dropdown/panel, not a one-time toast").
 *
 * Lives under `features/notifications/components/` rather than
 * `components/shared/` because it fetches data (`useNotifications`) —
 * `components/shared/` primitives must stay domain-agnostic/zero-data-fetching
 * (see `components/shared/top-nav.tsx`'s own JSDoc). It is composed into
 * `TopNav` via a slot prop the same way `TopNav`'s existing `themeToggle`
 * prop works, not imported/fetched inside `top-nav.tsx` itself — see
 * `app/(dashboard)/layout.tsx` for the wiring.
 *
 * Built entirely from already-installed primitives (`DropdownMenu`,
 * `ScrollArea`, `Badge`, `Button`) per the Frontend Lead's "assemble, never
 * build reusable components" mandate — no new shadcn primitive was added.
 */

import * as React from "react"
import { Bell, X } from "lucide-react"
import { toast } from "sonner"

import { cn, formatDate } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { Notification } from "@/features/notifications/types"
import {
  useDismissNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "@/features/notifications/hooks/use-notifications"

export interface NotificationBellProps {
  className?: string
}

/**
 * Builds the human-readable message for one notification from its
 * denormalized display context (`../types.ts`) — no second fetch needed,
 * per that type's own JSDoc. Exhaustively switches on `type` so a future
 * `NotificationType` added to the discriminated union fails this file's
 * typecheck instead of silently rendering nothing, mirroring
 * `server/service.ts`'s own exhaustiveness guard on the server side.
 */
function formatNotificationMessage(notification: Notification): string {
  switch (notification.type) {
    case "BUDGET_OVER":
      return `You're over budget in ${notification.categoryName} this month.`
    case "BILL_DUE_SOON": {
      const daysUntilDue = daysBetween(new Date(), notification.dueDate)
      if (daysUntilDue <= 0) {
        return `${notification.billName} is due today.`
      }
      return `${notification.billName} is due in ${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"}.`
    }
    case "BILL_LATE":
      return `${notification.billName} is late.`
    default: {
      const exhaustiveCheck: never = notification
      throw new Error(`Unsupported notification type: ${String((exhaustiveCheck as Notification).type)}`)
    }
  }
}

/** Whole-calendar-day difference between `from` and `to` (both may carry a
 * time-of-day component — `dueDate` arrives over JSON as a string). Rounds
 * rather than floors so a `dueDate` a few hours into "today" from `from`'s
 * exact fetch moment still reads as "due today" (0) instead of drifting to
 * -1 from truncation. Presentational only — the server's own due-soon
 * window logic (`features/notifications/server/service.ts`) is the source
 * of truth for which notifications exist at all. */
function daysBetween(from: Date, to: Date | string): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000
  const toDate = typeof to === "string" ? new Date(to) : to
  return Math.round((toDate.getTime() - from.getTime()) / MS_PER_DAY)
}

function NotificationRow({
  notification,
  onMarkRead,
  onDismiss,
  isDismissing,
}: {
  notification: Notification
  onMarkRead: (id: string) => void
  onDismiss: (id: string) => void
  isDismissing: boolean
}) {
  const isUnread = notification.readAt === null

  return (
    <div
      className={cn(
        "flex items-start gap-2 border-b px-3 py-2.5 last:border-b-0",
        isUnread && "bg-accent/40",
      )}
    >
      <button
        type="button"
        className="flex-1 text-left disabled:cursor-default"
        disabled={!isUnread}
        onClick={() => onMarkRead(notification.id)}
        aria-label={isUnread ? "Mark notification as read" : undefined}
      >
        <p className="text-sm leading-snug text-foreground">
          {formatNotificationMessage(notification)}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatDate(notification.createdAt)}
        </p>
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="mt-0.5 shrink-0"
        aria-label="Dismiss notification"
        disabled={isDismissing}
        onClick={() => onDismiss(notification.id)}
      >
        <X aria-hidden="true" />
      </Button>
    </div>
  )
}

export function NotificationBell({ className }: NotificationBellProps) {
  const { data, isLoading } = useNotifications()
  const markRead = useMarkNotificationRead()
  const dismiss = useDismissNotification()
  const markAllRead = useMarkAllNotificationsRead()

  const items = data?.items ?? []
  const unreadCount = data?.unreadCount ?? 0

  const handleMarkRead = (id: string) => {
    markRead.mutate(
      { id },
      {
        onError: (error) =>
          toast.error(error instanceof Error ? error.message : "Could not mark notification as read."),
      },
    )
  }

  const handleDismiss = (id: string) => {
    dismiss.mutate(
      { id },
      {
        onError: (error) =>
          toast.error(error instanceof Error ? error.message : "Could not dismiss notification."),
      },
    )
  }

  const handleMarkAllRead = () => {
    markAllRead.mutate(undefined, {
      onError: (error) =>
        toast.error(error instanceof Error ? error.message : "Could not mark all notifications as read."),
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("relative", className)}
          aria-label={unreadCount > 0 ? `Open notifications (${unreadCount} unread)` : "Open notifications"}
        >
          <Bell className="size-4" aria-hidden="true" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-4 min-w-4 justify-center rounded-full px-1 text-[0.65rem] leading-none"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2">
          <DropdownMenuLabel className="p-0 text-sm font-medium text-foreground">
            Notifications
          </DropdownMenuLabel>
          {unreadCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto px-1.5 py-0.5 text-xs"
              disabled={markAllRead.isPending}
              onClick={handleMarkAllRead}
            >
              Mark all read
            </Button>
          )}
        </div>
        <DropdownMenuSeparator className="my-0" />
        <ScrollArea className="max-h-96">
          {isLoading ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Loading notifications...
            </p>
          ) : items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              You&apos;re all caught up — no notifications right now.
            </p>
          ) : (
            items.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                onMarkRead={handleMarkRead}
                onDismiss={handleDismiss}
                isDismissing={dismiss.isPending && dismiss.variables?.id === notification.id}
              />
            ))
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
