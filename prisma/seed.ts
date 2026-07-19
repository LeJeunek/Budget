// FinanceOS — dev/demo seed data.
// Run via `npx prisma db seed` (configured in package.json by whoever wires up
// tooling in Phase 0). Creates one demo user with the Charter's fixed
// 11-category starter set plus a couple of accounts so the dashboard has
// something to render during Phase 1 development.
//
// DEFAULT_CATEGORIES lives in src/features/categories/default-categories.ts
// (not defined here) so src/lib/auth.ts's real signup hook can import it
// too, without pulling in this file's top-level `main()` side effects (this
// file runs main() unconditionally at import time — importing it from
// application/runtime code, not just other scripts, would re-run the demo
// seed on every server start).

import { PrismaClient, AccountType } from "@prisma/client";
import { DEFAULT_CATEGORIES } from "../src/features/categories/default-categories";

const prisma = new PrismaClient();

async function main() {
  const demoUser = await prisma.user.upsert({
    where: { email: "demo@financeos.local" },
    update: {},
    create: {
      email: "demo@financeos.local",
      name: "Demo User",
      emailVerified: true,
    },
  });

  await Promise.all(
    DEFAULT_CATEGORIES.map((category) =>
      prisma.category.upsert({
        where: { userId_name: { userId: demoUser.id, name: category.name } },
        update: {},
        create: { ...category, userId: demoUser.id, isSystem: true },
      })
    )
  );

  const checking = await prisma.account.create({
    data: {
      userId: demoUser.id,
      name: "Everyday Checking",
      type: AccountType.CHECKING,
      institution: "Demo Bank",
      balance: 4250.32,
      color: "#6366f1",
    },
  });

  await prisma.account.create({
    data: {
      userId: demoUser.id,
      name: "High-Yield Savings",
      type: AccountType.SAVINGS,
      institution: "Demo Bank",
      balance: 12800.0,
      interestRate: 4.25,
      color: "#0ea5e9",
    },
  });

  const diningCategory = await prisma.category.findFirstOrThrow({
    where: { userId: demoUser.id, name: "Food" },
  });

  await prisma.transaction.create({
    data: {
      userId: demoUser.id,
      accountId: checking.id,
      categoryId: diningCategory.id,
      merchant: "Demo Coffee Shop",
      amount: -6.5,
      date: new Date(),
    },
  });

  console.log(`Seeded demo user: ${demoUser.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
