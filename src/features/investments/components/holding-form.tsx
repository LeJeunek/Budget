"use client"

/**
 * HoldingFormDialog — a single form used for both creating and editing a
 * holding (docs/product/investments.md AC2/AC4), plus AddHoldingButton, a
 * small trigger that opens it in create mode. One component pair instead of
 * two near-duplicate forms, per the company's "avoid duplication" rule —
 * same structure as `features/accounts/components/account-form.tsx`. Field
 * JSX lives in `./holding-form-fields.tsx` (split out to keep this file, the
 * dialog shell + submit wiring, under the ~300-line guideline).
 *
 * Create mode offers the AC1 inline-container-creation flow: a "Container"
 * select whose options are every existing Investment/Retirement/Crypto
 * container plus a "+ Create a new account" sentinel
 * (`NEW_CONTAINER_VALUE`) that reveals a name + type pair instead, mirroring
 * `CreateHoldingSchema`'s "exactly one of accountId or newContainer"
 * contract. When `lockedAccountId` is supplied (the per-container "Add
 * holding" entry point on the main page), the picker is hidden entirely and
 * every submission targets that one container.
 *
 * Edit mode never shows the container fields at all — a holding's container
 * is immutable after creation (`UpdateHoldingSchema` has no `accountId`
 * field), matching `defaultValuesFor`'s split.
 *
 * Pattern match: React Hook Form + zodResolver + the shared `Form`
 * primitives, calling a Server Action directly and branching on its
 * `ApiResult`, exactly like account-form.tsx.
 */

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"

import type { ContainerSummary, Holding, Sector } from "@/features/investments/types"
import { createHolding, updateHolding } from "@/features/investments/server/actions"
import { SECTOR_REQUIRED_ASSET_TYPES } from "./investment-labels"
import {
  HoldingFormSchema,
  NEW_CONTAINER_VALUE,
  defaultValuesFor,
  type HoldingFormFields,
} from "./holding-form-schema"
import { ContainerFields, CoreFields } from "./holding-form-fields"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Form } from "@/components/ui/form"

export interface HoldingFormDialogProps {
  /** Omit for create mode; pass the holding being edited for edit mode. */
  holding?: Holding
  /** Create-mode container options — ignored in edit mode. */
  containers: ContainerSummary[]
  /** Preselects (and hides the picker for) one container — the per-container
   * "Add holding" entry point. Ignored in edit mode. */
  lockedAccountId?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function HoldingFormDialog({
  holding,
  containers,
  lockedAccountId,
  open,
  onOpenChange,
}: HoldingFormDialogProps) {
  const router = useRouter()
  const isEditMode = holding !== undefined

  const form = useForm<HoldingFormFields>({
    resolver: zodResolver(HoldingFormSchema),
    defaultValues: defaultValuesFor(holding, lockedAccountId),
  })

  // Re-syncs the form whenever the dialog opens — the same instance is
  // reused across every holding-row's Edit action plus the page/container
  // "Add holding" triggers, so stale values from a previous open must not
  // leak in (identical rationale to account-form.tsx's own effect).
  useEffect(() => {
    if (open) {
      form.reset(defaultValuesFor(holding, lockedAccountId))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, holding, lockedAccountId])

  const selectedAssetType = form.watch("assetType")
  const isSectorRequired = SECTOR_REQUIRED_ASSET_TYPES.has(selectedAssetType)
  const containerSelection = form.watch("containerSelection")
  const showContainerPicker = !isEditMode && !lockedAccountId
  const showNewContainerFields =
    showContainerPicker && containerSelection === NEW_CONTAINER_VALUE

  async function onSubmit(values: HoldingFormFields) {
    const sector = values.sector === "" ? null : (values.sector as Sector)
    const costBasis = Number(values.costBasis)
    const currentValue = Number(values.currentValue)

    if (isEditMode) {
      const result = await updateHolding({
        id: holding.id,
        name: values.name,
        assetType: values.assetType,
        sector,
        costBasis,
        currentValue,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Holding updated")
      onOpenChange(false)
      router.refresh()
      return
    }

    const accountId = lockedAccountId ?? containerSelection
    const result = await createHolding({
      ...(accountId === NEW_CONTAINER_VALUE
        ? {
            newContainer: {
              name: values.newContainerName ?? "",
              type: values.newContainerType ?? "INVESTMENT",
            },
          }
        : { accountId }),
      name: values.name,
      assetType: values.assetType,
      sector,
      costBasis,
      currentValue,
    })

    if (!result.success) {
      toast.error(result.error)
      return
    }

    toast.success("Holding added")
    onOpenChange(false)
    // Re-runs the Server Component page's getContainers/getHoldingsForContainer
    // calls — see app/(dashboard)/investments/page.tsx.
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit holding" : "Add holding"}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Update this holding's details. Every current value change is recorded in its growth history."
              : "Add a stock, ETF, fund, crypto position, or other holding to a container account."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            {showContainerPicker && (
              <ContainerFields
                form={form}
                containers={containers}
                showNewContainerFields={showNewContainerFields}
              />
            )}

            <CoreFields form={form} isSectorRequired={isSectorRequired} />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {isEditMode ? "Save changes" : "Add holding"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export interface AddHoldingButtonProps {
  containers: ContainerSummary[]
  lockedAccountId?: string
  label?: string
}

/**
 * Self-contained "Add holding" trigger: owns its own open state so a Server
 * Component page can render it without itself needing to be a Client
 * Component — same pattern as `AddAccountButton`.
 */
export function AddHoldingButton({
  containers,
  lockedAccountId,
  label = "Add holding",
}: AddHoldingButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <PlusIcon />
        {label}
      </Button>
      <HoldingFormDialog
        containers={containers}
        lockedAccountId={lockedAccountId}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}
