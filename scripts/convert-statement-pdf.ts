// One-off personal tool: converts a New Horizons Credit Union PDF statement
// into the CSV shape prisma import expects (date,merchant,amount,category,notes).
// Not a product feature - no UI, no account-scoping (that happens at import time).
// Usage: npx tsx scripts/convert-statement-pdf.ts <input.pdf> <output.csv>
import { readFile, writeFile } from "node:fs/promises"
import { PDFParse } from "pdf-parse"

const HEADER_RE =
  /^(\d{2}\/\d{2}\/\d{4})\s+(Withdrawal|Deposit|Recurring Withdrawal|Recurring Deposit)(?:\s+(.*))?$/
const SKIP_LINE_RE =
  /Balance Forward|Ending Balance|Pending credit\/return|Dividends Paid YTD|^\s*ID \d|Statement Page|Account Number|Statement Period|Sign up for E-Statements|^\s*\d+ Withdrawals|^ATM (Withdrawal|Deposit)|^Date\s+(Description|Transaction Description)|^--\s*\d+ of \d+\s*--$|^Holiday Closing|^September \d|^All NHCU|^ATMs and Online|^use\.\s*Enroll in our free/
const CONT_DATE_PREFIX_RE = /^\d{2}\/\d{2}\/\d{4}\s+/
const LONG_REF_RE = /\b\d{10,}\b/
const PHONE_RE = /\b\d{3}-\d{3}-\d{4}\b/
const STATE_RE = /\b([A-Z]{2})\s*$/
// Two-word cities that appear in these statements - extend as needed.
const TWO_WORD_CITIES = ["SPANISH FORT", "BAY MINETTE"]

interface Row {
  date: string
  merchant: string
  amount: number
  notes: string
}

function toIso(mmddyyyy: string): string {
  const [m, d, y] = mmddyyyy.split("/")
  return `${y}-${m}-${d}`
}

function cleanMerchant(raw: string): string {
  let s = raw.trim()
  for (const city of TWO_WORD_CITIES) {
    s = s.replace(new RegExp(`\\s+${city}\\s*$`), "")
  }
  s = s.replace(STATE_RE, "").trim()
  s = s.replace(PHONE_RE, "").trim()
  s = s.replace(LONG_REF_RE, "").trim()
  // Truncate at the first purely-numeric token (street number) if one exists
  // after the first word (keeps store numbers like "TOM THUMB 0065" intact
  // when they're the *second* token, only strips a later street address).
  const words = s.split(/\s+/)
  for (let i = 1; i < words.length; i++) {
    if (/^\d+$/.test(words[i])) {
      s = words.slice(0, i).join(" ")
      break
    }
  }
  // Drop a trailing single-word city if what's left still has 3+ words
  // (heuristic - e.g. "BURGER KING #9270 ROBERTSDALE" -> "BURGER KING #9270").
  const words2 = s.split(/\s+/)
  if (words2.length >= 3 && /^[A-Z]+$/.test(words2[words2.length - 1])) {
    s = words2.slice(0, -1).join(" ")
  }
  return s.trim().replace(/\s{2,}/g, " ")
}

function parseAmountBalance(tail: string): { amount: number; balance: string; descriptor: string } | null {
  const tokens = tail.trim().split(/\s+/)
  if (tokens.length < 2) return null
  const balanceRaw = tokens[tokens.length - 1]
  const amountRaw = tokens[tokens.length - 2]
  const amount = Number(amountRaw.replace(/,/g, ""))
  if (Number.isNaN(amount)) return null
  const descriptor = tokens.slice(0, -2).join(" ")
  return { amount, balance: balanceRaw, descriptor }
}

function embeddedMerchant(descriptor: string): string | null {
  const achMatch = /\bACH\s+(.+)$/.exec(descriptor)
  if (achMatch) return achMatch[1].trim()
  const divMatch = /\bDividend\s+(.+)$/.exec(descriptor)
  if (divMatch) return divMatch[1].trim()
  return null
}

async function main() {
  const [inputPath, outputPath] = process.argv.slice(2)
  if (!inputPath || !outputPath) {
    console.error("Usage: npx tsx scripts/convert-statement-pdf.ts <input.pdf> <output.csv>")
    process.exit(1)
  }

  const buffer = await readFile(inputPath)
  const parser = new PDFParse({ data: buffer })
  const { text } = await parser.getText()
  const lines = text
    .split("\n")
    .map((l: string) => l.trim())
    .filter((l: string) => l.length > 0)

  const rows: Row[] = []
  const warnings: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (SKIP_LINE_RE.test(line)) continue

    const headerMatch = HEADER_RE.exec(line)
    if (!headerMatch) continue

    const [, dateRaw, , tail = ""] = headerMatch
    const parsed = parseAmountBalance(tail)
    if (!parsed) continue

    const embedded = embeddedMerchant(parsed.descriptor)
    let merchant: string
    const notesParts: string[] = [parsed.descriptor]

    // Page breaks insert boilerplate (page footer/header, "Statement Page X
    // of 5", etc.) between a transaction line and its true continuation line
    // - skip over any number of such lines to find the real next content.
    let j = i + 1
    while (j < lines.length && SKIP_LINE_RE.test(lines[j])) j++
    const next = lines[j]

    if (embedded) {
      merchant = embedded
      // Consume the metadata continuation line (TYPE:/Annual Percentage...) as notes only.
      if (next && !HEADER_RE.test(next)) {
        notesParts.push(next)
        i = j
      }
    } else {
      if (!next || HEADER_RE.test(next)) {
        warnings.push(`Row ${i + 1} (${dateRaw}): no continuation line found for "${line}" - merchant left blank`)
        merchant = "(unknown)"
      } else {
        i = j
        let contLine = next
        if (CONT_DATE_PREFIX_RE.test(contLine)) {
          contLine = contLine.replace(CONT_DATE_PREFIX_RE, "")
        }
        merchant = cleanMerchant(contLine)
        notesParts.push(next)
        if (!merchant) {
          warnings.push(`Row ${i} (${dateRaw}): merchant cleanup produced empty string from "${next}"`)
          merchant = "(unknown)"
        }
      }
    }

    rows.push({
      date: toIso(dateRaw),
      merchant,
      amount: parsed.amount,
      notes: notesParts.join(" | "),
    })
  }

  const csvEscape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const csvLines = ["date,merchant,amount,category,notes"]
  for (const r of rows) {
    csvLines.push([r.date, csvEscape(r.merchant), r.amount.toFixed(2), "", csvEscape(r.notes)].join(","))
  }

  await writeFile(outputPath, csvLines.join("\n") + "\n", "utf-8")
  console.log(`Wrote ${rows.length} transactions to ${outputPath}`)
  if (warnings.length > 0) {
    console.log(`\n${warnings.length} warning(s):`)
    warnings.forEach((w) => console.log(`  - ${w}`))
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
