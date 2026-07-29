"use client"

import { useEffect, useRef } from "react"

import { captureInferredTimezone } from "../server/actions"

/**
 * `timezone-auto-capture.tsx` — phase-4c-technical-design.md §3.3's "tiny
 * client component," mounted once in `app/(dashboard)/layout.tsx` alongside
 * `ThemeProvider` (same "component built by the feature owner, mounted by
 * the Frontend Lead in the root/authenticated layout" split already
 * established for that provider — see its own JSDoc).
 *
 * Renders no visible UI at all. On first mount, fires `captureInferredTimezone`
 * with the browser's own resolved IANA timezone
 * (`Intl.DateTimeFormat().resolvedOptions().timeZone`) — that Server Action is
 * itself a no-op unless the caller's `UserPreference.timezoneConfirmed` is
 * still `false` (§3.3), so mounting this on every authenticated page load is
 * safe: it only ever actually changes anything once, the first time a real
 * browser inference reaches the server before any explicit user edit does.
 *
 * `hasFired` guards against React Strict Mode's intentional double-invoke of
 * effects in development — without it, a dev-mode double mount would fire
 * this Server Action twice in a row (harmless given the action's own
 * idempotent, conditional-update guard, but pointless network chatter this
 * guard avoids for free).
 */
export function TimezoneAutoCapture() {
  const hasFired = useRef(false)

  useEffect(() => {
    if (hasFired.current) return
    hasFired.current = true

    const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    void captureInferredTimezone(browserTimezone)
  }, [])

  return null
}
