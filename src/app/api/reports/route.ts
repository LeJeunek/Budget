import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth"
import { fail } from "@/lib/api-response"
import { generateReport } from "@/features/reports/server/service"
import type { RawReportQueryParams } from "@/features/reports/server/validation"

/**
 * `GET /api/reports` — per docs/architecture/api-contracts.md's Phase 4b
 * Reports row and phase-4b-technical-design.md §3's route design.
 * Session-authenticated (the ordinary rule — no cron-style exception here),
 * query-string driven: `?type=monthly&month=YYYY-MM` |
 * `?type=yearly&year=YYYY` | `?type=tax-summary&year=YYYY` |
 * `?type=income|expense|cash-flow&period=this-year|last-12-months|
 * year-to-date|all-time` | `?type=income|expense|cash-flow&start=YYYY-MM-DD
 * &end=YYYY-MM-DD`.
 *
 * **One narrow, explicit exception to the standing `ApiResult<T>`
 * convention, on the success path only** (naming-standards.md's Phase 4b
 * note, mirroring `app/api/uploadthing/route.ts`'s existing exception): the
 * response body **is** the deliverable.
 *
 * - **Success (200):** raw `application/pdf` bytes, `Content-Disposition:
 *   attachment; filename="<type>-<period>.pdf"`.
 * - **Failure (400/401/500):** an ordinary `ApiResult<never>` JSON body —
 *   bad input, an unauthenticated session, a not-yet-started future period,
 *   or a genuine generation failure. This is what keeps Cross-Cutting
 *   Requirement #6 ("a generation failure is honest and recoverable")
 *   mechanically enforceable: a failure is a distinguishable, typed JSON
 *   error, never a truncated/corrupted PDF.
 *
 * Every read inside `generateReport` is scoped by `user.id` (resolved here,
 * from the session, never from a client-supplied query param) — reports.md's
 * AC5 "a user can never request or retrieve a report scoped to another
 * user's data" holds by the same ordinary construction every other Route
 * Handler in this codebase already relies on.
 */
export const runtime = "nodejs"

function toRawParams(searchParams: URLSearchParams): RawReportQueryParams {
  return {
    type: searchParams.get("type") ?? undefined,
    month: searchParams.get("month") ?? undefined,
    year: searchParams.get("year") ?? undefined,
    period: searchParams.get("period") ?? undefined,
    start: searchParams.get("start") ?? undefined,
    end: searchParams.get("end") ?? undefined,
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(fail("UNAUTHENTICATED"), { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const rawParams = toRawParams(searchParams)

  let outcome: Awaited<ReturnType<typeof generateReport>>
  try {
    outcome = await generateReport(user.id, rawParams)
  } catch (error) {
    console.error("[reports] generateReport failed:", error)
    return NextResponse.json(fail("Report generation failed. Please try again."), { status: 500 })
  }

  if (outcome.status === "error") {
    return NextResponse.json(fail(outcome.message), { status: 400 })
  }

  return new NextResponse(new Uint8Array(outcome.buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${outcome.filename}"`,
    },
  })
}
