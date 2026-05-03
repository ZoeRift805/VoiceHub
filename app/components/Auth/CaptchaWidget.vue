<!-- app/components/CaptchaWidget.vue -->
<template>
  <div class="cf-turnstile" :data-sitekey="siteKey" data-theme="auto"></div>
</template>

<script setup lang="ts">
const props = defineProps<{
  siteKey: string
}>()

const emit = defineEmits<{
  (e: 'verify', token: string): void
  (e: 'error', err: any): void
}>()

// 将回调函数挂载到全局 window 对象上，供 Turnstile 隐式渲染使用
if (typeof window !== 'undefined') {
  ;(window as any).onTurnstileVerify = (token: string) => {
    emit('verify', token)
  }
  ;(window as any).onTurnstileError = (err: any) => {
    emit('error', err)
  }
}
</script>
