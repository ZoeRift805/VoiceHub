ALTER TABLE "SystemSettings" ADD COLUMN "webPushEnabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "SystemSettings" ADD COLUMN "webPushPublicKey" text;
--> statement-breakpoint
ALTER TABLE "SystemSettings" ADD COLUMN "webPushPrivateKey" text;
--> statement-breakpoint
ALTER TABLE "SystemSettings" ADD COLUMN "webPushSubject" text;
--> statement-breakpoint
ALTER TABLE "SystemSettings" ADD COLUMN "webPushCronSecret" text;
--> statement-breakpoint
ALTER TABLE "SystemSettings" ADD COLUMN "webPushReminderMinutes" integer DEFAULT 10 NOT NULL;
