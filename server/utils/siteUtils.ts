import { db } from '~/drizzle/db'
import { systemSettings } from '~/drizzle/schema'

/**
 * 获取站点标题
 */
export async function getSiteTitle(): Promise<string> {
  try {
    const rows = await db.select().from(systemSettings).limit(1)
    const settings = rows[0]
    return settings?.siteTitle || process.env.NUXT_PUBLIC_SITE_TITLE || 'VoiceHub'
  } catch (error) {
    console.error('获取站点标题失败:', error)
    return 'VoiceHub'
  }
}

let cached: any = null
export async function getSiteSettings() {
  try {
    const rows = await db.select().from(systemSettings).limit(1)
    return rows[0] || {}
  } catch (error) {
    console.error('获取站点设置失败:', error)
    return {}
  }
}

/**
 * 姓名脱敏函数，统一返回三个星号
 * @param name 原始姓名
 * @returns 脱敏后的姓名
 */
export function maskStudentName(name: string): string {
  if (!name) return name
  return '***'
}
