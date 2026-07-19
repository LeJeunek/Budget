import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth"
import { fail, ok } from "@/lib/api-response"
import { getNotifications, getUnreadCount } from "@/features/notifications/server/service"

/**
 * `GET /api/notifications` — the notification bell's polling target, per
 * docs/architecture/api-contracts.md's Notifications section ("Get inbox
 * (list + unread count)").
 *
 * Unlike most Phase 2 reads (Server Component direct calls to `service.ts`),
 * this genuinely needs a real Route Handler: the bell is polled client-side
 * on a short interval + refetch-on-window-focus
 * (`features/notifications/hooks/use-notifications.ts`, Frontend Lead's
 * file), which has no way to invoke a Server Component read directly — the
 * same "ambient, needs to update without a full navigation" reasoning
 * Transactions' table hook needed in Phase 1.
 *
 * Both `getNotifications` and `getUnreadCount` call
 * `service.ensureNotifications(userId)` internally before reading (per that
 * function's own contract: "call this at the top of every read"), so this
 * handler does not call it separately itself — doing so would just be a
 * third redundant (though harmless/idempotent) materialization pass over the
 * same data on every request.
 */
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(fail("UNAUTHENTICATED"), { status: 401 })
  }

  const [items, unreadCount] = await Promise.all([
    getNotifications(user.id),
    getUnreadCount(user.id),
  ])

  return NextResponse.json(ok({ items, unreadCount }))
}
