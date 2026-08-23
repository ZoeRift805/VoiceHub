#!/usr/bin/env node

import { spawn } from 'child_process'
import { config } from 'dotenv'
import { readFileSync, writeFileSync } from 'fs'
import path from 'path'

config({ path: path.resolve(process.cwd(), '.env'), quiet: true })

const BUILD_MEMORY_MB = 6144
const DEFAULT_NODE_OPTIONS = `--max-old-space-size=${BUILD_MEMORY_MB}`
const HIDDEN_VALUE = '[已隐藏]'
const SUPPORTED_AGGREGATE_LOGIN_TYPES = [
  'qq',
  'wx',
  'alipay',
  'sina',
  'baidu',
  'douyin',
  'huawei',
  'xiaomi',
  'gitee',
  'gitea',
  'bilibili',
  'kuaishou'
]
const SUPPORTED_ENV_VARIABLES = [
  'NODE_ENV',
  'NODE_OPTIONS',
  'NITRO_PRESET',
  'VERCEL',
  'VERCEL_ENV',
  'NETLIFY',
  'CF_PAGES',
  'CLOUDFLARE_WORKERS',
  'PREBUILT',
  'SKIP_INSTALL',
  'SKIP_BUILD',
  'CI',
  'DATABASE_URL',
  'JWT_SECRET',
  'REDIS_URL',
  'DEBUG_SQL',
  'WEBAUTHN_RP_ID',
  'WEBAUTHN_ORIGIN',
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'CASDOOR_CLIENT_ID',
  'CASDOOR_CLIENT_SECRET',
  'CASDOOR_ENDPOINT',
  'CASDOOR_ORGANIZATION_NAME',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'AGGREGATE_OAUTH_APP_ID',
  'AGGREGATE_OAUTH_APP_KEY',
  'AGGREGATE_OAUTH_LOGIN_TYPE',
  'AGGREGATE_OAUTH_ENDPOINT',
  'OAUTH_REDIRECT_URI',
  'OAUTH_STATE_SECRET',
  'NUXT_PUBLIC_HOST',
  'NUXT_PUBLIC_SITE_TITLE',
  'NUXT_PUBLIC_SITE_DESCRIPTION',
  'NUXT_PUBLIC_SITE_LOGO',
  'NUXT_PUBLIC_SEO_CONFIG',
  'SENTRY_DSN',
  'SENTRY_ENVIRONMENT',
  'SENTRY_RELEASE',
  'SENTRY_TRACES_SAMPLE_RATE',
  'NUXT_PUBLIC_SENTRY_DSN',
  'NUXT_PUBLIC_SENTRY_ENVIRONMENT',
  'NUXT_PUBLIC_SENTRY_RELEASE',
  'NUXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE',
  'NUXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE',
  'NUXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE',
  'VERCEL_GIT_COMMIT_SHA',
  'COMMIT_REF'
]

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m'
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

function isProvided(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function normalizeBlankEnvironment() {
  for (const name of SUPPORTED_ENV_VARIABLES) {
    const value = process.env[name]
    if (typeof value === 'string' && value.length > 0 && value.trim().length === 0) {
      delete process.env[name]
    }
  }
}

function providedState(value) {
  return isProvided(value) ? '已配置' : '未配置'
}

function strictBoolean(value) {
  return value === 'true'
}

function numberInUnitInterval(value, fallback) {
  if (!isProvided(value)) return { value: fallback, source: '默认值' }

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return { value: fallback, source: `无效值 ${JSON.stringify(value)}，已回退` }
  }

  return { value: parsed, source: `来自 ${JSON.stringify(value)}` }
}

function displayValue(value, fallback = '未配置') {
  return isProvided(value) ? JSON.stringify(value) : fallback
}

function hiddenValue(value) {
  return isProvided(value) ? HIDDEN_VALUE : '未配置'
}

function resolveAggregateLoginTypeState(value) {
  if (!isProvided(value)) return '使用 qq（默认值）'
  let values
  try {
    const parsed = JSON.parse(value)
    values = Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    values = value.split(',')
  }
  const normalized = [
    ...new Set(
      values
        .filter((item) => typeof item === 'string')
        .map((item) => item.trim().toLowerCase())
        .filter((item) => SUPPORTED_AGGREGATE_LOGIN_TYPES.includes(item))
    )
  ]
  return normalized.length > 0
    ? '配置有效（具体值已隐藏）'
    : '未识别到受支持的登录方式，导入时回退到 qq'
}

function printItem(name, rawState, result) {
  log(`  ${name}: ${rawState} -> ${result}`)
}

