<template>
  <div
    v-if="enabled && siteKey"
    ref="containerRef"
    class="captcha-container flex justify-center"
  ></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'

const props = defineProps<{
  siteKey: string
  enabled: boolean
  provider?: 'turnstile' | 'hcaptcha'
  theme?: 'light' | 'dark' | 'auto'
  size?: 'normal' | 'compact'
}>()

const emit = defineEmits<{
  (e: 'verify', token: string): void
  (e: 'error', err: any): void
  (e: 'expired'): void
}>()

const containerRef = ref<HTMLElement>()
const widgetId = ref('')
const scriptLoaded = ref(false)

// 动态加载 Turnstile 脚本 (仅一次)
function loadTurnstileScript(): Promise<void> {
  return new Promise((resolve) => {
    if (window.turnstile) {
      scriptLoaded.value = true
      resolve()
      return
    }
    const existingScript = document.querySelector(
      'script[src="https://challenges.cloudflare.com/turnstile/v0/api.js"]'
    )
    if (existingScript) {
      existingScript.addEventListener('load', () => {
        scriptLoaded.value = true
        resolve()
      })
      return
    }
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
    script.async = true
    script.defer = true
    script.onload = () => {
      scriptLoaded.value = true
      resolve()
    }
    document.head.appendChild(script)
  })
}

// 渲染 Turnstile 组件
function renderWidget() {
  if (!containerRef.value || !props.enabled || !props.siteKey) return
  if (!window.turnstile) return

  // 销毁旧实例
  if (widgetId.value) {
    window.turnstile.remove(widgetId.value)
    widgetId.value = ''
  }
  containerRef.value.innerHTML = ''

  widgetId.value = window.turnstile.render(containerRef.value, {
    sitekey: props.siteKey,
    theme: props.theme || 'auto',
    size: props.size || 'normal',
    callback: (token: string) => {
      emit('verify', token)
    },
    'error-callback': (err: any) => {
      emit('error', err)
    },
    'expired-callback': () => {
      emit('expired')
    },
  })
}

// 重置并重新渲染 (供外部调用)
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
  // 等待 DOM 挂载
  nextTick(() => {
    renderWidget()
  })
})

onBeforeUnmount(() => {
  if (widgetId.value) {
    window.turnstile?.remove(widgetId.value)
  }
})
</script>

<style scoped>
.captcha-container {
  min-height: 65px;
}
</style>
