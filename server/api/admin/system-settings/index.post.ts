import { db } from '~/drizzle/db'
import { pushSubscriptions, systemSettings } from '~/drizzle/schema'
import { eq } from 'drizzle-orm'
import { createECDH } from 'node:crypto'
import { SMTP_PASSWORD_MASK, SECRET_FIELD_MASK, maskSystemSettingsSecrets } from './secretMask'
import { SYSTEM_SETTINGS_DEFAULTS } from '../../../utils/system-settings-defaults'
import {
  getAggregateOAuthLoginTypesOrDefault,
  isSafeAggregateOAuthUrl,
  normalizeAggregateOAuthLoginTypes
} from '~~/server/utils/oauth-providers'

const normalizeOptionalText = (value: unknown, fieldName: string, maxLength: number) => {
  if (value === null || value === '') return null
  if (typeof value !== 'string') {
    throw createError({ statusCode: 400, message: `${fieldName} 必须是字符串` })
  }

  const normalized = value.trim()
  if (!normalized) return null
  if (normalized.length > maxLength) {
    throw createError({ statusCode: 400, message: `${fieldName} 长度不能超过 ${maxLength}` })
  }
  return normalized
}

const isValidVapidPublicKey = (value: string) => {
  try {
    const decoded = Buffer.from(value, 'base64url')
    return decoded.length === 65 && decoded[0] === 4
  } catch {
    return false
  }
}

const isValidVapidPrivateKey = (value: string) => {
  try {
    return Buffer.from(value, 'base64url').length === 32
  } catch {
    return false
  }
}

const vapidKeysMatch = (publicKey: string, privateKey: string) => {
  try {
    const ecdh = createECDH('prime256v1')
    ecdh.setPrivateKey(Buffer.from(privateKey, 'base64url'))
    return Buffer.from(publicKey, 'base64url').equals(ecdh.getPublicKey())
  } catch {
    return false
  }
}

