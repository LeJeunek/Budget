/**
 * Validation schema and default-values helper for holding-form.tsx, split
 * into its own module so the component file (rendering + submit wiring)
 * stays under the company's ~300-line-per-file guideline — same split as
 * `features/accounts/components/account-form-schema.ts`.
 *
 * This is a client-side copy of the rules already enforced by
 * `features/investments/server/validation.ts` (`CreateHoldingSchema`/
 * `UpdateHoldingSchema`) — kept here, not imported, for fast client
 * feedback only; the Server Action re-validates independently and is the
 * real source of truth (same precedent as account-form-schema.ts's own
 * JSDoc).
 */

import { z } from "zod"

import type { AssetType, Holding, Sector } from "@/features/investments/types"
import { SECTOR_REQUIRED_ASSET_TYPES } from "./investment-labels"

/** Sentinel `containerSelection` value meaning "create a new container
 * account inline" (AC1) rather than one of the caller's existing container
 * ids — a real `accountId` (a cuid) can never collide with this literal. */
export const NEW_CONTAINER_VALUE = "__new__"

const numericStringField = (label: string) =>
  z
    .string()
    .trim()
    .refine((value) => value !== "" && Number.isFinite(Number(value)), {
      message: `${label} must be a number`,
    })
    .refine((value) => Number(value) >= 0, {
      message: `${label} cannot be negative`,
    })

export const HoldingFormSchema = z
  .object({
    // Only read in create mode (holding-form.tsx omits these fields from the
    // form entirely in edit mode, and from the payload it sends) — a
    // holding's container can't be changed after creation, matching
    // UpdateHoldingSchema's field list, which has no accountId.
    containerSelection: z.string().optional(),
    newContainerName: z.string().trim().optional(),
    newContainerType: z
      .enum(["INVESTMENT", "RETIREMENT", "CRYPTO"])
      .optional(),

    name: z
      .string()
      .trim()
      .min(1, "Name is required")
      .max(120, "Name must be 120 characters or fewer"),
    assetType: z.enum(
      ["STOCK", "ETF", "MUTUAL_FUND", "BOND", "CRYPTO", "RETIREMENT_FUND", "OTHER"],
      { error: "Select an asset type" },
    ),
    // "" means "no sector" (Crypto/Bond/Other/Retirement Fund) — converted to
    // `null` in holding-form.tsx's onSubmit, mirroring
    // UpdateHoldingSchema.sector's `.nullable()` distinction.
    sector: z.string().trim(),
    costBasis: numericStringField("Cost basis"),
    currentValue: numericStringField("Current value"),
  })
  .superRefine((data, ctx) => {
    if (
      SECTOR_REQUIRED_ASSET_TYPES.has(data.assetType as AssetType) &&
      data.sector === ""
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Sector is required for Stock, ETF, and Mutual Fund holdings",
        path: ["sector"],
      })
    }

    // Only relevant in create mode — holding-form.tsx skips this refinement's
    // failure path for edit mode by never rendering/validating these fields
    // there in practice, but the check itself is harmless either way since
    // an edit-mode submit never has a blank containerSelection (it's not on
    // the form) and isn't checked here at all if omitted.
    if (data.containerSelection === undefined) {
      return
    }
    if (data.containerSelection === NEW_CONTAINER_VALUE) {
      if (!data.newContainerName || data.newContainerName.trim() === "") {
        ctx.addIssue({
          code: "custom",
          message: "Name is required for a new container account",
          path: ["newContainerName"],
        })
      }
      if (!data.newContainerType) {
        ctx.addIssue({
          code: "custom",
          message: "Select a container type",
          path: ["newContainerType"],
        })
      }
    } else if (data.containerSelection === "") {
      ctx.addIssue({
        code: "custom",
        message: "Select a container account",
        path: ["containerSelection"],
      })
    }
  })

export type HoldingFormFields = z.infer<typeof HoldingFormSchema>

/**
 * Omit `holding` for create-mode defaults. `lockedAccountId`, when supplied
 * (the per-container "Add holding" entry point), preselects that container
 * and is expected to be paired with holding-form.tsx hiding the container
 * picker entirely, so the user never sees `containerSelection` as a field at
 * all in that flow.
 */
export function defaultValuesFor(
  holding?: Holding,
  lockedAccountId?: string,
): HoldingFormFields {
  if (!holding) {
    return {
      containerSelection: lockedAccountId ?? "",
      newContainerName: "",
      newContainerType: "INVESTMENT",
      name: "",
      assetType: "STOCK",
      sector: "",
      costBasis: "0",
      currentValue: "0",
    }
  }

  return {
    containerSelection: holding.accountId,
    newContainerName: "",
    newContainerType: "INVESTMENT",
    name: holding.name,
    assetType: holding.assetType,
    sector: holding.sector ?? "",
    costBasis: String(holding.costBasis),
    currentValue: String(holding.currentValue),
  }
}

/** Re-exported purely for holding-form.tsx's convenience so it doesn't need
 * a second import line for the enum type. */
export type { Sector }
