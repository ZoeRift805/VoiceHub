import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { db } from '~/drizzle/db'
import { notificationSettings, pushSubscriptions } from '~/drizzle/schema'

const bodySchema = z.object({ endpoint: z.string().url().max(2048) })

export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) throw createError({ statusCode: 401, message: '需要登录才能关闭浏览器通知' })

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, message: '推送订阅地址无效' })

  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, user.id),
        eq(pushSubscriptions.endpoint, parsed.data.endpoint)
      )
    )

  const remaining = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, user.id))
    .limit(1)

  if (remaining.length === 0) {
    await db
      .update(notificationSettings)
      .set({ webPushEnabled: false, updatedAt: new Date() })
      .where(eq(notificationSettings.userId, user.id))
  }

  return { success: true, data: { enabled: remaining.length > 0 } }
})
