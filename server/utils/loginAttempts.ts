import { eq, and, sql } from 'drizzle-orm'
import { db } from '~~/app/drizzle/db'
import { loginAttempts } from '~~/app/drizzle/schema'

export async function getFailedAttempts(username: string, ip: string, windowMinutes: number) {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000)
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.username, username),
        eq(loginAttempts.ip, ip),
        sql`${loginAttempts.createdAt} >= ${since.toISOString()}`
      )
    )
  return result[0]?.count ?? 0
}

export async function recordFailedAttempt(username: string, ip: string) {
  await db.insert(loginAttempts).values({ username, ip })
}

export async function clearAttempts(username: string, ip: string) {
  await db.delete(loginAttempts).where(
    and(eq(loginAttempts.username, username), eq(loginAttempts.ip, ip))
  )
}