function printSensitiveItem(name, value, result) {
  printItem(name, hiddenValue(value), result ?? providedState(value))
}

function resolveNitroPreset() {
  if (process.env.VERCEL) return 'vercel（由 VERCEL 检测）'
  if (process.env.NETLIFY) return 'netlify（由 NETLIFY 检测）'
  if (
    process.env.CF_PAGES === '1' ||
    process.env.CLOUDFLARE_WORKERS === 'true' ||
    (process.env.CI === 'true' && !process.env.VERCEL && !process.env.NETLIFY)
  ) {
    return 'cloudflare_module（由 Cloudflare 检测）'
  }
  return `${process.env.NITRO_PRESET || 'node-server'}${process.env.NITRO_PRESET ? '' : '（默认值）'}`
}

function resolveNodeOptions(value) {
  const options = isProvided(value) ? value.trim() : ''
  const hasMemoryLimit = /(?:^|\s)--max[-_]old[-_]space[-_]size(?:=|\s|$)/.test(options)

  if (hasMemoryLimit) return options
  return options ? `${options} ${DEFAULT_NODE_OPTIONS}` : DEFAULT_NODE_OPTIONS
}

function resolveSeoConfig() {
  if (!isProvided(process.env.NUXT_PUBLIC_SEO_CONFIG)) {
    return { state: '未配置', result: '使用分项配置或默认值' }
  }

  try {
    const parsed = JSON.parse(process.env.NUXT_PUBLIC_SEO_CONFIG)
    const fields = ['title', 'shortName', 'description', 'logo'].filter((field) =>
      isProvided(parsed?.[field])
    )
    return {
      state: '已配置',
      result: fields.length > 0 ? `解析成功：${fields.join(', ')}` : '解析成功，但未提供有效字段'
    }
  } catch {
    return { state: '已配置', result: '解析失败，将回退到分项配置或默认值' }
  }
}

