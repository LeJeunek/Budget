-- Phase 4c: Calendar v2, Customization, Admin
-- (docs/architecture/phase-4c-technical-design.md, Database Architect's
-- schema pass). Calendar v2 has no schema footprint of its own (a pure
-- composition layer over Bills'/Recurring Income's existing read functions,
-- §2) — this migration covers the admin-authorization mechanism (§1),
-- Customization's per-user preferences (§3), the DB-backed
-- system-category-template model (§4), Reports' new generation-event log
-- (§5), and the feature-flag/admin-action-log primitives (§6).

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('MONTHLY', 'YEARLY', 'TAX_SUMMARY', 'INCOME', 'EXPENSE', 'CASH_FLOW');

-- CreateEnum
CREATE TYPE "AdminActionType" AS ENUM ('FEATURE_FLAG_TOGGLED', 'CATEGORY_TEMPLATE_CHANGED', 'DEMO_DATA_SEEDED');

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'USER';

-- CreateTable
CREATE TABLE "user_preference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accentColor" TEXT,
    "currencyDisplay" TEXT NOT NULL DEFAULT 'USD',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "timezoneConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_card_preference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cardKey" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboard_card_preference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_category_template" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_category_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_generation_event" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ReportType" NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_generation_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flag" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT,

    CONSTRAINT "feature_flag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_action_log" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT,
    "action" "AdminActionType" NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_action_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_preference_userId_key" ON "user_preference"("userId");

-- CreateIndex
CREATE INDEX "dashboard_card_preference_userId_order_idx" ON "dashboard_card_preference"("userId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_card_preference_userId_cardKey_key" ON "dashboard_card_preference"("userId", "cardKey");

-- CreateIndex
CREATE UNIQUE INDEX "system_category_template_name_key" ON "system_category_template"("name");

-- CreateIndex
CREATE INDEX "report_generation_event_userId_idx" ON "report_generation_event"("userId");

-- CreateIndex
CREATE INDEX "report_generation_event_type_idx" ON "report_generation_event"("type");

-- CreateIndex
CREATE INDEX "report_generation_event_generatedAt_idx" ON "report_generation_event"("generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flag_key_key" ON "feature_flag"("key");

-- CreateIndex
CREATE INDEX "admin_action_log_action_idx" ON "admin_action_log"("action");

-- CreateIndex
CREATE INDEX "admin_action_log_createdAt_idx" ON "admin_action_log"("createdAt");

-- AddForeignKey
ALTER TABLE "user_preference" ADD CONSTRAINT "user_preference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_card_preference" ADD CONSTRAINT "dashboard_card_preference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_generation_event" ADD CONSTRAINT "report_generation_event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_flag" ADD CONSTRAINT "feature_flag_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_action_log" ADD CONSTRAINT "admin_action_log_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DataMigration: one-time seed for "system_category_template"
-- (phase-4c-technical-design.md §4.3, risk-register.md #35, required, not
-- optional). Seeded here, in the SAME migration that creates the table,
-- BEFORE `lib/auth.ts`'s signup hook is switched over to read from this
-- table instead of `DEFAULT_CATEGORIES`
-- (src/features/categories/default-categories.ts) — this is what guarantees
-- zero behavior change for the very next signup after deploy. Exactly
-- today's eleven `DEFAULT_CATEGORIES` entries, in their current array order
-- (order: 0..10) — getting this order wrong would change new-signup behavior
-- on day one, the exact regression AC7's non-retroactivity guarantee is meant
-- to prevent. IDs are hand-assigned readable literals (this table has no
-- application write path yet at migration time to generate a cuid()
-- through), never referenced by ID anywhere else — only `name` is a
-- meaningful lookup key for this table's consumers
-- (features/categories/server/template.ts).
INSERT INTO "system_category_template" ("id", "name", "color", "order", "createdAt", "updatedAt") VALUES
    ('sctpl_housing',        'Housing',        '#f97316', 0,  NOW(), NOW()),
    ('sctpl_utilities',      'Utilities',      '#eab308', 1,  NOW(), NOW()),
    ('sctpl_transportation', 'Transportation', '#84cc16', 2,  NOW(), NOW()),
    ('sctpl_food',           'Food',           '#22c55e', 3,  NOW(), NOW()),
    ('sctpl_entertainment',  'Entertainment',  '#06b6d4', 4,  NOW(), NOW()),
    ('sctpl_shopping',       'Shopping',       '#6366f1', 5,  NOW(), NOW()),
    ('sctpl_healthcare',     'Healthcare',     '#a855f7', 6,  NOW(), NOW()),
    ('sctpl_insurance',      'Insurance',      '#ec4899', 7,  NOW(), NOW()),
    ('sctpl_investments',    'Investments',    '#14b8a6', 8,  NOW(), NOW()),
    ('sctpl_savings',        'Savings',        '#0ea5e9', 9,  NOW(), NOW()),
    ('sctpl_misc',           'Misc',           '#94a3b8', 10, NOW(), NOW());

-- DataMigration: one-time seed for "feature_flag"
-- (phase-4c-technical-design.md §6.1, Feature Flags AC2, required, not
-- optional). Exactly the two initial flags this phase's Admin capability
-- needs, both enabled: true (the "no behavior change on deploy" default —
-- AI features and outbound email both keep working exactly as they do today
-- until an admin explicitly disables one). `updatedByUserId` is left NULL —
-- these rows were never toggled by any admin, they were deploy-time seed
-- data, the same "no admin actor to attribute" case
-- `lib/feature-flags.ts`'s own `isFeatureEnabled` fail-open contract
-- (risk-register.md #34) already treats as ordinary, not exceptional.
INSERT INTO "feature_flag" ("id", "key", "enabled", "updatedAt", "updatedByUserId") VALUES
    ('ffk_ai_features',    'AI_FEATURES',    true, NOW(), NULL),
    ('ffk_email_delivery', 'EMAIL_DELIVERY', true, NOW(), NULL);
