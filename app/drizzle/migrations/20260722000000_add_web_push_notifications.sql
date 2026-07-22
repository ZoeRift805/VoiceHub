ALTER TABLE "NotificationSettings" ADD COLUMN "songRejectedEnabled" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "NotificationSettings" ADD COLUMN "collaborationEnabled" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "NotificationSettings" ADD COLUMN "broadcastReminderEnabled" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "NotificationSettings" ADD COLUMN "webPushEnabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "Schedule" ADD COLUMN "reminderSentAt" timestamp;
--> statement-breakpoint
CREATE TABLE "PushSubscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" integer NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"userAgent" text,
	"failureCount" integer DEFAULT 0 NOT NULL,
	"lastSuccessAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "PushSubscription_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "push_subscription_user_id_idx" ON "PushSubscription" USING btree ("userId");
