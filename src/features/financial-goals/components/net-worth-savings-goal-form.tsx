"use client"

/**
 * NetWorthSavingsGoalFormDialog — create/edit form for a
 * `NET_WORTH_SAVINGS_TARGET` Financial Goal (financial-goals.md's Type 2),
 * plus `AddNetWorthSavingsGoalButton`. Mirrors `debt-payoff-goal-form.tsx`'s
 * structure (RHF + zodResolver for the simple scalar fields, a separate
 * `useState` for the one field that isn't a plain text/number input).
 *
 * Unlike Debt Payoff, every field here is editable at any time (AC3,
 * including the measurement basis and its Account subset — Edge Cases:
 * "editable at any time; recalculates live at the next read using the newly
 * selected subset"), so this dialog renders the exact same fields in both
 * create and edit mode.
 *
 * `accountIds` (the Account-subset picker) is a plain `useState<string[]>`,
 * not an RHF field — there is no existing multi-select/checkbox-group
 * component in `components/ui` to bind a `Controller` to, so the picker
 * itself (`./account-subset-picker.tsx`, split out purely for this file's
 * own line-count budget) composes the existing `DropdownMenu` +
 * `DropdownMenuCheckboxItem` primitives directly (per this role's "assemble
 * using existing components" scope; no new reusable component is
 * introduced, this is feature-specific composition the same way
 * `link-account-dialog.tsx`'s single-account `Select` is).
 */

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import type { Account } from "@/features/accounts/types"
import type {
  FinancialGoalWithProgress,
  MeasurementBasis,
} from "@/features/financial-goals/types"
import {
  createFinancialGoal,
  updateFinancialGoal,
} from "@/features/financial-goals/server/actions"
import { AccountSubsetPicker } from "@/features/financial-goals/components/account-subset-picker"
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

const FormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(MAX_NAME_LENGTH, `Name must be ${MAX_NAME_LENGTH} characters or fewer`),
  targetAmount: z
    .string()
    .trim()
    .refine((value) => value !== "" && Number.isFinite(Number(value)), {
      message: "Target amount must be a number",
    })
    .refine((value) => Number(value) > 0, {
      message: "Target amount must be greater than 0",
    }),
})
type FormValues = z.infer<typeof FormSchema>

function defaultValuesFor(goal?: FinancialGoalWithProgress): FormValues {
  return {
    name: goal?.name ?? "",
    targetAmount: goal?.targetAmount !== undefined && goal?.targetAmount !== null
      ? String(goal.targetAmount)
      : "",
  }
}

/** Account ids already selected for this goal, narrowed to accounts still
 * available to pick from — an account removed from `accounts` (archived
 * since the goal was created) has no checkbox to show/toggle, so it's
 * dropped from the editable selection rather than silently resubmitted as an
 * id the server would reject (`updateFinancialGoal` only accepts the
 * caller's current non-archived accounts, per `server/actions.ts`). */
function resolveInitialAccountIds(
  goal: FinancialGoalWithProgress | undefined,
  accounts: Account[],
): string[] {
  if (!goal) return []
  const availableIds = new Set(accounts.map((account) => account.id))
  return goal.accountIds.filter((id) => availableIds.has(id))
}

export interface NetWorthSavingsGoalFormDialogProps {
  /** Omit for create mode; pass the goal being edited for edit mode. */
  goal?: FinancialGoalWithProgress
  /** Non-archived accounts selectable for the `ACCOUNT_SUBSET` basis (both
   * create and edit mode — unlike Debt Payoff, this field is always live). */
  accounts: Account[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NetWorthSavingsGoalFormDialog({
  goal,
  accounts,
  open,
  onOpenChange,
}: NetWorthSavingsGoalFormDialogProps) {
  const router = useRouter()
  const isEditMode = goal !== undefined

  const [measurementBasis, setMeasurementBasis] = useState<MeasurementBasis>(
    goal?.measurementBasis ?? "TOTAL_NET_WORTH",
  )
  const [accountIds, setAccountIds] = useState<string[]>(() =>
    resolveInitialAccountIds(goal, accounts),
  )

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: defaultValuesFor(goal),
  })

  useEffect(() => {
    if (open) {
      form.reset(defaultValuesFor(goal))
      setMeasurementBasis(goal?.measurementBasis ?? "TOTAL_NET_WORTH")
      setAccountIds(resolveInitialAccountIds(goal, accounts))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, goal])

  function toggleAccount(accountId: string, checked: boolean) {
    setAccountIds((prev) =>
      checked ? [...prev, accountId] : prev.filter((id) => id !== accountId),
    )
  }

  async function onSubmit(values: FormValues) {
    if (measurementBasis === "ACCOUNT_SUBSET" && accountIds.length === 0) {
      toast.error("Select at least one account for the account subset")
      return
    }

    const targetAmount = Number(values.targetAmount)
    const sharedFields = {
      name: values.name,
      targetAmount,
      measurementBasis,
      accountIds: measurementBasis === "ACCOUNT_SUBSET" ? accountIds : undefined,
    }

    const result = isEditMode
      ? await updateFinancialGoal({ id: goal.id, ...sharedFields })
      : await createFinancialGoal({ type: "NET_WORTH_SAVINGS_TARGET", ...sharedFields })

    if (!result.success) {
      toast.error(result.error)
      return
    }

    toast.success(isEditMode ? "Goal updated" : "Goal created")
    onOpenChange(false)
    // Re-runs the Server Component page's getFinancialGoals() calls — see
    // app/(dashboard)/financial-goals/page.tsx.
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? "Edit net worth / savings target" : "Set a net worth / savings target"}
          </DialogTitle>
          <DialogDescription>
            Watch your Total Net Worth, or a subset of your own accounts, move
            toward a dollar target — nothing is logged manually.
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
                    <Input placeholder="House down payment" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="targetAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Target amount</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">
                Measure against
              </span>
              <Select
                value={measurementBasis}
                onValueChange={(value) => setMeasurementBasis(value as MeasurementBasis)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TOTAL_NET_WORTH">Total Net Worth</SelectItem>
                  <SelectItem value="ACCOUNT_SUBSET">Selected accounts</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {measurementBasis === "ACCOUNT_SUBSET" && (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">Accounts</span>
                <AccountSubsetPicker
                  accounts={accounts}
                  selectedIds={accountIds}
                  onToggle={toggleAccount}
                />
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
                  (measurementBasis === "ACCOUNT_SUBSET" && accounts.length === 0)
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

export interface AddNetWorthSavingsGoalButtonProps {
  accounts: Account[]
  /** Override the trigger label, e.g. for the zero-goals empty state. */
  label?: string
}

/**
 * Self-contained "Set a net worth / savings target" trigger: owns its own
 * open state so app/(dashboard)/financial-goals/page.tsx (a Server
 * Component) can render it without itself needing to be a Client Component.
 */
export function AddNetWorthSavingsGoalButton({
  accounts,
  label = "Set a net worth / savings target",
}: AddNetWorthSavingsGoalButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <PlusIcon />
        {label}
      </Button>
      <NetWorthSavingsGoalFormDialog accounts={accounts} open={open} onOpenChange={setOpen} />
    </>
  )
}
