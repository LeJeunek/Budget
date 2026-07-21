import { AccountType, AssetType, Sector } from "@prisma/client"
import { z } from "zod"

/**
 * Zod schemas for the Investments module's server boundary (every Server
 * Action's input), per docs/architecture/api-contracts.md's Investments
 * section and docs/product/investments.md's acceptance criteria / edge
 * cases.
 */

// ---------------------------------------------------------------------------
// Shared constants / helpers
// ---------------------------------------------------------------------------

// Matches the DB column precision (`prisma/schema.prisma`: `Holding.costBasis`/
// `currentValue`, `HoldingValueHistoryEntry.previousValue`/`newValue`, and
// `DividendEntry.amount` are all `Decimal(14, 2)`) — same rationale/value as
// `features/accounts/server/validation.ts`'s `MAX_BALANCE_ABS` and
// `features/goals/server/validation.ts`'s `MAX_DECIMAL_ABS`.
const MAX_DECIMAL_ABS = 999_999_999_999.99

const MAX_NAME_LENGTH = 120

/**
 * Guards against floating-point noise (e.g. 19.999999999999996 from a form
 * input) while still rejecting genuinely over-precise values like 19.999.
 * Duplicated from `features/accounts/server/validation.ts` and every other
 * domain's own copy, per folder-tree.md's module boundary rule
 * (features/<domain>/server is not a shared import target across domains) —
 * if this logic ever needs to change, update every copy.
 */
function hasAtMostTwoDecimalPlaces(value: number): boolean {
  const cents = value * 100
  return Math.abs(Math.round(cents) - cents) < 1e-6
}

/** Reused by `costBasis`/`currentValue`/dividend `amount` — all three are DB
 * `Decimal(14, 2)` columns needing the same "well-formed currency number"
 * shape check. Range/sign checks differ per field and are applied
 * separately below. */
function decimalPrecision(label: string) {
  return z
    .number({ error: `${label} must be a number` })
    .finite(`${label} must be a finite number`)
    .refine(hasAtMostTwoDecimalPlaces, {
      message: `${label} supports at most 2 decimal places`,
    })
    .refine((value) => Math.abs(value) <= MAX_DECIMAL_ABS, {
      message: `${label} must be no larger than ${MAX_DECIMAL_ABS.toLocaleString("en-US")} in magnitude`,
    })
}

/**
 * `costBasis`/`currentValue`: per investments.md's "Negative cost basis or
 * negative current value entered: rejected with a validation error, same as
 * Accounts' balance/interest-rate validation pattern" edge case — unlike
 * `Account.balance` (which explicitly allows negative for real overdrafts),
 * a holding's cost basis and current value have no legitimate negative
 * real-world meaning, so `.min(0)` is a genuine product rule here, not an
 * omission.
 */
function nonNegativeDecimal(label: string) {
  return decimalPrecision(label).min(0, `${label} cannot be negative`)
}

/** `DividendEntry.amount`: required, strictly positive — a $0 or negative
 * "dividend" logged is not a meaningful receipt, matching
 * `features/goals/server/validation.ts`'s `contributionAmountSchema`
 * rationale for the same shape of field. */
const dividendAmountSchema = decimalPrecision("Dividend amount").gt(
  0,
  "Dividend amount must be greater than 0",
)

const nameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(MAX_NAME_LENGTH, `Name must be ${MAX_NAME_LENGTH} characters or fewer`)

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** Builds a UTC-midnight `Date` from a `"yyyy-mm-dd"` string — identical
 * technique to `features/goals/server/validation.ts`'s `toUtcDateOnly`,
 * duplicated here for the same module-boundary reason as
 * `hasAtMostTwoDecimalPlaces` above. Matches `DividendEntry.date`'s
 * `@db.Date` + UTC convention. */
function toUtcDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

const dateOnlySchema = z
  .string()
  .regex(DATE_ONLY_PATTERN, "Date must be in YYYY-MM-DD format")
  .transform(toUtcDateOnly)

const assetTypeSchema = z.nativeEnum(AssetType, {
  error: "Asset type must be one of the supported asset types",
})

const sectorSchema = z.nativeEnum(Sector, {
  error: "Sector must be one of the supported sectors",
})

/**
 * Asset types for which a sector is a required field, per investments.md
 * AC2: "a sector (required for Stock/ETF/Mutual Fund; optional/not
 * applicable for Crypto/Bond/Other ...)".
 *
 * **Judgment call, flagged for the Product Owner/Solution Architect**:
 * AC2's own two lists ("required for Stock/ETF/Mutual Fund" vs.
 * "optional/not applicable for Crypto/Bond/Other") never mention
 * `RETIREMENT_FUND` at all — a genuine gap in the spec, not an oversight on
 * this file's part. `prisma/schema.prisma`'s `Holding.sector` doc comment and
 * `docs/architecture/naming-standards.md`'s `Sector` enum note both repeat
 * the exact same two lists verbatim, so the gap is not resolved anywhere
 * upstream either. Resolved here as "not applicable" (treated the same as
 * Bond/Crypto/Other, bucketed into allocation's "Other / Not Applicable"
 * bucket): a Retirement Fund (e.g. a 401k target-date fund) is, like a
 * diversified Mutual Fund, typically a multi-sector vehicle with no single
 * dominant sector — but unlike Mutual Fund, AC2 did not explicitly choose to
 * require one for it, so this file does not invent a stricter requirement
 * than the spec actually states. Revisit if the Product Owner resolves this
 * gap explicitly.
 */
