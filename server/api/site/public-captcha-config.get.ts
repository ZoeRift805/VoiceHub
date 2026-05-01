export default defineEventHandler(async () => {
  const { getSiteSettings } = await import('~~/server/utils/siteUtils')
  const config = await getSiteSettings()
  const cc = config?.captchaConfig || {}
  return {
    enabled: cc.enabled ?? false,
    provider: cc.provider ?? 'turnstile',
    siteKey: cc.siteKey ?? '',
    maxAttempts: cc.maxAttempts ?? 3,
  }
})
