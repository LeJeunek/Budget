"use client"

/**
 * DebtFormDialog — a single form used for both creating and editing a debt
 * (docs/product/debt-tracker.md AC1/AC3), plus AddDebtButton, a small trigger
 * that opens it in create mode. One component pair instead of two
 * near-duplicate forms, per the company's "avoid duplication" rule — same
 * structure as `features/accounts/components/account-form.tsx`.
 *
 * `type` is immutable after creation (matching `UpdateDebtSchema`'s deliberate
 * omission of that field — see its JSDoc) — the Select is disabled in edit
 * mode rather than hidden, so the current type stays visible.
 *
 * `balance` is disabled in edit mode whenever the debt is linked to an
 * Account (`accountId` set): per `server/service.ts`'s `toDebtWithProjection`
 * doc, the raw `Debt.balance` column is stale/unused while linked — the true
 * balance is read live from the linked Account instead, so editing this field
 * would have no visible effect. An inline note explains this and points the
 * user at Unlink (see `link-account-dialog.tsx`) if they want to enter a
 * balance manually again.
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

import type { DebtWithProjection } from "@/features/debt/types"
import { createDebt, updateDebt } from "@/features/debt/server/actions"
import {
  DEBT_TYPE_LABELS,
  DEBT_TYPE_VALUES,
  DebtFormSchema,
  defaultValuesFor,
  type DebtFormFields,
} from "@/features/debt/components/debt-form-schema"
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"

export interface DebtFormDialogProps {
  /** Omit for create mode; pass the debt being edited for edit mode. */
  debt?: DebtWithProjection
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DebtFormDialog({ debt, open, onOpenChange }: DebtFormDialogProps) {
  const router = useRouter()
  const isEditMode = debt !== undefined
  const isLinked = isEditMode && debt.accountId !== null

  const form = useForm<DebtFormFields>({
    resolver: zodResolver(DebtFormSchema),
    defaultValues: defaultValuesFor(debt),
  })

  // Re-syncs the form whenever the dialog opens (create vs. edit, or a
  // different debt entirely) instead of once on mount — the same
  // DebtFormDialog instance is reused across every DebtCard's Edit action,
  // so stale values from a previous open must not leak in.
  useEffect(() => {
    if (open) {
      form.reset(defaultValuesFor(debt))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, debt])

  async function onSubmit(values: DebtFormFields) {
    const interestRate = Number(values.interestRate)
    const minimumPayment = Number(values.minimumPayment)

    if (isEditMode) {
      const result = await updateDebt({
        id: debt.id,
        name: values.name,
        // Omitted entirely (not sent as 0) while linked — see this file's
        // JSDoc: the raw balance column is unused in that state, so there is
        // nothing meaningful to patch.
        ...(isLinked ? {} : { balance: Number(values.balance) }),
        interestRate,
        minimumPayment,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Debt updated")
      onOpenChange(false)
      router.refresh()
      return
    }

    const result = await createDebt({
      name: values.name,
      type: values.type,
      balance: Number(values.balance),
      interestRate,
      minimumPayment,
    })

    if (!result.success) {
      toast.error(result.error)
      return
    }

    toast.success("Debt added")
    onOpenChange(false)
    // Re-runs the Server Component page's getDebts() calls — see
    // app/(dashboard)/debt/page.tsx.
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit debt" : "Add debt"}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Update this debt's details. Payoff projections recalculate immediately."
              : "Track a credit card, loan, or mortgage to see its payoff date and total interest."}
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
                    <Input placeholder="Chase Sapphire" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isEditMode}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {DEBT_TYPE_VALUES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {DEBT_TYPE_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {isEditMode && (
                    <FormDescription>
                      Type can&apos;t be changed after creation — archive and
                      re-add if you picked the wrong one.
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="balance"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Balance</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" disabled={isLinked} {...field} />
                  </FormControl>
                  {isLinked && (
                    <FormDescription>
                      This balance is synced from the linked account. Unlink
                      it (see the debt&apos;s Actions menu) to enter a balance
                      manually.
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="interestRate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Interest rate / APR (%)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="19.99" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="minimumPayment"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Minimum monthly payment</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="35" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {isEditMode ? "Save changes" : "Add debt"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export interface AddDebtButtonProps {
  /** Override the trigger label, e.g. for the zero-debts empty state. */
  label?: string
}

/**
 * Self-contained "Add debt" trigger: owns its own open state so
 * app/(dashboard)/debt/page.tsx (a Server Component) can render it without
 * itself needing to be a Client Component — same pattern as
 * `AddAccountButton`.
 */
export function AddDebtButton({ label = "Add debt" }: AddDebtButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <PlusIcon />
        {label}
      </Button>
      <DebtFormDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
