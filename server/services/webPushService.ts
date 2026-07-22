import webpush from 'web-push'
import { and, eq } from 'drizzle-orm'
import { db } from '~/drizzle/db'
import { notificationSettings, pushSubscriptions } from '~/drizzle/schema'

export interface WebPushPayload {
  title: string
  body: string
  path?: string
  tag?: string
  type?: string
}

export interface WebPushResult {
  sent: number
  failed: number
  removed: number
  configured: boolean
}

let configuredFingerprint = ''

function configureWebPush() {
  const config = useRuntimeConfig()
  const publicKey = String(config.public.webPushPublicKey || '').trim()
  const privateKey = String(config.webPush.privateKey || '').trim()
  const subject = String(config.webPush.subject || '').trim()

  if (!publicKey || !privateKey || !/^(mailto:|https:\/\/)/.test(subject)) return false

  const fingerprint = `${publicKey}:${privateKey}:${subject}`
  if (configuredFingerprint !== fingerprint) {
    try {
      webpush.setVapidDetails(subject, publicKey, privateKey)
      configuredFingerprint = fingerprint
    } catch (error) {
      console.error('[WebPush] VAPID 配置无效:', error)
      return false
    }
  }

  return true
}

export function isWebPushConfigured() {
  return configureWebPush()
}

export async function sendWebPushToUser(
  userId: number,
  payload: WebPushPayload
): Promise<WebPushResult> {
  const result: WebPushResult = { sent: 0, failed: 0, removed: 0, configured: false }
  if (!configureWebPush()) return result
  result.configured = true

  const settings = await db
    .select({ webPushEnabled: notificationSettings.webPushEnabled })
    .from(notificationSettings)
    .where(eq(notificationSettings.userId, userId))
    .limit(1)
    .then((rows) => rows[0])

  if (!settings?.webPushEnabled) return result

  const subscriptions = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth
            }
          },
          JSON.stringify({
            title: payload.title,
            body: payload.body,
            path: payload.path || '/?tab=notification',
            tag: payload.tag,
            type: payload.type
          }),
          { TTL: 60 * 60 * 12, urgency: 'normal' }
        )

        result.sent += 1
        await db
          .update(pushSubscriptions)
          .set({ failureCount: 0, lastSuccessAt: new Date(), updatedAt: new Date() })
          .where(eq(pushSubscriptions.id, subscription.id))
      } catch (error: any) {
        const statusCode = Number(error?.statusCode || error?.status || 0)
        if (statusCode === 404 || statusCode === 410) {
          await db
            .delete(pushSubscriptions)
            .where(
              and(eq(pushSubscriptions.id, subscription.id), eq(pushSubscriptions.userId, userId))
            )
          result.removed += 1
          return
        }

        result.failed += 1
        await db
          .update(pushSubscriptions)
          .set({
            failureCount: subscription.failureCount + 1,
            updatedAt: new Date()
          })
          .where(eq(pushSubscriptions.id, subscription.id))
        console.error(`[WebPush] 推送失败 (User: ${userId}, Status: ${statusCode || 'unknown'})`)
      }
    })
  )

  return result
}

export async function sendWebPushToUsers(userIds: number[], payload: WebPushPayload) {
  const uniqueUserIds = [...new Set(userIds)]
  const results = await Promise.allSettled(
    uniqueUserIds.map((userId) => sendWebPushToUser(userId, payload))
  )

  return results.reduce(
    (total, item) => {
      if (item.status === 'fulfilled') {
        total.sent += item.value.sent
        total.failed += item.value.failed
        total.removed += item.value.removed
      } else {
        total.failed += 1
      }
      return total
    },
    { sent: 0, failed: 0, removed: 0 }
  )
}
