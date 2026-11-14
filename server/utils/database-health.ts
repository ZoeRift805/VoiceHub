import { db, testConnection } from '~/drizzle/db'
import { sql } from 'drizzle-orm'
import { getServerDate, getServerTimestamp } from '~~/server/utils/serverTime'

// 数据库健康检查
export async function checkDatabaseHealth() {
  try {
    const startTime = getServerTimestamp()

    // 基本连接测试
    const isConnected = await testConnection()
    if (!isConnected) {
      return {
        status: 'unhealthy',
        message: 'Database connection failed',
        responseTime: getServerTimestamp() - startTime
      }
    }

    // 查询测试
    await db.execute(sql`SELECT 1 as test`)

    const responseTime = getServerTimestamp() - startTime

    return {
      status: responseTime < 1000 ? 'healthy' : 'slow',
      message: responseTime < 1000 ? 'Database is healthy' : 'Database is responding slowly',
      responseTime
    }
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown database error',
      responseTime: 0
    }
  }
}

// 数据库连接重试机制
export async function retryDatabaseOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error')

      if (attempt === maxRetries) {
        throw lastError
      }

      // 等待后重试
      await new Promise((resolve) => setTimeout(resolve, delay * attempt))
    }
  }

  throw lastError!
}

// 数据库连接池状态检查
export async function getConnectionPoolStatus() {
  try {
    const result = await db.execute(sql`
      SELECT
        (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS max_connections,
        count(*) FILTER (WHERE state = 'active')::int AS active_connections,
        count(*)::int AS total_connections
      FROM pg_stat_activity
    `)

    const row = result[0] as { max_connections?: number | string; active_connections?: number | string; total_connections?: number | string } | undefined
    const maxConnections = Number(row?.max_connections || 0)
    const activeConnections = Number(row?.active_connections || 0)
    const totalConnections = Number(row?.total_connections || 0)

    return {
      maxConnections,
      activeConnections,
      totalConnections,
      utilization: maxConnections ? ((totalConnections / maxConnections) * 100).toFixed(2) : '0'
    }
  } catch (error) {
    throw new Error(
      `Failed to get connection pool status: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { cause: error }
    )
  }
}

// 数据库性能指标
export async function getDatabaseMetrics() {
  try {
    const startTime = getServerTimestamp()
    const stats = await db.execute(sql`
      SELECT
        1 AS health_check,
        numbackends as active_connections,
        xact_commit as transactions_committed,
        xact_rollback as transactions_rolled_back,
        blks_read as blocks_read,
        blks_hit as blocks_hit
      FROM pg_stat_database 
      WHERE datname = current_database()
    `)
    const responseTime = getServerTimestamp() - startTime

    const stat = stats[0] as {
      active_connections?: number | string
      transactions_committed?: number | string
      transactions_rolled_back?: number | string
      blocks_read?: number | string
      blocks_hit?: number | string
    } | undefined
    const blocksRead = Number(stat?.blocks_read || 0)
    const blocksHit = Number(stat?.blocks_hit || 0)

    return {
      responseTime,
      activeConnections: Number(stat?.active_connections || 0),
      transactionsCommitted: Number(stat?.transactions_committed || 0),
      transactionsRolledBack: Number(stat?.transactions_rolled_back || 0),
      cacheHitRatio:
        blocksRead || blocksHit
          ? ((blocksHit / (blocksHit + blocksRead)) * 100).toFixed(2)
          : '0'
    }
  } catch (error) {
    throw new Error(
      `Failed to get database metrics: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { cause: error }
    )
  }
}

// 托管 PostgreSQL 可能限制统计视图；单项无权限时显式返回不可用。
const diagnosticQuery = async (query: ReturnType<typeof sql>) => {
  try {
    return { available: true, data: await db.execute(query) }
  } catch (error) {
    return { available: false, data: [], reason: error instanceof Error ? error.message : '查询不可用' }
  }
}

export async function getDatabaseDiagnostics() {
  const [activity, locks, tables, size] = await Promise.all([
    diagnosticQuery(sql`SELECT pid, usename AS user_name, state, wait_event_type, wait_event, now() - query_start AS duration, left(query, 300) AS query FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND state <> 'idle' ORDER BY query_start ASC LIMIT 20`),
    diagnosticQuery(sql`SELECT blocked.pid AS blocked_pid, blocker.pid AS blocking_pid, now() - blocked.query_start AS wait_duration, left(blocked.query, 220) AS blocked_query, left(blocker.query, 220) AS blocking_query FROM pg_locks blocked_lock JOIN pg_stat_activity blocked ON blocked.pid = blocked_lock.pid JOIN pg_locks blocker_lock ON blocker_lock.locktype = blocked_lock.locktype AND blocker_lock.database IS NOT DISTINCT FROM blocked_lock.database AND blocker_lock.relation IS NOT DISTINCT FROM blocked_lock.relation AND blocker_lock.page IS NOT DISTINCT FROM blocked_lock.page AND blocker_lock.tuple IS NOT DISTINCT FROM blocked_lock.tuple AND blocker_lock.transactionid IS NOT DISTINCT FROM blocked_lock.transactionid AND blocker_lock.pid <> blocked_lock.pid JOIN pg_stat_activity blocker ON blocker.pid = blocker_lock.pid WHERE NOT blocked_lock.granted AND blocker_lock.granted LIMIT 20`),
    diagnosticQuery(sql`SELECT relname AS table_name, n_live_tup AS live_rows, n_dead_tup AS dead_rows, pg_total_relation_size(relid) AS total_bytes, pg_indexes_size(relid) AS index_bytes, CASE WHEN n_live_tup > 0 THEN round(n_dead_tup::numeric / n_live_tup * 100, 2) ELSE 0 END AS dead_row_ratio FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 20`),
    diagnosticQuery(sql`SELECT pg_database_size(current_database()) AS database_bytes, pg_size_pretty(pg_database_size(current_database())) AS database_size`)
  ])

  return { activity, locks, tables, size, collectedAt: getServerDate().toISOString() }
}

// 数据库备份状态检查（模拟）
export async function checkBackupStatus() {
  // 这里可以集成实际的备份服务
  return {
    lastBackup: getServerDate().toISOString(),
    status: 'completed',
    size: '0 MB' // 模拟数据
  }
}