const isValidWebPushSubject = (value: string) => {
  if (/^mailto:[^\s@]+@[^\s@]+$/.test(value)) return true
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

export default defineEventHandler(async (event) => {
  // 检查用户认证和权限
  const user = event.context.user

  if (!user) {
    throw createError({
      statusCode: 401,
      message: '未授权访问'
    })
  }

  if (!['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
    throw createError({
      statusCode: 403,
      message: '只有管理员才能更新系统设置'
    })
  }

  try {
    const body = await readBody(event)

    // 验证请求体
    const updateData: any = {}

    // 获取当前设置，用于验证依赖配置的完整性
    const settingsResult = await db.select().from(systemSettings).limit(1)
    let settings = settingsResult[0]

    if (body.telemetryEnabled !== undefined) {
      if (typeof body.telemetryEnabled !== 'boolean') {
        throw createError({
          statusCode: 400,
          message: 'telemetryEnabled 必须是布尔值'
        })
      }
      updateData.telemetryEnabled = body.telemetryEnabled
    }

    if (body.hideStudentInfo !== undefined) {
      if (typeof body.hideStudentInfo !== 'boolean') {
        throw createError({
          statusCode: 400,
          message: 'hideStudentInfo 必须是布尔值'
        })
      }
      updateData.hideStudentInfo = body.hideStudentInfo
    }

    if (body.enablePlayTimeSelection !== undefined) {
      if (typeof body.enablePlayTimeSelection !== 'boolean') {
        throw createError({
          statusCode: 400,
          message: 'enablePlayTimeSelection 必须是布尔值'
        })
      }
      updateData.enablePlayTimeSelection = body.enablePlayTimeSelection
    }

    if (body.siteTitle !== undefined) {
      updateData.siteTitle = body.siteTitle
    }

    if (body.siteLogoUrl !== undefined) {
      updateData.siteLogoUrl = body.siteLogoUrl
    }

    if (body.schoolLogoHomeUrl !== undefined) {
      updateData.schoolLogoHomeUrl = body.schoolLogoHomeUrl
    }

    if (body.schoolLogoPrintUrl !== undefined) {
      updateData.schoolLogoPrintUrl = body.schoolLogoPrintUrl
    }

    if (body.siteDescription !== undefined) {
      updateData.siteDescription = body.siteDescription
    }

    if (body.submissionGuidelines !== undefined) {
      updateData.submissionGuidelines = body.submissionGuidelines
    }

    if (body.icpNumber !== undefined) {
      updateData.icpNumber = body.icpNumber
    }

    if (body.gonganNumber !== undefined) {
      updateData.gonganNumber = body.gonganNumber
    }

    if (body.showBeianIcon !== undefined) {
      if (typeof body.showBeianIcon !== 'boolean') {
        throw createError({
          statusCode: 400,
          message: 'showBeianIcon 必须是布尔值'
        })
      }
      updateData.showBeianIcon = body.showBeianIcon
    }

    if (body.enableSubmissionLimit !== undefined) {
      if (typeof body.enableSubmissionLimit !== 'boolean') {
        throw createError({
          statusCode: 400,
          message: 'enableSubmissionLimit 必须是布尔值'
        })
      }
      updateData.enableSubmissionLimit = body.enableSubmissionLimit
    }

    // 点歌券点歌相关设置
    if (body.enableCardCodeRequests !== undefined) {
      if (typeof body.enableCardCodeRequests !== 'boolean') {
        throw createError({
          statusCode: 400,
          message: 'enableCardCodeRequests 必须是布尔值'
        })
      }
      updateData.enableCardCodeRequests = body.enableCardCodeRequests
    }

    if (body.requireCardCodeForRequests !== undefined) {
      if (typeof body.requireCardCodeForRequests !== 'boolean') {
        throw createError({
          statusCode: 400,
          message: 'requireCardCodeForRequests 必须是布尔值'
        })
      }
      updateData.requireCardCodeForRequests = body.requireCardCodeForRequests
    }

    if (body.enableCardCodeLimitBypass !== undefined) {
      if (typeof body.enableCardCodeLimitBypass !== 'boolean') {
        throw createError({
          statusCode: 400,
          message: 'enableCardCodeLimitBypass 必须是布尔值'
        })
      }
      updateData.enableCardCodeLimitBypass = body.enableCardCodeLimitBypass
    }

    if (body.dailySubmissionLimit !== undefined) {
      if (
        body.dailySubmissionLimit !== null &&
        (!Number.isInteger(body.dailySubmissionLimit) || body.dailySubmissionLimit < 0)
      ) {
        throw createError({
          statusCode: 400,
          message: 'dailySubmissionLimit 必须是非负整数或null'
        })
      }
      updateData.dailySubmissionLimit = body.dailySubmissionLimit
    }

    if (body.weeklySubmissionLimit !== undefined) {
      if (
        body.weeklySubmissionLimit !== null &&
        (!Number.isInteger(body.weeklySubmissionLimit) || body.weeklySubmissionLimit < 0)
      ) {
        throw createError({
          statusCode: 400,
          message: 'weeklySubmissionLimit 必须是非负整数或null'
        })
      }
      updateData.weeklySubmissionLimit = body.weeklySubmissionLimit
    }

    if (body.monthlySubmissionLimit !== undefined) {
      if (
        body.monthlySubmissionLimit !== null &&
        (!Number.isInteger(body.monthlySubmissionLimit) || body.monthlySubmissionLimit < 0)
      ) {
        throw createError({
          statusCode: 400,
          message: 'monthlySubmissionLimit 必须是非负整数或null'
        })
      }
      updateData.monthlySubmissionLimit = body.monthlySubmissionLimit
    }

    if (body.showBlacklistKeywords !== undefined) {
      if (typeof body.showBlacklistKeywords !== 'boolean') {
        throw createError({
          statusCode: 400,
          message: 'showBlacklistKeywords 必须是布尔值'
        })
      }
      updateData.showBlacklistKeywords = body.showBlacklistKeywords
    }

    if (body.enableReplayRequests !== undefined) {
      if (typeof body.enableReplayRequests !== 'boolean') {
        throw createError({
          statusCode: 400,
          message: 'enableReplayRequests 必须是布尔值'
        })
      }
      updateData.enableReplayRequests = body.enableReplayRequests
    }

    if (body.enableCollaborativeSubmission !== undefined) {
      if (typeof body.enableCollaborativeSubmission !== 'boolean') {
        throw createError({
          statusCode: 400,
          message: 'enableCollaborativeSubmission 必须是布尔值'
        })
      }
      updateData.enableCollaborativeSubmission = body.enableCollaborativeSubmission
    }

    if (body.enableSubmissionRemarks !== undefined) {
      if (typeof body.enableSubmissionRemarks !== 'boolean') {
        throw createError({
          statusCode: 400,
          message: 'enableSubmissionRemarks 必须是布尔值'
        })
      }
      updateData.enableSubmissionRemarks = body.enableSubmissionRemarks
    }

    if (body.captchaEnabled !== undefined) {
      if (typeof body.captchaEnabled !== 'boolean') {
        throw createError({
          statusCode: 400,
          message: 'captchaEnabled 必须是布尔值'
        })
      }
      updateData.captchaEnabled = body.captchaEnabled
    }

    if (body.captchaMaxFailures !== undefined) {
      if (!Number.isInteger(body.captchaMaxFailures) || body.captchaMaxFailures < 1) {
        throw createError({
          statusCode: 400,
          message: 'captchaMaxFailures 必须是正整数'
        })
      }
      updateData.captchaMaxFailures = body.captchaMaxFailures
    }

    if (body.captchaProvider !== undefined) {
      if (body.captchaProvider !== 'graphic' && body.captchaProvider !== 'turnstile') {
        throw createError({
          statusCode: 400,
          message: 'captchaProvider 必须是 graphic 或 turnstile'
        })
      }

      const nextTurnstileSiteKey =
        body.turnstileSiteKey !== undefined ? body.turnstileSiteKey : settings?.turnstileSiteKey
      const nextTurnstileSecretKey =
        body.turnstileSecretKey !== undefined && body.turnstileSecretKey !== SECRET_FIELD_MASK
          ? body.turnstileSecretKey
          : settings?.turnstileSecretKey

      if (
        body.captchaProvider === 'turnstile' &&
        (!nextTurnstileSiteKey || !nextTurnstileSecretKey)
      ) {
        throw createError({
          statusCode: 400,
          message: '启用 Turnstile 验证前，请先配置 Site Key 和 Secret Key'
        })
      }

      updateData.captchaProvider = body.captchaProvider
    }

    if (body.turnstileSiteKey !== undefined) {
      updateData.turnstileSiteKey = body.turnstileSiteKey
    }

    if (body.turnstileSecretKey !== undefined && body.turnstileSecretKey !== SECRET_FIELD_MASK) {
      updateData.turnstileSecretKey = body.turnstileSecretKey
    }

    if (body.enableRequestTimeLimitation !== undefined) {
      if (typeof body.enableRequestTimeLimitation !== 'boolean') {
        throw createError({
          statusCode: 400,
          message: 'enableRequestTimeLimitation 必须是布尔值'
        })
      }
      updateData.enableRequestTimeLimitation = body.enableRequestTimeLimitation
    }

    if (body.forceBlockAllRequests !== undefined) {
      if (typeof body.forceBlockAllRequests !== 'boolean') {
        throw createError({
          statusCode: 400,
          message: 'forceBlockAllRequests 必须是布尔值'
        })
      }
      updateData.forceBlockAllRequests = body.forceBlockAllRequests
    }

    // SMTP配置字段
    if (body.smtpEnabled !== undefined) {
      if (typeof body.smtpEnabled !== 'boolean') {
        throw createError({
          statusCode: 400,
          message: 'smtpEnabled 必须是布尔值'
        })
      }
      updateData.smtpEnabled = body.smtpEnabled
    }

    if (body.smtpHost !== undefined) {
      updateData.smtpHost = body.smtpHost
    }

    if (body.smtpPort !== undefined) {
      if (
        body.smtpPort !== null &&
        (!Number.isInteger(body.smtpPort) || body.smtpPort < 1 || body.smtpPort > 65535)
      ) {
        throw createError({
          statusCode: 400,
          message: 'smtpPort 必须是1-65535之间的整数'
        })
      }
      updateData.smtpPort = body.smtpPort
    }

    if (body.smtpSecure !== undefined) {
      if (typeof body.smtpSecure !== 'boolean') {
        throw createError({
          statusCode: 400,
          message: 'smtpSecure 必须是布尔值'
        })
      }
      updateData.smtpSecure = body.smtpSecure
    }

    if (body.smtpUsername !== undefined) {
      updateData.smtpUsername = body.smtpUsername
    }

    if (body.smtpPassword !== undefined && body.smtpPassword !== SMTP_PASSWORD_MASK) {
      updateData.smtpPassword = body.smtpPassword
    }

    if (body.smtpFromEmail !== undefined) {
      updateData.smtpFromEmail = body.smtpFromEmail
    }

    if (body.smtpFromName !== undefined) {
      updateData.smtpFromName = body.smtpFromName
    }

    // Web Push 配置字段
    if (body.webPushEnabled !== undefined) {
      if (typeof body.webPushEnabled !== 'boolean') {
        throw createError({ statusCode: 400, message: 'webPushEnabled 必须是布尔值' })
      }
      updateData.webPushEnabled = body.webPushEnabled
    }

    if (body.webPushPublicKey !== undefined) {
      updateData.webPushPublicKey = normalizeOptionalText(
        body.webPushPublicKey,
        'VAPID 公钥',
        512
      )
    }

    if (
      body.webPushPrivateKey !== undefined &&
      body.webPushPrivateKey !== SECRET_FIELD_MASK
    ) {
      updateData.webPushPrivateKey = normalizeOptionalText(
        body.webPushPrivateKey,
        'VAPID 私钥',
        512
      )
    }

    if (body.webPushSubject !== undefined) {
      updateData.webPushSubject = normalizeOptionalText(
        body.webPushSubject,
        'Web Push 联系地址',
        512
      )
    }

    if (body.webPushCronSecret !== undefined && body.webPushCronSecret !== SECRET_FIELD_MASK) {
      updateData.webPushCronSecret = normalizeOptionalText(
        body.webPushCronSecret,
        '定时任务密钥',
        512
      )
    }

    if (body.webPushReminderMinutes !== undefined) {
      if (
        !Number.isInteger(body.webPushReminderMinutes) ||
        body.webPushReminderMinutes < 1 ||
        body.webPushReminderMinutes > 1440
      ) {
        throw createError({
          statusCode: 400,
          message: '播出提醒提前分钟数必须是 1-1440 之间的整数'
        })
      }
      updateData.webPushReminderMinutes = body.webPushReminderMinutes
    }

    const nextWebPushEnabled =
      body.webPushEnabled !== undefined
        ? body.webPushEnabled
        : (settings?.webPushEnabled ?? false)
    const nextWebPushPublicKey =
      body.webPushPublicKey !== undefined
        ? updateData.webPushPublicKey
        : settings?.webPushPublicKey
    const nextWebPushPrivateKey =
      body.webPushPrivateKey !== undefined && body.webPushPrivateKey !== SECRET_FIELD_MASK
        ? updateData.webPushPrivateKey
        : settings?.webPushPrivateKey
    const nextWebPushSubject =
      body.webPushSubject !== undefined ? updateData.webPushSubject : settings?.webPushSubject
    const nextWebPushCronSecret =
      body.webPushCronSecret !== undefined && body.webPushCronSecret !== SECRET_FIELD_MASK
        ? updateData.webPushCronSecret
        : settings?.webPushCronSecret

    if (nextWebPushEnabled) {
      if (
        !nextWebPushPublicKey ||
        !nextWebPushPrivateKey ||
        !nextWebPushSubject ||
        !nextWebPushCronSecret
      ) {
        throw createError({ statusCode: 400, message: '启用 Web Push 前请完整填写所有配置' })
      }
      if (!isValidVapidPublicKey(nextWebPushPublicKey)) {
        throw createError({ statusCode: 400, message: 'VAPID 公钥格式无效' })
      }
      if (!isValidVapidPrivateKey(nextWebPushPrivateKey)) {
        throw createError({ statusCode: 400, message: 'VAPID 私钥格式无效' })
      }
      if (!vapidKeysMatch(nextWebPushPublicKey, nextWebPushPrivateKey)) {
        throw createError({ statusCode: 400, message: 'VAPID 公钥与私钥不匹配' })
      }
      if (!isValidWebPushSubject(nextWebPushSubject)) {
        throw createError({
          statusCode: 400,
          message: 'Web Push 联系地址必须是 mailto:邮箱或 HTTPS URL'
        })
      }
      if (nextWebPushCronSecret.length < 16) {
        throw createError({ statusCode: 400, message: '定时任务密钥至少需要 16 个字符' })
      }
    }

    // OAuth 配置字段
    if (body.allowOAuthRegistration !== undefined) {
      if (typeof body.allowOAuthRegistration !== 'boolean') {
        throw createError({
          statusCode: 400,
          message: 'allowOAuthRegistration 必须是布尔值'
        })
      }
      updateData.allowOAuthRegistration = body.allowOAuthRegistration
    }

    if (body.oauthRedirectUri !== undefined) {
      const normalizedOauthRedirectUri =
        typeof body.oauthRedirectUri === 'string'
          ? body.oauthRedirectUri.trim()
          : body.oauthRedirectUri

      if (normalizedOauthRedirectUri !== null && normalizedOauthRedirectUri !== '') {
        try {
          const uri = new URL(normalizedOauthRedirectUri)
          // 支持 broker 回调 (包含 /callback 或 /api/auth/[provider]/callback 结构)
          const validPathPattern = /(?:\/api)?\/auth\/[^/]+\/callback\/?$|\/callback\/?$/
          if (!validPathPattern.test(uri.pathname)) {
            throw createError({
              statusCode: 400,
              message:
                'oauthRedirectUri 必须是回调地址，例如 https://yourdomain.com/api/auth/[provider]/callback'
            })
          }
        } catch (error: any) {
          if (error?.statusCode === 400) throw error
          throw createError({
            statusCode: 400,
            message:
              'oauthRedirectUri 不是合法URL，示例：https://yourdomain.com/api/auth/[provider]/callback'
          })
        }
      }
      updateData.oauthRedirectUri =
        normalizedOauthRedirectUri === '' ? null : normalizedOauthRedirectUri
    }

    if (body.oauthStateSecret !== undefined && body.oauthStateSecret !== SECRET_FIELD_MASK) {
      updateData.oauthStateSecret = body.oauthStateSecret
    }

    const nextOauthRedirectUri =
      body.oauthRedirectUri !== undefined ? updateData.oauthRedirectUri : settings?.oauthRedirectUri
    const nextOauthStateSecret =
      body.oauthStateSecret !== undefined && body.oauthStateSecret !== SECRET_FIELD_MASK
        ? body.oauthStateSecret
        : settings?.oauthStateSecret
    const nextGithubOAuthEnabled =
      body.githubOAuthEnabled !== undefined
        ? body.githubOAuthEnabled
        : (settings?.githubOAuthEnabled ?? false)
    const nextCasdoorOAuthEnabled =
      body.casdoorOAuthEnabled !== undefined
        ? body.casdoorOAuthEnabled
        : (settings?.casdoorOAuthEnabled ?? false)
    const nextGoogleOAuthEnabled =
      body.googleOAuthEnabled !== undefined
        ? body.googleOAuthEnabled
        : (settings?.googleOAuthEnabled ?? false)
    const nextAggregateOAuthEnabled =
      body.aggregateOAuthEnabled !== undefined
        ? body.aggregateOAuthEnabled
        : (settings?.aggregateOAuthEnabled ?? false)
    const nextCustomOAuthEnabled =
      body.customOAuthEnabled !== undefined
        ? body.customOAuthEnabled
        : (settings?.customOAuthEnabled ?? false)

    if (
      nextGithubOAuthEnabled ||
      nextCasdoorOAuthEnabled ||
      nextGoogleOAuthEnabled ||
      nextAggregateOAuthEnabled ||
      nextCustomOAuthEnabled
    ) {
      if (!nextOauthRedirectUri || !nextOauthStateSecret) {
        throw createError({
          statusCode: 400,
          message:
            '启用 OAuth 登录方式前，请先在管理员后台配置 OAuth 重定向 URI 和 OAuth State 密钥'
        })
      }
    }

    // GitHub OAuth
    if (body.githubOAuthEnabled !== undefined) {
      if (typeof body.githubOAuthEnabled !== 'boolean') {
        throw createError({
          statusCode: 400,
          message: 'githubOAuthEnabled 必须是布尔值'
        })
      }
      if (body.githubOAuthEnabled && !body.githubClientId && !settings?.githubClientId) {
        throw createError({ statusCode: 400, message: '启用 GitHub 登录时必须提供 Client ID' })
      }
      if (body.githubOAuthEnabled && !body.githubClientSecret && !settings?.githubClientSecret) {
        throw createError({ statusCode: 400, message: '启用 GitHub 登录时必须提供 Client Secret' })
      }
      updateData.githubOAuthEnabled = body.githubOAuthEnabled
    }

    if (body.githubClientId !== undefined) {
      updateData.githubClientId = body.githubClientId
    }

    if (body.githubClientSecret !== undefined && body.githubClientSecret !== SECRET_FIELD_MASK) {
      updateData.githubClientSecret = body.githubClientSecret
    }

    // Casdoor OAuth
    if (body.casdoorOAuthEnabled !== undefined) {
      if (typeof body.casdoorOAuthEnabled !== 'boolean') {
        throw createError({
          statusCode: 400,
          message: 'casdoorOAuthEnabled 必须是布尔值'
        })
      }
      if (body.casdoorOAuthEnabled && !body.casdoorServerUrl && !settings?.casdoorServerUrl) {
        throw createError({ statusCode: 400, message: '启用 Casdoor 登录时必须提供服务器 URL' })
      }
      if (body.casdoorOAuthEnabled && !body.casdoorClientId && !settings?.casdoorClientId) {
        throw createError({ statusCode: 400, message: '启用 Casdoor 登录时必须提供 Client ID' })
      }
      if (body.casdoorOAuthEnabled && !body.casdoorClientSecret && !settings?.casdoorClientSecret) {
        throw createError({ statusCode: 400, message: '启用 Casdoor 登录时必须提供 Client Secret' })
      }
      if (
        body.casdoorOAuthEnabled &&
        !body.casdoorOrganizationName &&
        !settings?.casdoorOrganizationName
      ) {
        throw createError({ statusCode: 400, message: '启用 Casdoor 登录时必须提供组织名称' })
      }
      updateData.casdoorOAuthEnabled = body.casdoorOAuthEnabled
    }

    if (body.casdoorServerUrl !== undefined) {
      updateData.casdoorServerUrl = body.casdoorServerUrl
    }

    if (body.casdoorClientId !== undefined) {
      updateData.casdoorClientId = body.casdoorClientId
    }

    if (body.casdoorClientSecret !== undefined && body.casdoorClientSecret !== SECRET_FIELD_MASK) {
      updateData.casdoorClientSecret = body.casdoorClientSecret
    }

    if (body.casdoorOrganizationName !== undefined) {
      updateData.casdoorOrganizationName = body.casdoorOrganizationName
    }

    // Google OAuth
    if (body.googleOAuthEnabled !== undefined) {
      if (typeof body.googleOAuthEnabled !== 'boolean') {
        throw createError({
          statusCode: 400,
          message: 'googleOAuthEnabled 必须是布尔值'
        })
      }
      if (body.googleOAuthEnabled && !body.googleClientId && !settings?.googleClientId) {
        throw createError({ statusCode: 400, message: '启用 Google 登录时必须提供 Client ID' })
      }
      if (body.googleOAuthEnabled && !body.googleClientSecret && !settings?.googleClientSecret) {
        throw createError({ statusCode: 400, message: '启用 Google 登录时必须提供 Client Secret' })
      }
      updateData.googleOAuthEnabled = body.googleOAuthEnabled
    }

    if (body.googleClientId !== undefined) {
      updateData.googleClientId = body.googleClientId
    }

    if (body.googleClientSecret !== undefined && body.googleClientSecret !== SECRET_FIELD_MASK) {
      updateData.googleClientSecret = body.googleClientSecret
    }

    // 聚合登陆
    const normalizeOptionalText = (value: any) => (typeof value === 'string' ? value.trim() : value)
    const storedAggregateLoginTypes = getAggregateOAuthLoginTypesOrDefault(
      settings?.aggregateOAuthLoginType
    )
    const nextAggregateLoginTypes =
      body.aggregateOAuthLoginType !== undefined
        ? normalizeAggregateOAuthLoginTypes(body.aggregateOAuthLoginType)
        : storedAggregateLoginTypes
    const nextAggregateAppId =
      body.aggregateOAuthAppId !== undefined
        ? normalizeOptionalText(body.aggregateOAuthAppId)
        : settings?.aggregateOAuthAppId
    const nextAggregateAppKey =
      body.aggregateOAuthAppKey !== undefined && body.aggregateOAuthAppKey !== SECRET_FIELD_MASK
        ? normalizeOptionalText(body.aggregateOAuthAppKey)
        : settings?.aggregateOAuthAppKey
    const nextAggregateEndpoint =
      body.aggregateOAuthEndpoint !== undefined
        ? normalizeOptionalText(body.aggregateOAuthEndpoint)
        : settings?.aggregateOAuthEndpoint || 'https://a.idcfx.net/connect.php'

    if (body.aggregateOAuthEnabled !== undefined) {
      if (typeof body.aggregateOAuthEnabled !== 'boolean') {
        throw createError({
          statusCode: 400,
          message: 'aggregateOAuthEnabled 必须是布尔值'
        })
      }
      updateData.aggregateOAuthEnabled = body.aggregateOAuthEnabled
    }

    if (nextAggregateOAuthEnabled && !nextAggregateAppId) {
      throw createError({ statusCode: 400, message: '启用聚合登陆时必须提供 AppID' })
    }
    if (nextAggregateOAuthEnabled && !nextAggregateAppKey) {
      throw createError({ statusCode: 400, message: '启用聚合登陆时必须提供 AppKey' })
    }
    if (nextAggregateOAuthEnabled && !nextAggregateEndpoint) {
      throw createError({ statusCode: 400, message: '启用聚合登陆时必须提供接口地址' })
    }
    if (nextAggregateOAuthEnabled && nextAggregateLoginTypes.length === 0) {
      throw createError({ statusCode: 400, message: '启用聚合登陆时至少选择一种登录方式' })
    }

    if (body.aggregateOAuthAppId !== undefined) {
      updateData.aggregateOAuthAppId = nextAggregateAppId || null
    }

    if (
      body.aggregateOAuthAppKey !== undefined &&
      body.aggregateOAuthAppKey !== SECRET_FIELD_MASK
    ) {
      updateData.aggregateOAuthAppKey = nextAggregateAppKey || null
    }

    if (body.aggregateOAuthLoginType !== undefined) {
      updateData.aggregateOAuthLoginType = JSON.stringify(nextAggregateLoginTypes)
    }

    if (body.aggregateOAuthEndpoint !== undefined) {
      if (nextAggregateEndpoint) {
        if (!isSafeAggregateOAuthUrl(nextAggregateEndpoint)) {
          throw createError({
            statusCode: 400,
            message: 'aggregateOAuthEndpoint 公网地址必须使用 HTTPS，内网地址可使用 HTTP'
          })
        }
      }
      updateData.aggregateOAuthEndpoint = nextAggregateEndpoint || 'https://a.idcfx.net/connect.php'
    }

    // Custom OAuth2
    if (body.customOAuthEnabled !== undefined) {
      if (typeof body.customOAuthEnabled !== 'boolean') {
        throw createError({
          statusCode: 400,
          message: 'customOAuthEnabled 必须是布尔值'
        })
      }
      if (body.customOAuthEnabled) {
        const requiredCustomFields = [
          { key: 'customOAuthAuthorizeUrl', label: '授权端点 URL' },
          { key: 'customOAuthTokenUrl', label: 'Token 端点 URL' },
          { key: 'customOAuthUserInfoUrl', label: '用户信息端点 URL' },
          { key: 'customOAuthClientId', label: 'Client ID' },
          { key: 'customOAuthClientSecret', label: 'Client Secret' },
          { key: 'customOAuthUserIdField', label: '用户 ID 字段名' }
        ]
        for (const field of requiredCustomFields) {
          if (!body[field.key] && !settings?.[field.key]) {
            throw createError({
              statusCode: 400,
              message: `启用自定义 OAuth2 登录时必须提供 ${field.label}`
            })
          }
        }
      }
      updateData.customOAuthEnabled = body.customOAuthEnabled
    }

    if (body.customOAuthDisplayName !== undefined) {
      updateData.customOAuthDisplayName = body.customOAuthDisplayName
    }

    if (body.customOAuthAuthorizeUrl !== undefined) {
      if (body.customOAuthAuthorizeUrl) {
        try {
          new URL(body.customOAuthAuthorizeUrl)
        } catch {
          throw createError({ statusCode: 400, message: 'customOAuthAuthorizeUrl 不是合法URL' })
        }
      }
      updateData.customOAuthAuthorizeUrl = body.customOAuthAuthorizeUrl
    }

    if (body.customOAuthTokenUrl !== undefined) {
      if (body.customOAuthTokenUrl) {
        try {
          new URL(body.customOAuthTokenUrl)
        } catch {
          throw createError({ statusCode: 400, message: 'customOAuthTokenUrl 不是合法URL' })
        }
      }
      updateData.customOAuthTokenUrl = body.customOAuthTokenUrl
    }

    if (body.customOAuthUserInfoUrl !== undefined) {
      if (body.customOAuthUserInfoUrl) {
        try {
          new URL(body.customOAuthUserInfoUrl)
        } catch {
          throw createError({ statusCode: 400, message: 'customOAuthUserInfoUrl 不是合法URL' })
        }
      }
      updateData.customOAuthUserInfoUrl = body.customOAuthUserInfoUrl
    }

    if (body.customOAuthScope !== undefined) {
      updateData.customOAuthScope = body.customOAuthScope
    }

    if (body.customOAuthClientId !== undefined) {
      updateData.customOAuthClientId = body.customOAuthClientId
    }

    if (
      body.customOAuthClientSecret !== undefined &&
      body.customOAuthClientSecret !== SECRET_FIELD_MASK
    ) {
      updateData.customOAuthClientSecret = body.customOAuthClientSecret
    }

    if (body.customOAuthUserIdField !== undefined) {
      updateData.customOAuthUserIdField = body.customOAuthUserIdField
    }

    if (body.customOAuthUsernameField !== undefined) {
      updateData.customOAuthUsernameField = body.customOAuthUsernameField
    }

    if (body.customOAuthNameField !== undefined) {
      updateData.customOAuthNameField = body.customOAuthNameField
    }

    if (body.customOAuthEmailField !== undefined) {
      updateData.customOAuthEmailField = body.customOAuthEmailField
    }

    if (body.customOAuthAvatarField !== undefined) {
      updateData.customOAuthAvatarField = body.customOAuthAvatarField
    }

    // 验证每日、每周和每月限额三选一逻辑
    const limitSettings = [
      body.dailySubmissionLimit,
      body.weeklySubmissionLimit,
      body.monthlySubmissionLimit
    ].filter((limit) => limit !== undefined && limit !== null)

    if (body.enableSubmissionLimit && limitSettings.length > 1) {
      throw createError({
        statusCode: 400,
        message: '每日限额、每周限额和每月限额只能选择其中一种，其他必须设置为空'
      })
    }

    if (!settings) {
      const newSettingsResult = await db
        .insert(systemSettings)
        .values({ ...SYSTEM_SETTINGS_DEFAULTS, ...updateData })
        .returning()
      settings = newSettingsResult[0]
    } else {
      // 如果存在，更新设置
      const updatedSettingsResult = await db
        .update(systemSettings)
        .set(updateData)
        .where(eq(systemSettings.id, settings.id))
        .returning()
      settings = updatedSettingsResult[0]
    }

    if (updateData.telemetryEnabled !== undefined) {
      try {
        const { setTelemetryEnabledCache } = await import('~~/server/utils/telemetry')
        setTelemetryEnabledCache(updateData.telemetryEnabled)
      } catch (telemetryError) {
        console.warn('[Telemetry] 遥测开关缓存更新失败:', telemetryError)
      }
    }

    const webPushIdentityChanged =
      (updateData.webPushEnabled !== undefined &&
        updateData.webPushEnabled !== settingsResult[0]?.webPushEnabled) ||
      (updateData.webPushPublicKey !== undefined &&
        updateData.webPushPublicKey !== settingsResult[0]?.webPushPublicKey) ||
      (updateData.webPushPrivateKey !== undefined &&
        updateData.webPushPrivateKey !== settingsResult[0]?.webPushPrivateKey)

    if (webPushIdentityChanged) {
      try {
        await db.delete(pushSubscriptions)
      } catch (subscriptionError) {
        console.warn('[WebPush] 清理旧设备订阅失败:', subscriptionError)
      }
    }

    try {
      const { invalidateWebPushConfiguration } = await import(
        '~~/server/services/webPushService'
      )
      invalidateWebPushConfiguration()
    } catch (webPushError) {
      console.warn('[WebPush] 配置缓存更新失败:', webPushError)
    }

    try {
      const { SmtpService } = await import('~~/server/services/smtpService')
      await SmtpService.getInstance().initializeSmtpConfig()
      console.log('[SMTP] SMTP配置已重新加载（更新系统设置）')
    } catch (smtpError) {
      console.warn('[SMTP] SMTP配置重载失败:', smtpError)
    }

    return maskSystemSettingsSecrets(settings)
  } catch (error) {
    console.error('更新系统设置失败:', error)

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      message: '更新系统设置失败'
    })
  }
})
