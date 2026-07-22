import { z } from 'zod'
import { sendWebPushToUser } from '~~/server/services/webPushService'

const testSubscriptionSchema = z.object({
  endpoint: z.string().url().max(2048)
})

export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) throw createError({ statusCode: 401, message: '需要登录才能测试浏览器通知' })

  const parsed = testSubscriptionSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: '当前设备推送订阅无效，请重新开启推送' })
  }

  const result = await sendWebPushToUser(
    user.id,
    {
      title: 'VoiceHub 浏览器通知',
      body: '测试通知发送成功，后续排期与播出消息会通过此设备提醒您。',
      path: '/notification-settings',
      tag: 'web-push-test',
      type: 'TEST',
      ttl: 300,
      urgency: 'high'
    },
    { endpoint: parsed.data.endpoint }
  )

  if (!result.configured) {
    throw createError({ statusCode: 503, message: '管理员尚未配置 Web Push 密钥' })
  }
  if (result.sent === 0) {
    if (result.removed > 0) {
      throw createError({ statusCode: 410, message: '当前设备订阅已失效，请关闭推送后重新开启' })
    }
    if (result.failed > 0) {
      throw createError({
        statusCode: 502,
        message: '推送服务未能送达当前设备，请检查手机系统通知和推送服务后重试'
      })
    }
    throw createError({ statusCode: 404, message: '服务端未找到当前设备，请关闭推送后重新开启' })
  }

  return { success: true, data: result }
})
