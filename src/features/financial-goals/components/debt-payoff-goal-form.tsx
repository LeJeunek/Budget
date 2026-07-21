"use client"

/**
 * DebtPayoffGoalFormDialog — create/edit form for a `DEBT_PAYOFF` Financial
 * Goal (financial-goals.md's Type 1), plus `AddDebtPayoffGoalButton`, a
 * self-contained trigger that opens it in create mode. Mirrors
 * `features/debt/components/debt-form.tsx`'s `DebtFormDialog`/`AddDebtButton`
 * pair exactly.
 *
 * **Type/link is fixed at creation (AC1/AC3):** unlike `DebtFormDialog` (which
 * disables its immutable `type` Select but still shows it), this dialog does
 * not render the debt picker at all in edit mode — `server/actions.ts`'s
 * `updateFinancialGoal` rejects any field but `name` for a `DEBT_PAYOFF` goal
 * (there is no update path for `linkedDebtId`/`startingBalance` whatsoever,
 * per `validation.ts`'s own `UpdateFinancialGoalSchema` JSDoc), so a disabled-
 * but-visible Select would imply an editability that doesn't exist. Edit mode
 * instead shows the already-linked debt's name as plain, non-interactive
 * text (`linkedDebtName`, resolved by the caller — `FinancialGoalWithProgress`
 * itself carries no debt name, only `linkedDebtId`/`currentEffectiveBalance`).
 *
 * The debt picker's `name` field uses React Hook Form + zodResolver (this
 * feature's only validated field in this form); `linkedDebtId` is a plain
 * `useState` selection instead of an RHF field — it doesn't exist at all in
 * edit mode, and a single required-string schema field can't cleanly express
 * "required in create mode, absent in edit mode" without two schemas, so a
 * lightweight manual check before submit (mirroring
 * `link-account-dialog.tsx`'s identical pattern for its own single-select
 * field) is simpler and no less correct.
 */

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import type { DebtWithProjection } from "@/features/debt/types"
import type { FinancialGoalWithProgress } from "@/features/financial-goals/types"
import {
  createFinancialGoal,
  updateFinancialGoal,
} from "@/features/financial-goals/server/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"

const MAX_NAME_LENGTH = 120

const NameFieldSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(MAX_NAME_LENGTH, `Name must be ${MAX_NAME_LENGTH} characters or fewer`),
})
type NameFieldValues = z.infer<typeof NameFieldSchema>

export interface DebtPayoffGoalFormDialogProps {
  /** Omit for create mode; pass the goal being edited for edit mode. */
  goal?: FinancialGoalWithProgress
  /** Create mode only: debts eligible to start tracking — active, not
   * already Paid Off, and not already tracked by another active Debt Payoff
   * goal (computed by the caller, `app/(dashboard)/financial-goals/page.tsx`,
   * the same "join two already-fetched lists" pattern
   * `app/(dashboard)/debt/page.tsx` uses for its own `eligibleAccounts`).
   * Ignored (and safe to omit — defaults to `[]`) in edit mode. */
  eligibleDebts?: DebtWithProjection[]
  /** Edit mode only: the already-linked debt's display name (see this file's
   * JSDoc for why this isn't part of `FinancialGoalWithProgress` itself).
   * Ignored in create mode. */
  linkedDebtName?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DebtPayoffGoalFormDialog({
  goal,
  eligibleDebts = [],
  linkedDebtName,
  open,
  onOpenChange,
}: DebtPayoffGoalFormDialogProps) {
  const router = useRouter()
  const isEditMode = goal !== undefined
  const [linkedDebtId, setLinkedDebtId] = useState("")

  const form = useForm<NameFieldValues>({
    resolver: zodResolver(NameFieldSchema),
    defaultValues: { name: goal?.name ?? "" },
  })

  // Re-syncs whenever the dialog opens — the same DebtPayoffGoalFormDialog
  // instance is reused across every card's Edit action (and the page-level
  // "Add" trigger), so stale values from a previous open must not leak in.
  useEffect(() => {
    if (open) {
      form.reset({ name: goal?.name ?? "" })
      setLinkedDebtId("")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, goal])

  async function onSubmit(values: NameFieldValues) {
    if (isEditMode) {
      const result = await updateFinancialGoal({ id: goal.id, name: values.name })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Goal updated")
      onOpenChange(false)
      router.refresh()
      return
    }

    if (!linkedDebtId) {
      toast.error("Select a debt to track")
      return
    }

    const result = await createFinancialGoal({
      type: "DEBT_PAYOFF",
      name: values.name,
      linkedDebtId,
    })
    if (!result.success) {
      toast.error(result.error)
      return
    }

    toast.success("Goal created")
    onOpenChange(false)
    // Re-runs the Server Component page's getFinancialGoals() calls — see
    // app/(dashboard)/financial-goals/page.tsx.
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit debt payoff goal" : "Track a debt payoff"}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "You can rename this goal. Which debt it tracks is fixed — archive it and create a new one to track a different debt."
              : "Pick an existing debt from Debt Tracker to watch its balance reach $0. No new debt data is entered here."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Pay off the car loan" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {isEditMode ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">Tracking</span>
                <span className="text-sm text-muted-foreground">
                  {linkedDebtName ?? "This debt"} &mdash; not editable after creation.
                </span>
              </div>
            ) : eligibleDebts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No eligible debts. A debt must be active, not already Paid Off,
                and not already tracked by another active Debt Payoff goal.
                Add a debt on the Debt page first, or archive the goal already
                tracking it.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">Debt</span>
                <Select value={linkedDebtId} onValueChange={setLinkedDebtId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a debt" />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleDebts.map((debt) => (
                      <SelectItem key={debt.id} value={debt.id}>
                        {debt.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  form.formState.isSubmitting ||
                  (!isEditMode && eligibleDebts.length === 0)
                }
              >
                {isEditMode ? "Save changes" : "Create goal"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export interface AddDebtPayoffGoalButtonProps {
  eligibleDebts: DebtWithProjection[]
  /** Override the trigger label, e.g. for the zero-goals empty state. */
  label?: string
}

/**
 * Self-contained "Track a debt payoff" trigger: owns its own open state so
 * app/(dashboard)/financial-goals/page.tsx (a Server Component) can render it
 * without itself needing to be a Client Component — same pattern as
 * `AddDebtButton`/`AddGoalButton`.
 */
export function AddDebtPayoffGoalButton({
  eligibleDebts,
  label = "Track a debt payoff",
}: AddDebtPayoffGoalButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <PlusIcon />
        {label}
      </Button>
      <DebtPayoffGoalFormDialog
        eligibleDebts={eligibleDebts}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}
