import { notFound, redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/auth"
import { getCategories } from "@/features/categories/server/service"
import { getBillById } from "@/features/bills/server/service"

import { BillDetailClient } from "./bill-detail-client"

/**
 * Bill detail page (bills.md AC10: payment history; AC4/AC5: edit/archive) —
 * per docs/architecture/folder-tree.md's Phase 2 tree.
 *
 * Next.js 15's dynamic route `params` prop is a Promise (must be awaited)
 * — see https://nextjs.org/docs/app/api-reference/file-conventions/page.
 *
 * `getBillById` returns `null` for both "doesn't exist" and "belongs to
 * another user" (see that function's JSDoc — deliberately not
 * distinguishable, per the same "don't leak existence" rule
 * `getAccountById` follows) — either case renders Next.js's standard
 * `notFound()` page.
 */
export default async function BillDetailPage({
  params,
}: {
  params: Promise<{ billId: string }>
}) {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/login")
  }

  const { billId } = await params
  const [bill, categories] = await Promise.all([
    getBillById(user.id, billId),
    getCategories(user.id),
  ])

  if (!bill) {
    notFound()
  }

  return <BillDetailClient bill={bill} categories={categories} />
}
