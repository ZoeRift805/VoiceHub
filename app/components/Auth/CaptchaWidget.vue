<template>
  <div v-if="ready" ref="containerRef" class="captcha-container flex justify-center transition-opacity duration-300"
    :class="{ 'opacity-0': !visible, 'opacity-100': visible }"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'

const props = withDefaults(defineProps<{
  provider?: 'turnstile' | 'hcaptcha'
  siteKey: string
  enabled?: boolean
  theme?: 'light' | 'dark' | 'auto'
  size?: 'normal' | 'compact'
}>(), {
  provider: 'turnstile',
  enabled: true,
  theme: 'auto',
  size: 'normal',
})

const emit = defineEmits<{
  (e: 'verify', token: string): void
  (e: 'error', err: any): void
  (e: 'expired'): void
}>()

const containerRef = ref<HTMLElement>()
const widgetId = ref('')
const ready = ref(false)
const visible = ref(false)
const scriptLoaded = ref(false)

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { scriptLoaded.value = true; resolve(); return }
    const script = document.createElement('script')
    script.src = src; script.async = true; script.defer = true
    script.onload = () => { scriptLoaded.value = true; resolve() }
    script.onerror = (err) => reject(err)
    document.head.appendChild(script)
  })
}

async function initProvider() {
  if (props.provider === 'turnstile') await loadScript('https://challenges.cloudflare.com/turnstile/v0/api.js')
  else if (props.provider === 'hcaptcha') await loadScript('https://js.hcaptcha.com/1/api.js')
}

function renderWidget() {
  if (!containerRef.value || !props.siteKey || !props.enabled) return
  if (props.provider === 'turnstile' && window.turnstile) {
    widgetId.value = window.turnstile.render(containerRef.value, {
      sitekey: props.siteKey, theme: props.theme, size: props.size,
      callback: (token: string) => emit('verify', token),
      'error-callback': (err: any) => emit('error', err),
      'expired-callback': () => { emit('expired'); resetWidget() },
    })
  } else if (props.provider === 'hcaptcha' && window.hcaptcha) {
    widgetId.value = window.hcaptcha.render(containerRef.value, {
      sitekey: props.siteKey, theme: props.theme, size: props.size,
      callback: (token: string) => emit('verify', token),
      'error-callback': (err: any) => emit('error', err),
      'expired-callback': () => { emit('expired'); resetWidget() },
    })
  }
  visible.value = true
}

function resetWidget() {
  if (props.provider === 'turnstile' && widgetId.value && window.turnstile) window.turnstile.reset(widgetId.value)
  else if (props.provider === 'hcaptcha' && widgetId.value && window.hcaptcha) window.hcaptcha.reset(widgetId.value)
}

defineExpose({ reset: resetWidget, reload: () => { visible.value = false; nextTick(() => { if (containerRef.value) containerRef.value.innerHTML = ''; widgetId.value = ''; renderWidget() }) } })

onMounted(async () => {
  if (!props.enabled) return
  try { await initProvider(); ready.value = true; await nextTick(); if (containerRef.value) renderWidget() }
  catch (err) { console.error('验证组件加载失败', err) }
})

onBeforeUnmount(() => {
  if (widgetId.value && props.provider === 'turnstile' && window.turnstile) window.turnstile.remove(widgetId.value)
  else if (widgetId.value && props.provider === 'hcaptcha' && window.hcaptcha) window.hcaptcha.remove(widgetId.value)
})

watch(() => props.enabled, (val) => {
  if (val && !widgetId.value && ready.value) nextTick(() => renderWidget())
  else if (!val) visible.value = false
})
</script>
