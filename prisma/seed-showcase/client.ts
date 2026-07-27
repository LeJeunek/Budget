// A single shared PrismaClient instance for every module in this directory —
// mirrors prisma/seed.ts's own top-level `const prisma = new PrismaClient()`,
// just factored out so every helper module can import the same connection
// instead of each opening its own pool.
import { PrismaClient } from "@prisma/client"

export const prisma = new PrismaClient()

/** Name -> Category row lookup for the authenticated user's fixed 11-category
 * starter set (seeded by src/lib/auth.ts's signup hook, not by this script —
 * see user.ts). Every other module that needs to categorize a transaction or
 * budget allocation calls this once and indexes into the result by name,
 * rather than re-querying per transaction. */
export async function getCategoryMap(userId: string): Promise<Record<string, string>> {
  const categories = await prisma.category.findMany({
    where: { userId },
    select: { id: true, name: true },
  })

  return Object.fromEntries(categories.map((category) => [category.name, category.id]))
}
