import { sendWebPushToUser } from '~~/server/services/webPushService'

export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) throw createError({ statusCode: 401, message: '需要登录才能测试浏览器通知' })

  const result = await sendWebPushToUser(user.id, {
    title: 'VoiceHub 浏览器通知',
    body: '测试通知发送成功，后续排期与播出消息会通过此设备提醒您。',
    path: '/notification-settings',
    tag: 'web-push-test',
    type: 'TEST'
  })

  if (!result.configured) {
    throw createError({ statusCode: 503, message: '管理员尚未配置 Web Push 密钥' })
  }
  if (result.sent === 0) {
    throw createError({ statusCode: 502, message: '没有可用的推送设备，请重新开启浏览器通知' })
  }

  return { success: true, data: result }
})
