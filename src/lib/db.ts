import { PrismaClient } from "@prisma/client"

// Standard Next.js dev-mode singleton: without this, hot-reloading recreates
// the PrismaClient on every edit and exhausts Postgres connections.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db
}