const SECTOR_REQUIRED_ASSET_TYPES: ReadonlySet<AssetType> = new Set([
  AssetType.STOCK,
  AssetType.ETF,
  AssetType.MUTUAL_FUND,
])

/**
 * AC2's conditional-requirement rule, applied against a holding's *effective*
 * asset type and sector (the merged result of existing + incoming fields on
 * an update, or the create input directly). Returns an error message, or
 * `null` if the combination is valid.
 *
 * This cannot be expressed as a single Zod schema for `updateHolding`'s
 * partial input alone — the rule depends on the holding's *existing*
 * `assetType`/`sector` when the caller doesn't touch one of the two fields —
 * so it is exported as a plain function for `server/actions.ts` to call
 * after merging the parsed input with the current DB row, the same
 * "conditional requirement is an application-layer concern" precedent
 * `Holding.sector`'s own schema comment establishes.
 */
export function validateSectorForAssetType(
  assetType: AssetType,
  sector: Sector | null,
): string | null {
  if (SECTOR_REQUIRED_ASSET_TYPES.has(assetType) && sector === null) {
    return "Sector is required for Stock, ETF, and Mutual Fund holdings"
  }
  return null
}

// ---------------------------------------------------------------------------
// Public schemas — see docs/architecture/api-contracts.md's Investments
// section for the required names/shapes.
// ---------------------------------------------------------------------------

/** `createHolding`'s inline-container-creation branch (AC1) — a name plus
 * one of the three container-capable account types. Delegates the actual
 * Account row creation to `accounts.actions.createAccount`
 * (`server/actions.ts`), so this schema only validates the two fields that
 * action needs, not the account's full create shape (institution/balance/
 * color all take their existing defaults). */
const newContainerSchema = z.object({
  name: nameSchema,
  type: z.enum([AccountType.INVESTMENT, AccountType.RETIREMENT, AccountType.CRYPTO], {
    error: "Container type must be Investment, Retirement, or Crypto",
  }),
})

/**
 * `createHolding` input, per api-contracts.md: `accountId` **or**
 * `newContainer`, never both/neither (AC1's inline-container-creation flow),
 * plus every required holding field (AC2/AC3 — no share count/per-share
 * price fields exist here at all, by deliberate product design).
 */
export const CreateHoldingSchema = z
  .object({
    accountId: z.string().min(1).optional(),
    newContainer: newContainerSchema.optional(),
    name: nameSchema,
    assetType: assetTypeSchema,
    sector: sectorSchema.nullable().optional(),
    costBasis: nonNegativeDecimal("Cost basis"),
    currentValue: nonNegativeDecimal("Current value"),
  })
  .superRefine((data, ctx) => {
    if (Boolean(data.accountId) === Boolean(data.newContainer)) {
      ctx.addIssue({
        code: "custom",
        message:
          "Provide exactly one of an existing container's accountId or a newContainer to create",
        path: ["accountId"],
      })
    }

    const sectorError = validateSectorForAssetType(data.assetType, data.sector ?? null)
    if (sectorError) {
      ctx.addIssue({ code: "custom", message: sectorError, path: ["sector"] })
    }
  })

export type CreateHoldingInput = z.infer<typeof CreateHoldingSchema>

/**
 * `updateHolding` input. Every field besides `id` is optional so callers can
 * patch a single field — only fields actually present in the parsed input
 * are written by `server/actions.ts`'s `updateHolding`, the same
 * "undefined fields excluded from `data`" convention as
 * `features/accounts/server/actions.ts`'s `updateAccount`.
 *
 * `sector` accepts an explicit `null` (via `.nullable()`) so a caller can
 * clear a previously-set sector (e.g. after correcting the asset type to
 * Crypto) — plain `.optional()` alone cannot distinguish "leave unchanged"
 * from "clear it", the same distinction `UpdateAccountSchema.interestRate`
 * makes for the identical reason.
 *
 * No cross-field sector/assetType requirement is enforced *in this schema* —
 * see `validateSectorForAssetType`'s JSDoc for why that check happens in
 * `server/actions.ts` instead, against the merged existing+incoming values.
 */
export const UpdateHoldingSchema = z.object({
  id: z.string().min(1, "Holding id is required"),
  name: nameSchema.optional(),
  assetType: assetTypeSchema.optional(),
  sector: sectorSchema.nullable().optional(),
  costBasis: nonNegativeDecimal("Cost basis").optional(),
  currentValue: nonNegativeDecimal("Current value").optional(),
})

export type UpdateHoldingInput = z.infer<typeof UpdateHoldingSchema>

/** `closeHolding` input — just the id. */
export const HoldingIdSchema = z.object({
  id: z.string().min(1, "Holding id is required"),
})

export type HoldingIdInput = z.infer<typeof HoldingIdSchema>

/**
 * `logDividend` input, per api-contracts.md's
 * `LogDividendSchema { holdingId: string; amount: number (> 0); date: Date }`.
 * No `closedAt` check here — allowed even on a Closed holding (Edge Cases: a
 * final distribution can arrive after a position is closed); that
 * permissiveness is enforced (by simply never checking `closedAt`) in
 * `server/actions.ts`'s `logDividend`, not this schema.
 */
export const LogDividendSchema = z.object({
  holdingId: z.string().min(1, "Holding id is required"),
  amount: dividendAmountSchema,
  date: dateOnlySchema,
})

export type LogDividendInput = z.infer<typeof LogDividendSchema>
