import { and, eq, gte, lt } from 'drizzle-orm'
import { readBody } from 'h3'
import { db } from '~/drizzle/db'
import { schedules, songs } from '~/drizzle/schema'
import { getServerDate } from '~~/server/utils/serverTime'
import { requireSongAdmin } from '~~/server/utils/requireSongAdmin'
import { fetchSongDuration } from '~~/server/utils/songDurationFetcher'

const formatDuration = (seconds) => {
  if (!Number.isFinite(seconds) || seconds == null) return '--:--'
  const total = Math.max(0, Math.floor(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export default defineEventHandler(async (event) => {
  requireSongAdmin(event)
  const now = getServerDate()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  const rows = await db
    .select({ id: songs.id, title: songs.title, artist: songs.artist, musicPlatform: songs.musicPlatform, musicId: songs.musicId, durationSeconds: songs.durationSeconds })
    .from(schedules)
    .innerJoin(songs, eq(schedules.songId, songs.id))
    .where(and(eq(schedules.isDraft, false), gte(schedules.playDate, start), lt(schedules.playDate, end)))

  const items = []
  for (const song of rows) {
    let duration = song.durationSeconds
    if ((!duration || duration < 1) && song.musicPlatform && song.musicId) {
      duration = await fetchSongDuration(song.musicPlatform, song.musicId)
      if (duration) await db.update(songs).set({ durationSeconds: duration }).where(eq(songs.id, song.id))
    }
    items.push({ ...song, durationSeconds: duration || null, durationText: formatDuration(duration) })
  }
  const totalSeconds = items.reduce((sum, item) => sum + (item.durationSeconds || 0), 0)
  return { success: true, date: start.toISOString().slice(0, 10), items, totalSeconds, totalText: formatDuration(totalSeconds) }
})
