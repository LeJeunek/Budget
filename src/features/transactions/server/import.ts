import { db } from "@/lib/db"
import { ok, fail, type ApiResult } from "@/lib/api-response"
import type { TransactionImportSummary } from "@/features/transactions/types"
import { amountSchema, dateOnlySchema, merchantSchema } from "@/features/transactions/server/validation"

/**
 * CSV parsing, per-row validation, duplicate detection, and category
 * matching for `POST /api/transactions/import`
 * (src/app/api/transactions/import/route.ts), per
 * docs/architecture/api-contracts.md's Transactions "Import CSV" row and
 * docs/product/transactions.md AC16-21.
 *
 * This module owns the same business-logic role for the import endpoint that
 * `server/service.ts`/`server/actions.ts` own for the rest of the feature: it
 * takes a pre-resolved `userId` from the caller (the Route Handler, which
 * calls `getCurrentUser()`) and never trusts a client-supplied id, per
 * folder-tree.md's rule.
 */

// ---------------------------------------------------------------------------
// Limits — docs/product/transactions.md AC21: "enforces a reasonable maximum
// file size/row count per import and rejects oversized files with a clear,
// actionable message rather than failing silently or timing out."
//
// Chosen values: 5 MB / 5,000 data rows. A well-formed transaction CSV row
// (date, merchant, amount, category, notes) is well under 1 KB even with a
// long merchant/notes field, so 5 MB comfortably covers a multi-year, every-
// transaction bank export (tens of thousands of characters of headroom per
// row) while still bounding worst-case parse/DB time for a single request to
// something that won't approach a serverless function's timeout. 5,000 rows
// is a similarly generous multi-year ceiling for a single account's history
// — a user with more than that is better served by splitting the export,
// which is explicitly acceptable per AC17's "re-import just those rows"
// framing (the system is already designed around partial/incremental
// imports, not one all-or-nothing file per account ever).
// ---------------------------------------------------------------------------
const MAX_IMPORT_FILE_SIZE_BYTES = 5 * 1024 * 1024
const MAX_IMPORT_DATA_ROWS = 5000

/** Expected CSV header columns (case-insensitive, order-independent).
 * `date`/`merchant`/`amount` are required; `category`/`notes` are optional.
 * There is no company-wide "standard bank export format" to conform to
 * (none is specified in docs/product/transactions.md), so this module
 * defines its own minimal template — a user exporting from their bank first
 * maps/renames columns to this shape, the same expectation most personal
 * finance apps set for CSV import. */
const REQUIRED_COLUMNS = ["date", "merchant", "amount"] as const
const OPTIONAL_COLUMNS = ["category", "notes"] as const

type RequiredColumn = (typeof REQUIRED_COLUMNS)[number]
type OptionalColumn = (typeof OPTIONAL_COLUMNS)[number]
type ColumnIndex = Partial<Record<RequiredColumn | OptionalColumn, number>>

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

/**
 * Hand-rolled CSV parser (comma-separated, quoted-field support with `""`
 * escaping, embedded commas/newlines inside quotes). No CSV parsing library
 * is currently a dependency of this project (checked package.json before
 * writing this), and a well-formed bank-export CSV does not need more than
 * this — RFC 4180 quoting is the only complexity real-world exports add
 * beyond naive `split(",")`. Kept in-module rather than adding a new
 * dependency (e.g. papaparse) for this one call site.
 */
