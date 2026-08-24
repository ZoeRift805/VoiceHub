ALTER TABLE "SystemSettings" ADD COLUMN IF NOT EXISTS "showAdminSchedulePlatform" boolean NOT NULL DEFAULT false;
ALTER TABLE "SystemSettings" ADD COLUMN IF NOT EXISTS "showAdminScheduleUserStats" boolean NOT NULL DEFAULT false;
