import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '~/drizzle/db'
import { notificationSettings, pushSubscriptions } from '~/drizzle/schema'
import { isWebPushConfigured } from '~~/server/services/webPushService'

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512)
  })
})

export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) throw createError({ statusCode: 401, message: '需要登录才能开启浏览器通知' })
  if (!isWebPushConfigured()) {
    throw createError({ statusCode: 503, message: '管理员尚未完整配置 Web Push' })
  }

  const parsed = subscriptionSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: '浏览器推送订阅数据无效' })
  }

  const now = new Date()
  await db
    .insert(pushSubscriptions)
    .values({
      userId: user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userAgent: getHeader(event, 'user-agent') || null,
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId: user.id,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        userAgent: getHeader(event, 'user-agent') || null,
        failureCount: 0,
        updatedAt: now
      }
    })

  const existingSettings = await db
    .select({ id: notificationSettings.id })
    .from(notificationSettings)
    .where(eq(notificationSettings.userId, user.id))
    .limit(1)

  if (existingSettings[0]) {
    await db
      .update(notificationSettings)
      .set({ webPushEnabled: true, updatedAt: now })
      .where(eq(notificationSettings.id, existingSettings[0].id))
  } else {
    await db.insert(notificationSettings).values({ userId: user.id, webPushEnabled: true })
  }

  return { success: true, data: { enabled: true } }
})
