import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth"
import { fail } from "@/lib/api-response"
import { importTransactionsFromCsv } from "@/features/transactions/server/import"

/**
 * `POST /api/transactions/import` (multipart/form-data: a `file` field and an
 * `accountId` field), per docs/architecture/api-contracts.md's Transactions
 * "Import CSV" row. A real Route Handler, not a Server Action — Server
 * Actions can technically accept a `FormData` payload, but api-contracts.md
 * is explicit this "needs a real HTTP endpoint", consistent with a plain
 * `fetch(..., { method: "POST", body: formData })` client call rather than a
 * `<form action={...}>` submission.
 *
 * This route stays a thin auth + request-shape wrapper — all CSV parsing,
 * row validation, duplicate detection, and category matching lives in
 * `features/transactions/server/import.ts`'s `importTransactionsFromCsv`,
 * which also owns the target account's ownership/archived-state check (see
 * that file's JSDoc for why).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(fail("UNAUTHENTICATED"), { status: 401 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json(
      fail("Expected a multipart/form-data request with a file and accountId"),
      { status: 400 },
    )
  }

  const file = formData.get("file")
  const accountId = formData.get("accountId")

  if (!(file instanceof File)) {
    return NextResponse.json(fail("A CSV file is required"), { status: 400 })
  }
  if (typeof accountId !== "string" || accountId.length === 0) {
    return NextResponse.json(fail("An account must be selected to import into"), {
      status: 400,
    })
  }

  let csvContent: string
  try {
    csvContent = await file.text()
  } catch {
    return NextResponse.json(
      fail("Could not read the uploaded file — it may be corrupted or use an unsupported encoding"),
      { status: 400 },
    )
  }

  const result = await importTransactionsFromCsv(user.id, accountId, csvContent, file.size)

  return NextResponse.json(result)
}
