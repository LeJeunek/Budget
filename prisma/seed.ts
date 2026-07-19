// FinanceOS — dev/demo seed data.
// Run via `npx prisma db seed` (configured in package.json by whoever wires up
// tooling in Phase 0). Creates one demo user with the Charter's fixed
// 11-category starter set plus a couple of accounts so the dashboard has
// something to render during Phase 1 development.
//
// The 11 system categories are also the exact list every *real* new user
// should get at signup — DEFAULT_CATEGORIES is exported so the Backend
// Engineer's signup flow (features/accounts or an auth hook) can reuse it
// instead of duplicating the list. Do not hardcode this list a second time.

import { PrismaClient, AccountType } from "@prisma/client";

const prisma = new PrismaClient();

export const DEFAULT_CATEGORIES: { name: string; color: string }[] = [
  { name: "Housing", color: "#f97316" },
  { name: "Utilities", color: "#eab308" },
  { name: "Transportation", color: "#84cc16" },
  { name: "Food", color: "#22c55e" },
  { name: "Entertainment", color: "#06b6d4" },
  { name: "Shopping", color: "#6366f1" },
  { name: "Healthcare", color: "#a855f7" },
  { name: "Insurance", color: "#ec4899" },
  { name: "Investments", color: "#14b8a6" },
  { name: "Savings", color: "#0ea5e9" },
  { name: "Misc", color: "#94a3b8" },
];

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
