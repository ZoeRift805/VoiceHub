import { timingSafeEqual } from 'node:crypto'
import { and, eq, gte, isNull, lte } from 'drizzle-orm'
import { db } from '~/drizzle/db'
import { playTimes, schedules, songs } from '~/drizzle/schema'
import { createBroadcastReminderNotification } from '~~/server/services/notificationService'
import { getWebPushConfiguration } from '~~/server/services/webPushService'
import { formatDateTime, parseToBeijingTime } from '~/utils/timeUtils'

function secretsMatch(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)
  return (
    actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
  )
}

export default defineEventHandler(async (event) => {
  const configuration = await getWebPushConfiguration()
  const expectedSecret = configuration.cronSecret
  if (!expectedSecret) {
    throw createError({ statusCode: 503, message: '播出提醒任务尚未配置' })
  }

  const authorization = getHeader(event, 'authorization') || ''
  const suppliedSecret = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!suppliedSecret || !secretsMatch(suppliedSecret, expectedSecret)) {
    throw createError({ statusCode: 401, message: '内部任务认证失败' })
  }

  const reminderMinutes = configuration.reminderMinutes
  const now = new Date()
  const searchStart = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const searchEnd = new Date(now.getTime() + 48 * 60 * 60 * 1000)

  const candidates = await db
    .select({
      scheduleId: schedules.id,
      songId: songs.id,
      songTitle: songs.title,
      requesterId: songs.requesterId,
      playDate: schedules.playDate,
      startTime: playTimes.startTime
    })
    .from(schedules)
    .innerJoin(songs, eq(schedules.songId, songs.id))
    .innerJoin(playTimes, eq(schedules.playTimeId, playTimes.id))
    .where(
      and(
        eq(schedules.isDraft, false),
        eq(schedules.played, false),
        isNull(schedules.reminderSentAt),
        gte(schedules.playDate, searchStart),
        lte(schedules.playDate, searchEnd)
      )
    )

  let processed = 0
  let skipped = 0
  let failed = 0

  for (const candidate of candidates) {
    const startTime = candidate.startTime?.trim()
    const timeParts = startTime?.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
    const hour = Number(timeParts?.[1])
    const minute = Number(timeParts?.[2])
    if (!timeParts || hour > 23 || minute > 59) {
      skipped += 1
      continue
    }

    const date = formatDateTime(candidate.playDate, 'YYYY-MM-DD')
    const scheduledAt = parseToBeijingTime(
      `${date} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    )
    const minutesUntil = Math.ceil((scheduledAt.getTime() - now.getTime()) / 60000)
    if (minutesUntil <= 0 || minutesUntil > reminderMinutes) continue

    const claimed = await db
      .update(schedules)
      .set({ reminderSentAt: now, updatedAt: now })
      .where(and(eq(schedules.id, candidate.scheduleId), isNull(schedules.reminderSentAt)))
      .returning({ id: schedules.id })

    if (claimed.length === 0) continue

    try {
      await createBroadcastReminderNotification(
        candidate.requesterId,
        candidate.songId,
        candidate.songTitle,
        Math.max(1, minutesUntil)
      )
      processed += 1
    } catch (error) {
      failed += 1
      await db
        .update(schedules)
        .set({ reminderSentAt: null, updatedAt: new Date() })
        .where(eq(schedules.id, candidate.scheduleId))
      console.error(`[WebPush] 创建播出提醒失败 (Schedule: ${candidate.scheduleId}):`, error)
    }
  }

  return {
    success: true,
    data: { processed, skipped, failed, reminderMinutes }
  }
})
