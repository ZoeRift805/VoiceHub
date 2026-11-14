import { defineEventHandler, createError, getQuery } from 'h3'
import { verifyAdminAuth } from '~~/server/utils/auth'
import { getOperationsMetrics } from '~~/server/utils/operations-metrics'
import { getRedisStats } from '~~/server/utils/redis'
import { databaseManager } from '~~/server/utils/database-manager'
import { getMusicSseStats } from '~~/server/api/music/websocket'
import { getProgressSseStats } from '~~/server/api/progress/events'
import { getServerDate, getServerTimestamp } from '~~/server/utils/serverTime'

let sentryCache: { expiresAt: number; value: any } | null = null
let sentryRequestInFlight: Promise<any> | null = null

const getSentryIssues = async () => {
  const token = process.env.SENTRY_AUTH_TOKEN?.trim()
  const organization = process.env.SENTRY_ORG?.trim()
  const project = process.env.SENTRY_PROJECT?.trim()
  if (!token || !organization || !project) {
    return { configured: false, issues: [] }
  }

  if (sentryCache && sentryCache.expiresAt > getServerTimestamp()) return sentryCache.value

  if (sentryRequestInFlight) return sentryRequestInFlight

  sentryRequestInFlight = (async () => {
    try {
      const baseUrl = (process.env.SENTRY_API_URL || 'https://sentry.io/api/0').replace(/\/$/, '')
      const response = await fetch(`${baseUrl}/projects/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/issues/?query=is%3Aunresolved&limit=10`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(1000)
      })
      if (!response.ok) throw new Error(`Sentry API ${response.status}`)
      const issues = await response.json() as Array<any>
      const value = {
        configured: true,
        available: true,
        issues: issues.map((issue) => ({ id: issue.id, title: issue.title, level: issue.level, count: issue.count, lastSeen: issue.lastSeen }))
      }
      sentryCache = { value, expiresAt: getServerTimestamp() + 30_000 }
      return value
    } catch (error) {
      const value = { configured: true, available: false, error: error instanceof Error ? error.message : 'Sentry 查询失败', issues: [] }
      sentryCache = { value, expiresAt: getServerTimestamp() + 30_000 }
      return value
    } finally {
      sentryRequestInFlight = null
    }
  })()
  return sentryRequestInFlight
}

export default defineEventHandler(async (event) => {
  const authResult = await verifyAdminAuth(event)
  if (!authResult.success) {
    throw createError({ statusCode: 401, message: authResult.message })
  }

  const query = getQuery(event)
  const requestId = String(query.requestId || '').trim()
  const requestedScope = String(query.details || '').trim()
  const detailScope = ['overview', 'database', 'debug', 'logs'].includes(requestedScope)
    ? requestedScope
    : requestedScope === 'true'
      ? 'all'
      : ''
  const includeDatabaseOverview = ['overview', 'database', 'all'].includes(detailScope)
  const includeDatabaseDetails = detailScope === 'database' || detailScope === 'all'
  const includeLogDetails = ['debug', 'logs', 'all'].includes(detailScope)
  const includeSentryDetails = ['debug', 'all'].includes(detailScope)

  // 按请求 ID 下钻只查询链路数据，避免再次触发整套监控采集。
  if (requestId) {
    const entries = await databaseManager.getRequestDiagnostics(requestId).catch(() => [])
    return {
      success: true,
      data: {
        diagnostic: { requestId, entries }
      }
    }
  }

  // 首屏只返回进程内指标；数据库聚合按分区请求，诊断仅在数据库分区执行。
  const [overview, diagnostics, persistedRequests, recentLogs, sentry] = await Promise.allSettled([
    includeDatabaseOverview ? databaseManager.getOperationsOverview() : Promise.resolve(null),
    includeDatabaseDetails ? databaseManager.getDiagnostics() : Promise.resolve(null),
    includeLogDetails ? databaseManager.getPersistedRequestSamples() : Promise.resolve(null),
    includeLogDetails ? databaseManager.getRecentApiLogs() : Promise.resolve(null),
    ['debug', 'all'].includes(detailScope) ? getSentryIssues() : Promise.resolve(null)
  ])

  const databaseMetrics: Record<string, unknown> = overview.status === 'fulfilled'
    ? { ...overview.value }
    : { pool: null, performance: null, businessQueue: null, apiKeyUsage: null, timeline: null }
  if (includeDatabaseDetails) {
    databaseMetrics.diagnostics = diagnostics.status === 'fulfilled' ? diagnostics.value : null
  }
  if (includeLogDetails) {
    databaseMetrics.persistedRequests = persistedRequests.status === 'fulfilled' ? persistedRequests.value : null
    databaseMetrics.recentLogs = recentLogs.status === 'fulfilled' ? recentLogs.value : null
  }

  return {
    success: true,
    data: {
      system: {
        timestamp: getServerDate().toISOString(),
        uptime: process.uptime(),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          external: Math.round(process.memoryUsage().external / 1024 / 1024)
        }
      },
      metrics: getOperationsMetrics(),
      redis: getRedisStats(),
      sse: {
        music: getMusicSseStats(),
        progress: getProgressSseStats()
      },
      database: databaseMetrics,
      collectedAt: getServerTimestamp(),
      ...(includeSentryDetails ? { sentry: sentry.status === 'fulfilled' && sentry.value ? sentry.value : { configured: false, issues: [] } } : {})
    }
  }
})
