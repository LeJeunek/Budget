"use client"

/**
 * Field groups shared by holding-form.tsx's create/edit modes, split into
 * their own module purely to keep holding-form.tsx (dialog shell + submit
 * wiring) under the company's ~300-line-per-file guideline — these are
 * private subcomponents of that one dialog, not a new `components/`
 * reusable primitive.
 */

import type { UseFormReturn } from "react-hook-form"

import type { ContainerSummary } from "@/features/investments/types"
import {
  ASSET_TYPE_LABELS,
  ASSET_TYPE_VALUES,
  CONTAINER_ACCOUNT_TYPE_LABELS,
  CONTAINER_ACCOUNT_TYPE_VALUES,
  SECTOR_LABELS,
  SECTOR_VALUES,
} from "./investment-labels"
import { NEW_CONTAINER_VALUE, type HoldingFormFields } from "./holding-form-schema"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"

export interface ContainerFieldsProps {
  form: UseFormReturn<HoldingFormFields>
  containers: ContainerSummary[]
  showNewContainerFields: boolean
}

/** AC1's "container select, or create one inline" pair — rendered only in
 * create mode when no `lockedAccountId` was supplied (see holding-form.tsx). */
export function ContainerFields({
  form,
  containers,
  showNewContainerFields,
}: ContainerFieldsProps) {
  return (
    <>
      <FormField
        control={form.control}
        name="containerSelection"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Container account</FormLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <FormControl>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a container" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {containers.map((container) => (
                  <SelectItem key={container.id} value={container.id}>
                    {container.name}
                  </SelectItem>
                ))}
                <SelectItem value={NEW_CONTAINER_VALUE}>
                  + Create a new account
                </SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      {showNewContainerFields && (
        <>
          <FormField
            control={form.control}
            name="newContainerName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New account name</FormLabel>
                <FormControl>
                  <Input placeholder="Fidelity 401k" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="newContainerType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New account type</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {CONTAINER_ACCOUNT_TYPE_VALUES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {CONTAINER_ACCOUNT_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </>
      )}
    </>
  )
}

export interface CoreFieldsProps {
  form: UseFormReturn<HoldingFormFields>
  isSectorRequired: boolean
}

/** The fields every holding has regardless of create/edit mode (AC2/AC3/AC4):
 * name, asset type, sector, cost basis, current value. */
export function CoreFields({ form, isSectorRequired }: CoreFieldsProps) {
  return (
    <>
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Name</FormLabel>
            <FormControl>
              <Input placeholder="Vanguard S&P 500 ETF" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="assetType"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Asset type</FormLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <FormControl>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select an asset type" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {ASSET_TYPE_VALUES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {ASSET_TYPE_LABELS[type]}
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
        name="sector"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Sector{!isSectorRequired && " (not applicable)"}</FormLabel>
            <Select
              value={field.value === "" ? "__none__" : field.value}
              onValueChange={(value) =>
                field.onChange(value === "__none__" ? "" : value)
              }
            >
              <FormControl>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a sector" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {!isSectorRequired && (
                  <SelectItem value="__none__">Not applicable</SelectItem>
                )}
                {SECTOR_VALUES.map((sector) => (
                  <SelectItem key={sector} value={sector}>
                    {SECTOR_LABELS[sector]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormDescription>
              Required for Stock, ETF, and Mutual Fund holdings.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="costBasis"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Cost basis</FormLabel>
            <FormControl>
              <Input type="number" step="0.01" min="0" {...field} />
            </FormControl>
            <FormDescription>
              The total amount originally invested in this holding.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="currentValue"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Current value</FormLabel>
            <FormControl>
              <Input type="number" step="0.01" min="0" {...field} />
            </FormControl>
            <FormDescription>
              Enter the current value manually — live pricing isn&apos;t
              supported yet.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  )
}