function parseCsv(content: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false

  const len = content.length
  let i = 0

  while (i < len) {
    const char = content[i]

    if (inQuotes) {
      if (char === '"') {
        if (content[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += char
      i += 1
      continue
    }

    if (char === '"') {
      inQuotes = true
      i += 1
      continue
    }
    if (char === ",") {
      row.push(field)
      field = ""
      i += 1
      continue
    }
    if (char === "\r") {
      // Normalize CRLF by simply dropping \r; the following \n (if any)
      // still terminates the row.
      i += 1
      continue
    }
    if (char === "\n") {
      row.push(field)
      rows.push(row)
      row = []
      field = ""
      i += 1
      continue
    }

    field += char
    i += 1
  }

  // Files that don't end with a trailing newline still have a final
  // field/row to flush.
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  // Drop fully-blank trailing lines (e.g. a stray newline at EOF).
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""))
}

/** Builds a case-insensitive column-name -> index map from the CSV's header
 * row, or `null` if a required column is missing (the "totally unrecognized
 * format" edge case — the whole file is rejected up front rather than
 * producing thousands of row-level errors). */
function resolveColumnIndex(header: string[]): ColumnIndex | null {
  const normalized = header.map((h) => h.trim().toLowerCase())
  const index: ColumnIndex = {}

  for (const column of [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS]) {
    const at = normalized.indexOf(column)
    if (at !== -1) {
      index[column] = at
    }
  }

  const missing = REQUIRED_COLUMNS.filter((column) => index[column] === undefined)
  if (missing.length > 0) {
    return null
  }
  return index
}

// ---------------------------------------------------------------------------
// Field-level parsing (lenient, real-world CSV values -> normalized types)
// ---------------------------------------------------------------------------

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const US_SLASH_DATE_PATTERN = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/

/** Parses a CSV date cell into a normalized `"yyyy-mm-dd"` string accepted by
 * `dateOnlySchema`. Bank exports commonly use `MM/DD/YYYY` rather than ISO,
 * so both are accepted; anything else is treated as unparseable (AC17). */
function normalizeCsvDate(raw: string): string | null {
  const trimmed = raw.trim()
  if (ISO_DATE_PATTERN.test(trimmed)) {
    return trimmed
  }
  const match = US_SLASH_DATE_PATTERN.exec(trimmed)
  if (match) {
    const [, month, day, year] = match
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
  }
  return null
}

/** Parses a CSV amount cell into a `number`, accepting common bank-export
 * formatting: a leading `$`, thousands separators (`,`), and parentheses as
 * a negative-amount convention (e.g. `"(45.00)"` -> `-45`). Returns `null`
 * for anything that doesn't reduce to a finite number (AC17). */
function normalizeCsvAmount(raw: string): number | null {
  let trimmed = raw.trim()
  if (trimmed.length === 0) {
    return null
  }

  let negative = false
  if (trimmed.startsWith("(") && trimmed.endsWith(")")) {
    negative = true
    trimmed = trimmed.slice(1, -1)
  }

  trimmed = trimmed.replace(/[$,\s]/g, "")
  if (trimmed.startsWith("-")) {
    negative = true
    trimmed = trimmed.slice(1)
  }

  if (trimmed.length === 0 || Number.isNaN(Number(trimmed))) {
    return null
  }

  const value = Number(trimmed)
  return negative ? -value : value
}

// ---------------------------------------------------------------------------
// Duplicate detection
// ---------------------------------------------------------------------------

/** Builds the dedup key AC18 describes ("same date, amount, and merchant
 * already on file"): normalized `yyyy-mm-dd` date, amount in integer cents
 * (avoids float-equality issues), and lowercased/trimmed merchant. */
function buildDedupeKey(dateIso: string, amount: number, merchant: string): string {
  const cents = Math.round(amount * 100)
  return `${dateIso}|${cents}|${merchant.trim().toLowerCase()}`
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Imports a CSV file's transactions into a single account chosen up front
 * (AC16), per docs/product/transactions.md AC17-21:
 *   - Each row is validated independently; invalid rows are skipped and
 *     reported with row number + reason (AC17). Row numbers count the header
 *     as row 1, so the first data row is row 2 — matching what a user sees
 *     if they open the file in a spreadsheet program.
 *   - Rows matching an existing transaction in the target account (same
 *     date+amount+merchant) are skipped as duplicates and counted (AC18),
 *     including duplicates *within* the same file (re-importing the same
 *     export twice, or a file with an internal repeat, both collapse to one
 *     import) — not just against what's already in the database.
 *   - A CSV `category` value matching an existing category name for this
 *     user (case-insensitive, same convention as
 *     `features/categories/server/actions.ts`) is auto-assigned; otherwise
 *     the row imports as Uncategorized (`categoryId: null`) rather than
 *     blocking (AC20). No new categories are created from CSV input.
 *   - Oversized files (`fileSizeBytes` or row count over the limits above)
 *     are rejected outright with a clear message (AC21), before any
 *     row-by-row work.
 *
 * The target account's existence/ownership/archived-state is validated here
 * (not by the Route Handler) since it's core import business logic — mirrors
 * `server/actions.ts`'s `createTransaction` archived-account check
 * (docs/product/accounts.md's "Attempting to log a new transaction against
 * an archived account" edge case applies identically to a bulk import).
 */
export async function importTransactionsFromCsv(
  userId: string,
  accountId: string,
  csvContent: string,
  fileSizeBytes: number,
): Promise<ApiResult<TransactionImportSummary>> {
  if (fileSizeBytes > MAX_IMPORT_FILE_SIZE_BYTES) {
    const maxMb = (MAX_IMPORT_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0)
    return fail(`File is too large — the maximum import size is ${maxMb} MB`)
  }

  const account = await db.account.findFirst({ where: { id: accountId, userId } })
  if (!account) {
    return fail("Account not found")
  }
  if (account.archivedAt) {
    return fail("Cannot import transactions into an archived account")
  }

  let rows: string[][]
  try {
    rows = parseCsv(csvContent)
  } catch {
    return fail("Could not parse this file as CSV — check the file's format and try again")
  }

  if (rows.length === 0) {
    return fail("The file is empty")
  }

  const [header, ...dataRows] = rows

  const columnIndex = resolveColumnIndex(header)
  if (!columnIndex) {
    return fail(
      `The CSV is missing one or more required columns (${REQUIRED_COLUMNS.join(", ")}) — check the file's header row`,
    )
  }

  if (dataRows.length > MAX_IMPORT_DATA_ROWS) {
    return fail(
      `File has too many rows — the maximum per import is ${MAX_IMPORT_DATA_ROWS.toLocaleString("en-US")}`,
    )
  }

  const categories = await db.category.findMany({
    where: { userId },
    select: { id: true, name: true },
  })
  const categoryIdByName = new Map(
    categories.map((category) => [category.name.toLowerCase(), category.id]),
  )

  const existingTransactions = await db.transaction.findMany({
    where: { userId, accountId },
    select: { date: true, amount: true, merchant: true },
  })
  const existingKeys = new Set(
    existingTransactions.map((t) =>
      buildDedupeKey(t.date.toISOString().slice(0, 10), t.amount.toNumber(), t.merchant),
    ),
  )
  const seenInBatch = new Set<string>()

  const errors: TransactionImportSummary["errors"] = []
  let skippedDuplicates = 0
  const toInsert: {
    date: Date
    merchant: string
    amount: number
    categoryId: string | null
    notes: string | null
  }[] = []

  dataRows.forEach((row, dataRowIndex) => {
    const rowNumber = dataRowIndex + 2 // header is row 1

    const rawDate = columnIndex.date !== undefined ? row[columnIndex.date] ?? "" : ""
    const rawMerchant =
      columnIndex.merchant !== undefined ? row[columnIndex.merchant] ?? "" : ""
    const rawAmount = columnIndex.amount !== undefined ? row[columnIndex.amount] ?? "" : ""
    const rawCategory =
      columnIndex.category !== undefined ? row[columnIndex.category] ?? "" : ""
    const rawNotes = columnIndex.notes !== undefined ? row[columnIndex.notes] ?? "" : ""

    const normalizedDate = normalizeCsvDate(rawDate)
    if (!normalizedDate) {
      errors.push({ row: rowNumber, message: `Unparseable date: "${rawDate}"` })
      return
    }
    const dateResult = dateOnlySchema.safeParse(normalizedDate)
    if (!dateResult.success) {
      errors.push({ row: rowNumber, message: `Unparseable date: "${rawDate}"` })
      return
    }

    const merchantResult = merchantSchema.safeParse(rawMerchant)
    if (!merchantResult.success) {
      errors.push({
        row: rowNumber,
        message: merchantResult.error.issues[0]?.message ?? "Invalid merchant",
      })
      return
    }

    const normalizedAmount = normalizeCsvAmount(rawAmount)
    if (normalizedAmount === null) {
      errors.push({ row: rowNumber, message: `Unparseable amount: "${rawAmount}"` })
      return
    }
    const amountResult = amountSchema.safeParse(normalizedAmount)
    if (!amountResult.success) {
      errors.push({
        row: rowNumber,
        message: amountResult.error.issues[0]?.message ?? "Invalid amount",
      })
      return
    }

    const dedupeKey = buildDedupeKey(normalizedDate, amountResult.data, merchantResult.data)
    if (existingKeys.has(dedupeKey) || seenInBatch.has(dedupeKey)) {
      skippedDuplicates += 1
      return
    }
    seenInBatch.add(dedupeKey)

    const categoryId = rawCategory.trim()
      ? categoryIdByName.get(rawCategory.trim().toLowerCase()) ?? null
      : null

    const notes = rawNotes.trim() ? rawNotes.trim() : null

    toInsert.push({
      date: dateResult.data,
      merchant: merchantResult.data,
      amount: amountResult.data,
      categoryId,
      notes,
    })
  })

  if (toInsert.length > 0) {
    await db.transaction.createMany({
      data: toInsert.map((t) => ({
        userId,
        accountId,
        categoryId: t.categoryId,
        merchant: t.merchant,
        amount: t.amount,
        date: t.date,
        notes: t.notes,
      })),
    })
  }

  return ok({
    imported: toInsert.length,
    skippedDuplicates,
    errors,
  })
}
