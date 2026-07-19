"use client"

/**
 * AccountFormDialog — a single form used for both creating and editing an
 * account (docs/product/accounts.md AC1/AC3), plus AddAccountButton, a
 * small trigger that opens it in create mode. One component pair instead of
 * two near-duplicate forms, per the company's "avoid duplication" rule.
 *
 * Pattern match: React Hook Form + zodResolver + the shared `Form`
 * primitives, calling a Server Action directly and branching on its
 * `ApiResult`, exactly like app/(auth)/login/page.tsx. The validation
 * schema itself lives in ./account-form-schema.ts — split out to keep this
 * file (rendering + submit wiring) under the company's file-size guideline.
 *
 * Controlled `open`/`onOpenChange` (rather than a built-in `DialogTrigger`)
 * because this dialog is opened from two different places — a header
 * "Add Account" button and each AccountCard's "Edit" menu item — and the
 * latter needs to close its own dropdown menu first, which is simplest with
 * the parent owning the open state (see account-card.tsx).
 */

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"

import type { Account } from "@/features/accounts/types"
import {
  createAccount,
  updateAccount,
} from "@/features/accounts/server/actions"
import { ACCOUNT_TYPE_LABELS } from "@/features/accounts/components/account-card"
import {
  ACCOUNT_TYPE_VALUES,
  AccountFormSchema,
  INTEREST_BEARING_TYPES,
  defaultValuesFor,
  type AccountFormFields,
} from "@/features/accounts/components/account-form-schema"
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

// A small, deliberately non-exhaustive set of preset swatches — per the
// Frontend Lead scope, a full color-picker primitive isn't built here, just
// enough presets plus a native `<input type="color">` for anything else.
const PRESET_COLORS = [
  "#6366f1", // indigo (default)
  "#0ea5e9", // sky
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#a855f7", // purple
  "#ec4899", // pink
  "#64748b", // slate
]

export interface AccountFormDialogProps {
  /** Omit for create mode; pass the account being edited for edit mode. */
  account?: Account
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AccountFormDialog({
  account,
  open,
  onOpenChange,
}: AccountFormDialogProps) {
  const router = useRouter()
  const isEditMode = account !== undefined

  const form = useForm<AccountFormFields>({
    resolver: zodResolver(AccountFormSchema),
    defaultValues: defaultValuesFor(account),
  })

  // Re-syncs the form whenever the dialog opens (create vs. edit, or a
  // different account entirely) instead of once on mount — the same
  // AccountFormDialog instance is reused across every AccountCard's Edit
  // action, so stale values from a previous open must not leak in.
  useEffect(() => {
    if (open) {
      form.reset(defaultValuesFor(account))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, account])

  const selectedType = form.watch("type")
  const isInterestBearing = INTEREST_BEARING_TYPES.has(selectedType)
  const isUserReportedBalance =
    selectedType === "INVESTMENT" ||
    selectedType === "RETIREMENT" ||
    selectedType === "CRYPTO"

  async function onSubmit(values: AccountFormFields) {
    const institution = values.institution ? values.institution : undefined
    // AccountFormSchema validates balance/interestRate as well-formed
    // number strings (see numericStringField/interestRateFieldSchema above)
    // but doesn't convert them — Number(...) here is safe precisely because
    // validation already guaranteed each is parseable.
    const balance = Number(values.balance)
    const interestRate = values.interestRate ? Number(values.interestRate) : undefined
    // See UpdateAccountSchema's JSDoc: on edit, `interestRate: null`
    // explicitly clears a stale rate (e.g. after changing the type away
    // from an interest-bearing one). CreateAccountSchema has no `.nullable()`
    // though, so create must send `undefined` (omit), never `null`.
    const result = isEditMode
      ? await updateAccount({
          id: account.id,
          name: values.name,
          type: values.type,
          institution,
          balance,
          interestRate: isInterestBearing ? (interestRate ?? null) : null,
          color: values.color,
        })
      : await createAccount({
          name: values.name,
          type: values.type,
          institution,
          balance,
          interestRate: isInterestBearing ? interestRate : undefined,
          color: values.color,
        })

    if (!result.success) {
      toast.error(result.error)
      return
    }

    toast.success(isEditMode ? "Account updated" : "Account created")
    onOpenChange(false)
    // Re-runs the Server Component page's getAccounts() call — see
    // app/(dashboard)/accounts/page.tsx.
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit account" : "Add account"}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Update this account's details."
              : "Add a financial account to start tracking it in FinanceOS."}
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
                    <Input placeholder="Chase Checking" {...field} />
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
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ACCOUNT_TYPE_VALUES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {ACCOUNT_TYPE_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="institution"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Institution</FormLabel>
                  <FormControl>
                    <Input placeholder="Chase (optional)" {...field} />
                  </FormControl>
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
                    <Input type="number" step="0.01" {...field} />
                  </FormControl>
                  {isUserReportedBalance && (
                    <FormDescription>
                      Enter the current value manually — live pricing isn&apos;t
                      supported yet.
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {isInterestBearing && (
              <FormField
                control={form.control}
                name="interestRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Interest rate (%)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="4.25"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Color</FormLabel>
                  <div className="flex items-center gap-2">
                    <FormControl>
                      <Input
                        type="color"
                        className="h-8 w-14 p-1"
                        {...field}
                      />
                    </FormControl>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {PRESET_COLORS.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          aria-label={`Use color ${hex}`}
                          onClick={() =>
                            form.setValue("color", hex, {
                              shouldDirty: true,
                              shouldValidate: true,
                            })
                          }
                          className="size-5 rounded-full ring-1 ring-foreground/10 transition-transform hover:scale-110"
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </div>
                  </div>
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
                {isEditMode ? "Save changes" : "Add account"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export interface AddAccountButtonProps {
  /** Override the trigger label, e.g. for the zero-accounts empty state. */
  label?: string
}

/**
 * Self-contained "Add Account" trigger: owns its own open state so
 * app/(dashboard)/accounts/page.tsx (a Server Component) can render it
 * without itself needing to be a Client Component.
 */
export function AddAccountButton({
  label = "Add account",
}: AddAccountButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <PlusIcon />
        {label}
      </Button>
      <AccountFormDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
