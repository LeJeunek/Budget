import { notFound, redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/auth"
import { getStreamById } from "@/features/recurring-income/server/service"

import { IncomeStreamDetailClient } from "./income-stream-detail-client"

/**
 * Income stream detail page (recurring-income.md AC5/AC6: edit/archive;
 * AC12: receipt history) — per docs/architecture/folder-tree.md's Phase 3a
 * tree.
 *
 * Next.js 15's dynamic route `params` prop is a Promise (must be awaited) —
 * see https://nextjs.org/docs/app/api-reference/file-conventions/page.
 *
 * `getStreamById` returns `null` for both "doesn't exist" and "belongs to
 * another user" (see that function's JSDoc — deliberately not
 * distinguishable, same "don't leak existence" rule `getBillById` follows)
 * — either case renders Next.js's standard `notFound()` page.
 */
export default async function IncomeStreamDetailPage({
  params,
}: {
  params: Promise<{ streamId: string }>
}) {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/login")
  }

  const { streamId } = await params
  const stream = await getStreamById(user.id, streamId)

  if (!stream) {
    notFound()
  }

  return <IncomeStreamDetailClient stream={stream} />
}
