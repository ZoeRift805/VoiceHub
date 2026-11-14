import { db, getConnectionStatus } from '~/drizzle/db'
import { sql } from 'drizzle-orm'
import {
  getConnectionPoolStatus,
  getDatabaseMetrics,
  getDatabaseDiagnostics
} from './database-health'
import { getServerDate, getServerTimestamp } from '~~/server/utils/serverTime'

/**
 * 数据库管理器
 */
export class DatabaseManager {
  private static instance: DatabaseManager
  private healthCheckCache: { status: boolean; timestamp: number; latency: number } | null = null
  private readonly CACHE_TTL = 30000 // 30秒缓存
  private readonly OPERATIONS_CACHE_TTL = 5000
  private readonly operationsCache = new Map<string, { expiresAt: number; value: unknown }>()
  private readonly operationsInFlight = new Map<string, Promise<unknown>>()

  private constructor() {}

  private async withOperationsCache<T>(key: string, loader: () => Promise<T>, ttl = this.OPERATIONS_CACHE_TTL): Promise<T> {
    const now = getServerTimestamp()
    for (const [cacheKey, entry] of this.operationsCache) {
      if (entry.expiresAt <= now) this.operationsCache.delete(cacheKey)
    }
    const cached = this.operationsCache.get(key)
    if (cached && cached.expiresAt > now) return cached.value as T

    const pending = this.operationsInFlight.get(key) as Promise<T> | undefined
    if (pending) return pending
    if (this.operationsCache.size >= 100) {
      const oldestKey = this.operationsCache.keys().next().value
      if (oldestKey) this.operationsCache.delete(oldestKey)
    }

    const request = loader()
      .then((value) => {
        this.operationsCache.set(key, { value, expiresAt: getServerTimestamp() + ttl })
        return value
      })
      .finally(() => {
        this.operationsInFlight.delete(key)
      })
    this.operationsInFlight.set(key, request)
    return request
  }

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager()
    }
    return DatabaseManager.instance
  }

  /**
   * 数据库健康检查（带缓存）
   */
  async healthCheck(): Promise<{
    status: boolean
    latency: number
    timestamp: Date
    connectionStatus: string
    error?: string
  }> {
    const now = getServerTimestamp()

    // 检查缓存
    if (this.healthCheckCache && now - this.healthCheckCache.timestamp < this.CACHE_TTL) {
      return {
        status: this.healthCheckCache.status,
        latency: this.healthCheckCache.latency,
        timestamp: new Date(this.healthCheckCache.timestamp),
        connectionStatus: 'cached'
      }
    }

    const startTime = getServerTimestamp()
    try {
      // 获取连接状态
      const connectionStatus = await getConnectionStatus()

      // 执行简单查询测试连接
      await db.execute(sql`SELECT 1 as health_check`)

      const latency = getServerTimestamp() - startTime
      const result = {
        status: true,
        latency,
        timestamp: getServerDate(),
        connectionStatus: connectionStatus.status
      }

      // 更新缓存
      this.healthCheckCache = {
        status: true,
        timestamp: now,
        latency
      }

      return result
    } catch (error) {
      const latency = getServerTimestamp() - startTime
      const result = {
        status: false,
        latency,
        timestamp: getServerDate(),
        connectionStatus: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      }

      // 更新缓存
      this.healthCheckCache = {
        status: false,
        timestamp: now,
        latency
      }

      return result
    }
  }

  /**
   * 获取基础数据库信息 - 简化版本适配 Neon Database
   */
  async getBasicMetrics(): Promise<{
    databaseSize: string
    activeConnections: number
    serverless: boolean
  }> {
    try {
      // 获取数据库大小
      const sizeResult = await db.execute(sql`
        SELECT pg_size_pretty(pg_database_size(current_database())) as database_size
      `)

      // 获取当前连接数（简化版）
      const connectionStats = await db.execute(sql`
        SELECT count(*) as active_connections
        FROM pg_stat_activity
        WHERE datname = current_database() AND state = 'active'
      `)

      const sizeRow = sizeResult[0] as { database_size?: string } | undefined
      const connectionRow = connectionStats[0] as { active_connections?: number | string } | undefined

      return {
        databaseSize: sizeRow?.database_size || 'Unknown',
        activeConnections:
          Number.parseInt(String(connectionRow?.active_connections ?? '0'), 10) || 0,
        serverless: true // Neon Database 是无服务器架构
      }
    } catch (error) {
      console.error('[DatabaseManager] Failed to get basic metrics:', error)
      throw new Error(
        `Failed to retrieve basic metrics: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { cause: error }
      )
    }
  }

  /**
   * 获取连接状态 - 适配 Neon Database 无服务器架构
   */
  async getConnectionStatus(): Promise<{
    connected: boolean
    status: string
    activeConnections: number
    serverlessMode: boolean
    autoSuspend: boolean
    error: string | null
  }> {
    return this.withOperationsCache('connection-status', async () => {
      try {
        const connectionStatus = await getConnectionStatus()

        // 用最小查询判断真实连通性，避免底层连接对象状态或统计查询误判。
        await db.execute(sql`SELECT 1 as connection_check`)

        // 获取当前活跃连接数
        let activeConnections = 0
        try {
          const connectionStats = await db.execute(sql`
            SELECT count(*) as active_connections
            FROM pg_stat_activity
            WHERE datname = current_database() AND state = 'active'
          `)

          const connRow = connectionStats[0] as { active_connections?: number | string } | undefined
          activeConnections = Number.parseInt(String(connRow?.active_connections ?? '0'), 10) || 0
        } catch (metricsError) {
          console.warn('Failed to get active connection count:', metricsError)
        }

        return {
          connected: true,
          status: connectionStatus.status || 'connected',
          activeConnections,
          serverlessMode: true, // Neon Database 是无服务器架构
          autoSuspend: true, // 支持自动暂停
          error: null
        }
      } catch (error) {
        console.error('Failed to get connection status:', error)
        return {
          connected: false,
          status: 'error',
          activeConnections: 0,
          serverlessMode: true,
          autoSuspend: true,
          error: error instanceof Error ? error.message : 'Failed to retrieve connection status'
        }
      }
    })
  }

  /**
   * 获取连接池状态
   */
  async getConnectionPoolStatus() {
    return this.withOperationsCache('pool', getConnectionPoolStatus)
  }

  /**
   * 获取数据库性能指标
   */
  async getPerformanceMetrics() {
    return this.withOperationsCache('performance', getDatabaseMetrics)
  }

  async getDiagnostics() {
    return this.withOperationsCache('diagnostics', getDatabaseDiagnostics)
  }

  async getBusinessQueueStats() {
    return this.withOperationsCache('business-queue', async () => {
      const result = await db.execute(sql`
        SELECT count(*)::int AS pending_count, min("createdAt") AS oldest_created_at
        FROM "Song"
        WHERE played = false
      `)
      const row = result[0] as { pending_count?: number | string; oldest_created_at?: Date | string | null } | undefined
      return {
        pendingCount: Number(row?.pending_count || 0),
        oldestCreatedAt: row?.oldest_created_at || null
      }
    })
  }

  async getApiKeyUsageStats() {
    return this.withOperationsCache('api-key-usage', async () => {
      const result = await db.execute(sql`
        SELECT count(*)::int AS calls,
          count(*) FILTER (WHERE "status_code" >= 400)::int AS failures
        FROM api_logs
        WHERE "created_at" >= now() - interval '5 minutes' AND "api_key_id" IS NOT NULL
      `)
      const row = result[0] as { calls?: number | string; failures?: number | string } | undefined
      const calls = Number(row?.calls || 0)
      const failures = Number(row?.failures || 0)
      return {
        calls,
        failureRate: calls ? Number((failures / calls * 100).toFixed(2)) : null
      }
    })
  }

  async getPersistedRequestSamples() {
    return this.withOperationsCache('persisted-request-samples', async () => db.execute(sql`
      SELECT "created_at" AS at, "endpoint" AS route, "status_code" AS status,
        "response_time_ms" AS "durationMs",
        substring("error_message" from 'requestId=([^ ]+)') AS "requestId"
      FROM api_logs
      WHERE "api_key_id" IS NULL
        AND "error_message" LIKE '%requestId=%'
      ORDER BY "created_at" DESC
      LIMIT 50
    `))
  }

  async getRecentApiLogs() {
    return this.withOperationsCache('recent-api-logs', () => db.execute(sql`
      SELECT "id", "created_at" AS at, "endpoint" AS route, "method", "status_code" AS status,
        "response_time_ms" AS "durationMs",
        left(CASE
          WHEN nullif("error_message", '') IS NOT NULL THEN "error_message"
          WHEN nullif("response_body", '') IS NOT NULL THEN "response_body"
          ELSE concat("method", ' ', "endpoint", ' -> ', "status_code")
        END, 4000) AS message,
        substring("error_message" from 'requestId=([^ ]+)') AS "requestId"
      FROM api_logs
      ORDER BY "created_at" DESC
      LIMIT 100
    `))
  }

  async getRequestDiagnostics(requestId: string) {
    const normalized = String(requestId || '').trim()
    if (!normalized) return []
    return this.withOperationsCache(`request-diagnostics:${normalized}`, () => db.execute(sql`
      SELECT "id", "created_at" AS at, "endpoint" AS route, "method", "status_code" AS status,
        "response_time_ms" AS "durationMs",
        left(CASE
          WHEN nullif("error_message", '') IS NOT NULL THEN "error_message"
          WHEN nullif("response_body", '') IS NOT NULL THEN "response_body"
          ELSE concat("method", ' ', "endpoint", ' -> ', "status_code")
        END, 4000) AS message,
        substring("error_message" from 'requestId=([^ ]+)') AS "requestId"
      FROM api_logs
      WHERE "error_message" LIKE ${`%requestId=${normalized}%`}
      ORDER BY "created_at" ASC
      LIMIT 100
    `), 3000)
  }

  async getOperationsMetricTimeline() {
    return this.withOperationsCache('operations-timeline', () => db.execute(sql`
      SELECT bucket_start AS at,
        sum(request_count)::int AS requests,
        sum(server_error_count)::int AS errors,
        round(sum(total_duration_ms)::numeric / nullif(sum(request_count), 0), 2) AS average_duration_ms,
        max(max_duration_ms)::int AS max_duration_ms
      FROM operations_metric_buckets
      WHERE bucket_start >= now() - interval '60 minutes'
      GROUP BY bucket_start
      ORDER BY bucket_start ASC
    `))
  }

  async getOperationsOverview() {
    return this.withOperationsCache('operations-overview', async () => {
      const startedAt = getServerTimestamp()
      const result = await db.execute(sql`
        WITH pool AS (
          SELECT
            (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS max_connections,
            count(*) FILTER (WHERE state = 'active')::int AS active_connections,
            count(*)::int AS total_connections
          FROM pg_stat_activity
        ),
        performance AS (
          SELECT
            numbackends AS active_connections,
            xact_commit AS transactions_committed,
            xact_rollback AS transactions_rolled_back,
            blks_read AS blocks_read,
            blks_hit AS blocks_hit
          FROM pg_stat_database
          WHERE datname = current_database()
        ),
        business_queue AS (
          SELECT count(*)::int AS pending_count, min("createdAt") AS oldest_created_at
          FROM "Song"
          WHERE played = false
        ),
        api_key_usage AS (
          SELECT count(*)::int AS calls,
            count(*) FILTER (WHERE "status_code" >= 400)::int AS failures
          FROM api_logs
          WHERE "created_at" >= now() - interval '5 minutes' AND "api_key_id" IS NOT NULL
        ),
        timeline AS (
          SELECT bucket_start AS at,
            sum(request_count)::int AS requests,
            sum(server_error_count)::int AS errors,
            round(sum(total_duration_ms)::numeric / nullif(sum(request_count), 0), 2) AS average_duration_ms,
            max(max_duration_ms)::int AS max_duration_ms
          FROM operations_metric_buckets
          WHERE bucket_start >= now() - interval '60 minutes'
          GROUP BY bucket_start
          ORDER BY bucket_start ASC
        )
        SELECT
          (SELECT row_to_json(pool) FROM pool) AS pool,
          (SELECT row_to_json(performance) FROM performance) AS performance,
          (SELECT row_to_json(business_queue) FROM business_queue) AS business_queue,
          (SELECT row_to_json(api_key_usage) FROM api_key_usage) AS api_key_usage,
          COALESCE((SELECT json_agg(timeline ORDER BY timeline.at) FROM timeline), '[]'::json) AS timeline
      `)
      const row = result[0] as Record<string, any> | undefined
      const pool = row?.pool || {}
      const performance = row?.performance || {}
      const businessQueue = row?.business_queue || {}
      const apiKeyUsage = row?.api_key_usage || {}
      const maxConnections = Number(pool.max_connections || 0)
      const totalConnections = Number(pool.total_connections || 0)
      const calls = Number(apiKeyUsage.calls || 0)
      const blocksRead = Number(performance.blocks_read || 0)
      const blocksHit = Number(performance.blocks_hit || 0)
      return {
        pool: {
          maxConnections,
          activeConnections: Number(pool.active_connections || 0),
          totalConnections,
          utilization: maxConnections ? ((totalConnections / maxConnections) * 100).toFixed(2) : '0'
        },
        performance: {
          responseTime: getServerTimestamp() - startedAt,
          activeConnections: Number(performance.active_connections || 0),
          transactionsCommitted: Number(performance.transactions_committed || 0),
          transactionsRolledBack: Number(performance.transactions_rolled_back || 0),
          cacheHitRatio: blocksRead || blocksHit ? ((blocksHit / (blocksHit + blocksRead)) * 100).toFixed(2) : '0'
        },
        businessQueue: {
          pendingCount: Number(businessQueue.pending_count || 0),
          oldestCreatedAt: businessQueue.oldest_created_at || null
        },
        apiKeyUsage: {
          calls,
          failureRate: calls ? Number((Number(apiKeyUsage.failures || 0) / calls * 100).toFixed(2)) : null
        },
        timeline: row?.timeline || []
      }
    })
  }

  /**
   * 批量清理过期会话
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      const result = await db.execute(sql`
        DELETE FROM user_sessions
        WHERE expires_at < NOW()
          OR revoked_at < NOW() - interval '30 days'
      `)

      // postgres-js returns count in the result array object properties
      const deleteResult = result as { count?: number | string }
      return Number.parseInt(String(deleteResult.count ?? '0'), 10) || 0
    } catch (error) {
      console.error('Failed to cleanup expired sessions:', error)
      throw new Error('Failed to cleanup expired sessions', { cause: error })
    }
  }

  /**
   * 清除健康检查缓存
   */
  clearHealthCheckCache(): void {
    this.healthCheckCache = null
  }

  /**
   * 获取数据库管理器状态
   */
  getManagerStatus(): {
    cacheEnabled: boolean
    cacheTTL: number
    lastHealthCheck: Date | null
  } {
    return {
      cacheEnabled: true,
      cacheTTL: this.CACHE_TTL,
      lastHealthCheck: this.healthCheckCache ? new Date(this.healthCheckCache.timestamp) : null
    }
  }
}

// 导出单例实例
export const databaseManager = DatabaseManager.getInstance()
