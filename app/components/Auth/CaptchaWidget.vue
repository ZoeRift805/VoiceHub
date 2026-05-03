<template>
  <div
    v-if="enabled && siteKey"
    class="cf-turnstile"
    :data-sitekey="siteKey"
    data-theme="auto"
    data-callback="onTurnstileVerify"
    data-error-callback="onTurnstileError"
    data-expired-callback="onTurnstileExpired"
  ></div>
</template>

<script setup lang="ts">
const props = defineProps<{
  siteKey: string
  enabled: boolean
}>()

const emit = defineEmits<{
  (e: 'verify', token: string): void
  (e: 'error', err: any): void
  (e: 'expired'): void
}>()

// 将回调挂载到 window，供隐式渲染使用
if (typeof window !== 'undefined') {
  ;(window as any).onTurnstileVerify = (token: string) => {
    emit('verify', token)
  }
  ;(window as any).onTurnstileError = (err: any) => {
    emit('error', err)
  }
  ;(window as any).onTurnstileExpired = () => {
    emit('expired')
  }
}
</script>