function printBuildEnvironment(rawNodeOptions) {
  const backendTraces = numberInUnitInterval(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.1)
  const frontendTraces = numberInUnitInterval(
    process.env.NUXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || process.env.SENTRY_TRACES_SAMPLE_RATE,
    0.1
  )
  const sessionReplay = numberInUnitInterval(
    process.env.NUXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE,
    0
  )
  const errorReplay = numberInUnitInterval(
    process.env.NUXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE,
    0
  )
  const production = process.env.NODE_ENV === 'production'
  const seoConfig = resolveSeoConfig()

  log('\n🔎 构建环境变量诊断', 'cyan')
  log('仅列出 VoiceHub 支持的变量；敏感值始终隐藏。', 'dim')

  log('\n构建与部署：', 'cyan')
  printItem('NODE_ENV', displayValue(process.env.NODE_ENV), process.env.NODE_ENV || '由 Nuxt 决定')
  printItem('NODE_OPTIONS', displayValue(rawNodeOptions), process.env.NODE_OPTIONS)
  printItem('NITRO_PRESET', displayValue(process.env.NITRO_PRESET), resolveNitroPreset())
  printItem('VERCEL', displayValue(process.env.VERCEL), process.env.VERCEL ? '已检测' : '未检测')
  printItem('VERCEL_ENV', displayValue(process.env.VERCEL_ENV), process.env.VERCEL_ENV || '未检测')
  printItem('NETLIFY', displayValue(process.env.NETLIFY), process.env.NETLIFY ? '已检测' : '未检测')
  printItem(
    'PREBUILT',
    displayValue(process.env.PREBUILT),
    strictBoolean(process.env.PREBUILT) ? '启用' : '停用'
  )
  printItem(
    'SKIP_INSTALL',
    displayValue(process.env.SKIP_INSTALL),
    strictBoolean(process.env.SKIP_INSTALL) ? '启用' : '停用'
  )
  printItem(
    'SKIP_BUILD',
    displayValue(process.env.SKIP_BUILD),
    strictBoolean(process.env.SKIP_BUILD) ? '启用' : '停用'
  )
  printItem('CI', displayValue(process.env.CI), process.env.CI ? 'CI 环境' : '非 CI 环境')

  log('\n服务能力：', 'cyan')
  printSensitiveItem('DATABASE_URL', process.env.DATABASE_URL)
  printSensitiveItem('JWT_SECRET', process.env.JWT_SECRET)
  printSensitiveItem(
    'REDIS_URL',
    process.env.REDIS_URL,
    isProvided(process.env.REDIS_URL) ? 'Redis 启用' : 'Redis 停用'
  )
  printItem(
    'DEBUG_SQL',
    displayValue(process.env.DEBUG_SQL),
    strictBoolean(process.env.DEBUG_SQL) ? '启用' : '停用'
  )
  printItem(
    'WEBAUTHN_RP_ID',
    displayValue(process.env.WEBAUTHN_RP_ID),
    providedState(process.env.WEBAUTHN_RP_ID)
  )
  printItem(
    'WEBAUTHN_ORIGIN',
    displayValue(process.env.WEBAUTHN_ORIGIN),
    providedState(process.env.WEBAUTHN_ORIGIN)
  )

  log('\nOAuth 环境变量（仅用于后台导入）：', 'cyan')
  printItem(
    'GitHub CLIENT_ID',
    hiddenValue(process.env.GITHUB_CLIENT_ID),
    isProvided(process.env.GITHUB_CLIENT_ID) ? 'OAuth 启用' : 'OAuth 停用'
  )
  printSensitiveItem('GitHub CLIENT_SECRET', process.env.GITHUB_CLIENT_SECRET)
  printItem(
    'Casdoor CLIENT_ID',
    hiddenValue(process.env.CASDOOR_CLIENT_ID),
    isProvided(process.env.CASDOOR_CLIENT_ID) ? 'OAuth 启用' : 'OAuth 停用'
  )
  printSensitiveItem('Casdoor CLIENT_SECRET', process.env.CASDOOR_CLIENT_SECRET)
  printItem(
    'Google CLIENT_ID',
    hiddenValue(process.env.GOOGLE_CLIENT_ID),
    isProvided(process.env.GOOGLE_CLIENT_ID) ? 'OAuth 启用' : 'OAuth 停用'
  )
  printSensitiveItem('Google CLIENT_SECRET', process.env.GOOGLE_CLIENT_SECRET)
  printItem(
    '聚合登陆 APP_ID',
    hiddenValue(process.env.AGGREGATE_OAUTH_APP_ID),
    isProvided(process.env.AGGREGATE_OAUTH_APP_ID) ? 'OAuth 启用' : 'OAuth 停用'
  )
  printSensitiveItem('聚合登陆 APP_KEY', process.env.AGGREGATE_OAUTH_APP_KEY)
  printSensitiveItem(
    'AGGREGATE_OAUTH_LOGIN_TYPE',
    process.env.AGGREGATE_OAUTH_LOGIN_TYPE,
    resolveAggregateLoginTypeState(process.env.AGGREGATE_OAUTH_LOGIN_TYPE)
  )
  printSensitiveItem(
    'AGGREGATE_OAUTH_ENDPOINT',
    process.env.AGGREGATE_OAUTH_ENDPOINT,
    isProvided(process.env.AGGREGATE_OAUTH_ENDPOINT)
      ? '使用自定义接口地址（值已隐藏）'
      : '使用默认接口地址'
  )
  printItem(
    'CASDOOR_ENDPOINT',
    displayValue(process.env.CASDOOR_ENDPOINT),
    providedState(process.env.CASDOOR_ENDPOINT)
  )
  printItem(
    'CASDOOR_ORGANIZATION_NAME',
    displayValue(process.env.CASDOOR_ORGANIZATION_NAME),
    process.env.CASDOOR_ORGANIZATION_NAME || 'built-in（默认值）'
  )
  printSensitiveItem('OAUTH_REDIRECT_URI', process.env.OAUTH_REDIRECT_URI)
  printSensitiveItem('OAUTH_STATE_SECRET', process.env.OAUTH_STATE_SECRET)

  log('\n站点公开配置：', 'cyan')
  printItem(
    'NUXT_PUBLIC_HOST',
    displayValue(process.env.NUXT_PUBLIC_HOST),
    providedState(process.env.NUXT_PUBLIC_HOST)
  )
  printItem(
    'NUXT_PUBLIC_SITE_TITLE',
    displayValue(process.env.NUXT_PUBLIC_SITE_TITLE),
    providedState(process.env.NUXT_PUBLIC_SITE_TITLE)
  )
  printItem(
    'NUXT_PUBLIC_SITE_DESCRIPTION',
    displayValue(process.env.NUXT_PUBLIC_SITE_DESCRIPTION),
    providedState(process.env.NUXT_PUBLIC_SITE_DESCRIPTION)
  )
  printItem(
    'NUXT_PUBLIC_SITE_LOGO',
    displayValue(process.env.NUXT_PUBLIC_SITE_LOGO),
    providedState(process.env.NUXT_PUBLIC_SITE_LOGO)
  )
  printItem('NUXT_PUBLIC_SEO_CONFIG', seoConfig.state, seoConfig.result)

  log('\nSentry：', 'cyan')
  printItem(
    '运行状态',
    displayValue(process.env.NODE_ENV),
    production ? '启用（仍受后台遥测开关控制）' : '停用'
  )
  printSensitiveItem(
    'SENTRY_DSN',
    process.env.SENTRY_DSN,
    isProvided(process.env.SENTRY_DSN) ? '使用自定义后端 DSN' : '使用内置后端 DSN'
  )
  printSensitiveItem(
    'NUXT_PUBLIC_SENTRY_DSN',
    process.env.NUXT_PUBLIC_SENTRY_DSN,
    isProvided(process.env.NUXT_PUBLIC_SENTRY_DSN) ? '使用自定义前端 DSN' : '使用内置前端 DSN'
  )
  printItem('SENTRY_TRACES_SAMPLE_RATE', backendTraces.source, backendTraces.value)
  printItem('NUXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE', frontendTraces.source, frontendTraces.value)
  printItem(
    'NUXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE',
    sessionReplay.source,
    sessionReplay.value
  )
  printItem(
    'NUXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE',
    errorReplay.source,
    errorReplay.value
  )
  printItem(
    'SENTRY_ENVIRONMENT',
    displayValue(process.env.SENTRY_ENVIRONMENT),
    process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development'
  )
  printItem(
    'NUXT_PUBLIC_SENTRY_ENVIRONMENT',
    displayValue(process.env.NUXT_PUBLIC_SENTRY_ENVIRONMENT),
    process.env.NUXT_PUBLIC_SENTRY_ENVIRONMENT ||
      process.env.SENTRY_ENVIRONMENT ||
      process.env.NODE_ENV ||
      'development'
  )
  printItem(
    'SENTRY_RELEASE',
    providedState(process.env.SENTRY_RELEASE),
    process.env.SENTRY_RELEASE ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.COMMIT_REF ||
      '未设置'
  )
  printItem(
    'NUXT_PUBLIC_SENTRY_RELEASE',
    providedState(process.env.NUXT_PUBLIC_SENTRY_RELEASE),
    process.env.NUXT_PUBLIC_SENTRY_RELEASE ||
      process.env.SENTRY_RELEASE ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.COMMIT_REF ||
      '未设置'
  )
  log('')
}

