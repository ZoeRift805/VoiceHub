import { getSiteSettings } from '~~/server/utils/siteUtils'

export default defineEventHandler(async () => {
  const config = await getSiteSettings()
  const cc = config?.captchaConfig || {}
  return {
    enabled: cc.enabled ?? false,
    provider: cc.provider ?? 'turnstile',
    siteKey: cc.siteKey ?? '',
    maxAttempts: cc.maxAttempts ?? 3,
  }
})
