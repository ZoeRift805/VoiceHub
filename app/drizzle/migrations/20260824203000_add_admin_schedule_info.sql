ALTER TABLE "SystemSettings" ADD COLUMN IF NOT EXISTS "showAdminSchedulePlatform" boolean NOT NULL DEFAULT true;
UPDATE "SystemSettings" SET "showAdminSchedulePlatform" = true WHERE "showAdminSchedulePlatform" IS DISTINCT FROM true;
