<!-- app/components/CaptchaWidget.vue -->
<template>
  <div v-if="props.enabled && props.siteKey" ref="containerRef" style="min-height: 65px;"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'

const props = defineProps<{
  siteKey: string
  enabled: boolean
}>()

const emit = defineEmits<{
  (e: 'verify', token: string): void
  (e: 'error', err: any): void
  (e: 'expired'): void
}>()

const containerRef = ref<HTMLElement>()
const widgetId = ref<string>('')
let scriptLoaded = false
let scriptLoadingPromise: Promise<void> | null = null

// 动态加载 Turnstile 脚本 (仅加载一次)
function loadTurnstileScript(): Promise<void> {
  if (scriptLoaded) return Promise.resolve()
  if (scriptLoadingPromise) return scriptLoadingPromise

  if (window.turnstile) {
    scriptLoaded = true
    return Promise.resolve()
  }

  // 检查脚本是否已插入
  const existingScript = document.querySelector(
    'script[src="https://challenges.cloudflare.com/turnstile/v0/api.js"]'
  )
  if (existingScript) {
    return new Promise((resolve) => {
      existingScript.addEventListener('load', () => {
        scriptLoaded = true
        resolve()
      })
    })
  }

  // 插入新脚本
  scriptLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
    script.async = true
    script.defer = true
    script.onload = () => {
      scriptLoaded = true
      resolve()
    }
    script.onerror = (err) => {
      console.error('[CaptchaWidget] 脚本加载失败:', err)
      reject(err)
    }
    document.head.appendChild(script)
  })
  return scriptLoadingPromise
}

// 渲染小组件
function renderWidget() {
  if (!containerRef.value || !props.enabled || !props.siteKey) return
  if (!window.turnstile) {
    console.warn('[CaptchaWidget] window.turnstile 不可用，等待脚本加载')
    return
  }

  // 清除旧实例
  if (widgetId.value) {
    window.turnstile.remove(widgetId.value)
    widgetId.value = ''
  }
  containerRef.value.innerHTML = ''

  widgetId.value = window.turnstile.render(containerRef.value, {
    sitekey: props.siteKey,
    theme: 'auto',
    size: 'normal',
    callback: (token: string) => {
      emit('verify', token)
    },
    'error-callback': (err: any) => {
      console.error('[CaptchaWidget] 小组件错误:', err)
      emit('error', err)
    },
    'expired-callback': () => {
      emit('expired')
    },
  })
}

// 外部可调用的重置方法
function resetWidget() {
  if (widgetId.value) {
    window.turnstile?.remove(widgetId.value)
    widgetId.value = ''
  }
  if (containerRef.value) {
    containerRef.value.innerHTML = ''
  }
  nextTick(() => {
    renderWidget()
  })
}

defineExpose({
  reset: resetWidget,
})

onMounted(async () => {
  if (!props.enabled) return
  await loadTurnstileScript()
  nextTick(() => {
    // 额外延迟确保 EdgeOne 环境下的 DOM 完全就绪
    setTimeout(() => {
      renderWidget()
    }, 100)
  })
})

onBeforeUnmount(() => {
  if (widgetId.value) {
    window.turnstile?.remove(widgetId.value)
  }
})
</script>
