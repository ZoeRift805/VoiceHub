import { eq } from 'drizzle-orm'
import { db } from '~/drizzle/db'
import { notificationSettings, pushSubscriptions } from '~/drizzle/schema'
import { isWebPushConfigured } from '~~/server/services/webPushService'

export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) throw createError({ statusCode: 401, message: '需要登录才能查看推送状态' })

  const [subscriptions, settings] = await Promise.all([
    db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, user.id)),
    db
      .select({ webPushEnabled: notificationSettings.webPushEnabled })
      .from(notificationSettings)
      .where(eq(notificationSettings.userId, user.id))
      .limit(1)
  ])

  return {
    success: true,
    data: {
      configured: isWebPushConfigured(),
      enabled: Boolean(settings[0]?.webPushEnabled && subscriptions.length > 0),
      deviceCount: subscriptions.length
    }
  }
})