function runNuxtBuild() {
  return new Promise((resolve) => {
    let settled = false
    const finish = (success) => {
      if (settled) return
      settled = true
      resolve(success)
    }
    let child
    try {
      child = spawn(process.execPath, ['./node_modules/nuxt/bin/nuxt.mjs', 'build'], {
        stdio: 'inherit',
        env: process.env
      })
    } catch {
      finish(false)
      return
    }
    const forwardSignal = (signal) => {
      if (child.exitCode === null && child.signalCode === null) child.kill(signal)
    }
    const onSigterm = () => forwardSignal('SIGTERM')
    const onSigint = () => forwardSignal('SIGINT')
    const cleanup = () => {
      process.off('SIGTERM', onSigterm)
      process.off('SIGINT', onSigint)
    }

    process.once('SIGTERM', onSigterm)
    process.once('SIGINT', onSigint)
    child.once('error', () => {
      cleanup()
      finish(false)
    })
    child.once('exit', (code) => {
      cleanup()
      finish(code === 0)
    })
  })
}

function patchCloudflareEventEmitter() {
  const isCloudflare =
    process.env.NITRO_PRESET === 'cloudflare_module' ||
    (process.env.CI === 'true' && !process.env.VERCEL && !process.env.NETLIFY)
  if (!isCloudflare) return

  const eventEmitter = (name) =>
    `class ${name}{constructor(){this._listeners=new Map}on(e,t){let s=this._listeners.get(e);return s||(s=new Set,this._listeners.set(e,s)),s.add(t),this}addListener(e,t){return this.on(e,t)}once(e,t){const s=(...n)=>{this.removeListener(e,s),t(...n)};return this.on(e,s)}emit(e,...t){const s=this._listeners.get(e);if(!s)return!1;for(const n of[...s])n(...t);return s.size>0}removeListener(e,t){const s=this._listeners.get(e);return s?.delete(t),s?.size===0&&this._listeners.delete(e),this}off(e,t){return this.removeListener(e,t)}removeAllListeners(e){return void 0===e?this._listeners.clear():this._listeners.delete(e),this}listeners(e){return[...(this._listeners.get(e)||[])]}listenerCount(e){return this._listeners.get(e)?.size||0}}`

  const bundlePaths = [
    '.output/server/chunks/_/nitro.mjs',
    '.output/server/chunks/nitro/nitro.mjs'
  ]
  for (const relativePath of bundlePaths) {
    const bundlePath = path.resolve(process.cwd(), relativePath)
    let bundle
    try {
      bundle = readFileSync(bundlePath, 'utf8')
    } catch {
      continue
    }

    let patched = bundle.replace(
      /import\{EventEmitter as ([A-Za-z_$][\w$]*)\}from"node:events";/,
      (_, name) => eventEmitter(name)
    )
    // Cloudflare 的 nodejs_compat 对 node:stream 的默认导出可能是模块命名空间。
    // Nitro 已在 bundle 中生成 unenv 的 Readable/Writable，实现本地绑定以避免 extends Module。
    const streamImport = patched.match(
      /import ([A-Za-z_$][\w$]*),\{Readable as ([A-Za-z_$][\w$]*),Writable as ([A-Za-z_$][\w$]*)\}from"node:stream";/
    )
    if (streamImport) {
      const [, namespaceName, readableName, writableName] = streamImport
      patched = patched.replace(streamImport[0], `let ${namespaceName},${readableName},${writableName};`)
      patched = patched.replace(
        /const Ui=\(Object\.assign\(Li\.prototype,i\.prototype\),Object\.assign\(Li\.prototype,Di\.prototype\),Li\);/,
        `const Ui=(Object.assign(Li.prototype,i.prototype),Object.assign(Li.prototype,Di.prototype),Li);${namespaceName}={Readable:i,Writable:Di,Duplex:Ui};${readableName}=i;${writableName}=Di;`
      )
      patched = patched.replace(new RegExp(`extends ${readableName}\\b`, 'g'), 'extends i')
      patched = patched.replace(new RegExp(`extends ${writableName}\\b`, 'g'), 'extends Di')
    }
    const netImport = patched.match(
      /import\{Socket as ([A-Za-z_$][\w$]*),isIP as ([A-Za-z_$][\w$]*)\}from"node:net";/
    )
    if (netImport) {
      const [, socketName, isIpName] = netImport
      patched = patched.replace(netImport[0], `let ${socketName},${isIpName};`)
      patched = patched.replace(
        /const Ui=\(Object\.assign\(Li\.prototype,i\.prototype\),Object\.assign\(Li\.prototype,Di\.prototype\),Li\);/,
        `const Ui=(Object.assign(Li.prototype,i.prototype),Object.assign(Li.prototype,Di.prototype),Li);${socketName}=Socket;${isIpName}=isIP;`
      )
    }
    // Cloudflare 会把未识别的 Node 内置模块绑定转换为模块命名空间，禁止其作为父类。
    const importedBindings = new Set()
    for (const match of patched.matchAll(/import\*as ([A-Za-z_$][\w$]*) from"node:[^"]+";/g)) {
      importedBindings.add(match[1])
    }
    for (const match of patched.matchAll(/import\{([^}]+)\}from"node:[^"]+";/g)) {
      for (const part of match[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/).at(-1)
        if (name) importedBindings.add(name)
      }
    }
    for (const name of importedBindings) {
      const inherited = new RegExp(`class ([A-Za-z_$][\\w$]*) extends ${name}\\b`, 'g')
      patched = patched.replace(inherited, 'class $1 extends Object')
    }
    if (patched !== bundle) {
      writeFileSync(bundlePath, patched)
      log(`已应用 Cloudflare Node 兼容补丁：${relativePath}`, 'dim')
    }
  }
}

async function build() {
  const rawNodeOptions = process.env.NODE_OPTIONS
  normalizeBlankEnvironment()
  if (
    !process.env.NITRO_PRESET &&
    process.env.CI === 'true' &&
    !process.env.VERCEL &&
    !process.env.NETLIFY
  ) {
    process.env.NITRO_PRESET = 'cloudflare_module'
  }
  process.env.NODE_OPTIONS = resolveNodeOptions(rawNodeOptions)
  printBuildEnvironment(rawNodeOptions)

  if (process.argv.includes('--diagnostics-only')) return

  log('🔨 开始执行 Nuxt 构建...', 'cyan')
  if (!(await runNuxtBuild())) throw new Error('Nuxt 构建失败')
  patchCloudflareEventEmitter()
  log('✅ Nuxt 构建完成', 'green')
}

build().catch((error) => {
  log(`❌ ${error.message}`, 'yellow')
  process.exit(1)
})
