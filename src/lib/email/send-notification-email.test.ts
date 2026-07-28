import type { ReactElement } from "react"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// `send-notification-email.ts`'s one dependency (`getResendClient`) is
// mocked directly, mirroring `notifications/server/triggers/
// monthly-summary-trigger.test.ts`'s "small, narrow-dependency DB/network-
// touching function" convention — this function is short enough, and its one
// external call narrow enough, that a source-level-only test would miss the
// actual `sent`/`error` shape this function resolves to for each branch,
// including the timeout path added for
// docs/performance/phase-4b-performance-review.md Finding 6.
const sendMock = vi.fn()
vi.mock("./client", () => ({
  getResendClient: () => ({ emails: { send: sendMock } }),
}))

import { EMAIL_SEND_TIMEOUT_MS, sendNotificationEmail } from "./send-notification-email"

const BASE_PARAMS = {
  to: "user@example.com",
  subject: "Test subject",
  template: null as unknown as ReactElement,
}

describe("sendNotificationEmail", () => {
  const originalFromAddress = process.env.EMAIL_FROM_ADDRESS

  beforeEach(() => {
    process.env.EMAIL_FROM_ADDRESS = "notifications@financeos.test"
    sendMock.mockReset()
  })

  afterEach(() => {
    process.env.EMAIL_FROM_ADDRESS = originalFromAddress
    vi.useRealTimers()
  })

  it("resolves { sent: false, error } without calling Resend at all when EMAIL_FROM_ADDRESS is not configured", async () => {
    delete process.env.EMAIL_FROM_ADDRESS

    const result = await sendNotificationEmail(BASE_PARAMS)

    expect(result).toEqual({
      sent: false,
      error: "EMAIL_FROM_ADDRESS is not configured",
    })
    expect(sendMock).not.toHaveBeenCalled()
  })

  it("resolves { sent: true } when Resend reports no error", async () => {
    sendMock.mockResolvedValue({ data: { id: "email-1" }, error: null })

    const result = await sendNotificationEmail(BASE_PARAMS)

    expect(result).toEqual({ sent: true })
  })

  it("resolves { sent: false, error: error.message } when Resend's own response includes an error", async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "Invalid `to` field" },
    })

    const result = await sendNotificationEmail(BASE_PARAMS)

    expect(result).toEqual({ sent: false, error: "Invalid `to` field" })
  })

  it("resolves { sent: false, error } — never throws — when the Resend call itself rejects", async () => {
    sendMock.mockRejectedValue(new Error("network unreachable"))

    const result = await sendNotificationEmail(BASE_PARAMS)

    expect(result).toEqual({ sent: false, error: "network unreachable" })
  })

  it("resolves { sent: false, error } — never hangs — when the Resend call never settles within EMAIL_SEND_TIMEOUT_MS", async () => {
    vi.useFakeTimers()
    // Never resolves/rejects on its own — simulates a hung provider request,
    // the exact scenario Finding 6's timeout exists to bound.
    sendMock.mockReturnValue(new Promise(() => {}))

    const resultPromise = sendNotificationEmail(BASE_PARAMS)
    await vi.advanceTimersByTimeAsync(EMAIL_SEND_TIMEOUT_MS)
    const result = await resultPromise

    expect(result.sent).toBe(false)
    expect(result.error).toMatch(/timed out/i)
  })

  it("resolves { sent: true } when Resend responds just before the timeout — the timeout never fires a false failure for a merely-slow-but-successful send", async () => {
    vi.useFakeTimers()
    let resolveSend: (value: { data: { id: string }; error: null }) => void = () => {}
    sendMock.mockReturnValue(
      new Promise((resolve) => {
        resolveSend = resolve
      }),
    )

    const resultPromise = sendNotificationEmail(BASE_PARAMS)
    await vi.advanceTimersByTimeAsync(EMAIL_SEND_TIMEOUT_MS - 1000)
    resolveSend({ data: { id: "email-1" }, error: null })
    const result = await resultPromise

    expect(result).toEqual({ sent: true })
  })
})
