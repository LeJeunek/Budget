/**
 * Human-readable labels for the Investments module's Prisma-backed enums
 * (`AssetType`, `Sector`), plus the small set of `AccountType`s that can act
 * as a Holding container (AC1). Client-side copies, not imports from
 * `server/service.ts` — that file's own `ASSET_TYPE_LABELS`/`SECTOR_LABELS`
 * constants are private, read-side-only concerns of the service module, and
 * every other domain in this app (e.g. `features/accounts/components/
 * account-form-schema.ts`'s `ACCOUNT_TYPE_LABELS`) keeps its own display-label
 * copy in the Frontend Lead's components layer rather than reaching into
 * `server/` for presentation strings.
 */

import type { AccountType } from "@/features/accounts/types"
import type { AssetType, Sector } from "@/features/investments/types"

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  STOCK: "Stock",
  ETF: "ETF",
  MUTUAL_FUND: "Mutual Fund",
  BOND: "Bond",
  CRYPTO: "Crypto",
  RETIREMENT_FUND: "Retirement Fund",
  OTHER: "Other",
}

export const ASSET_TYPE_VALUES = Object.keys(ASSET_TYPE_LABELS) as [
  AssetType,
  ...AssetType[],
]

export const SECTOR_LABELS: Record<Sector, string> = {
  TECHNOLOGY: "Technology",
  HEALTHCARE: "Healthcare",
  FINANCIALS: "Financials",
  ENERGY: "Energy",
  CONSUMER: "Consumer",
  REAL_ESTATE: "Real Estate",
  INDUSTRIALS: "Industrials",
  OTHER: "Other",
}

export const SECTOR_VALUES = Object.keys(SECTOR_LABELS) as [Sector, ...Sector[]]

/**
 * Asset types for which a sector is required, per investments.md AC2 —
 * duplicated from `features/investments/server/validation.ts`'s
 * `SECTOR_REQUIRED_ASSET_TYPES` (not imported: that module is server-only
 * per folder-tree.md's module boundary, and this client-side copy exists
 * purely for fast form feedback — the Server Action re-validates
 * independently and is the real source of truth, same precedent as every
 * other client-side schema copy in this codebase).
 */
export const SECTOR_REQUIRED_ASSET_TYPES: ReadonlySet<AssetType> = new Set([
  "STOCK",
  "ETF",
  "MUTUAL_FUND",
])

/** Container-capable `AccountType`s (AC1) — used by the holding form's
 * "create a new container" branch. Mirrors `server/actions.ts`'s
 * `CONTAINER_ACCOUNT_TYPES`. */
export const CONTAINER_ACCOUNT_TYPE_LABELS: Record<
  Extract<AccountType, "INVESTMENT" | "RETIREMENT" | "CRYPTO">,
  string
> = {
  INVESTMENT: "Investment",
  RETIREMENT: "Retirement",
  CRYPTO: "Crypto",
}

export const CONTAINER_ACCOUNT_TYPE_VALUES = Object.keys(
  CONTAINER_ACCOUNT_TYPE_LABELS,
) as ["INVESTMENT" | "RETIREMENT" | "CRYPTO", ...("INVESTMENT" | "RETIREMENT" | "CRYPTO")[]]
