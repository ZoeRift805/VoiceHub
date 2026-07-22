<template>
  <div class="flex flex-col gap-4 p-4 bg-zinc-950/30 border border-zinc-900 rounded-2xl">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div class="flex items-start gap-3 min-w-0">
        <div class="p-2 bg-blue-500/10 rounded-lg text-blue-500 shrink-0">
          <Icon name="bell" size="18" />
        </div>
        <div class="min-w-0">
          <h3 class="text-sm font-bold text-zinc-200">浏览器推送</h3>
          <p class="text-[11px] text-zinc-500 mt-1">{{ statusText }}</p>
        </div>
      </div>

      <div class="flex items-center gap-2 shrink-0">
        <button
          v-if="enabled"
          :disabled="loading"
          class="inline-flex items-center justify-center gap-2 px-3 py-2.5 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
          title="发送测试通知"
          @click="handleTest"
        >
          <Icon name="bell" size="16" />
          <span class="text-xs font-bold">发送测试</span>
        </button>
        <button
          :disabled="loading || !supported || !configured || permission === 'denied'"
          class="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
          :class="
            enabled
              ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              : 'bg-blue-600 text-white hover:bg-blue-500'
          "
          @click="handleToggle"
        >
          <Icon
            :name="loading ? 'refresh' : enabled ? 'x-circle' : 'bell'"
            size="15"
            :class="{ 'animate-spin': loading }"
          />
          {{ enabled ? '关闭推送' : '开启推送' }}
        </button>
      </div>
    </div>

    <p v-if="error" class="text-xs text-red-400">{{ error }}</p>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useToast } from '~/composables/useToast'
import { useWebPush } from '~/composables/useWebPush'

const { showToast } = useToast()
const {
  supported,
  configured,
  enabled,
  permission,
  loading,
  error,
  initialize,
  enable,
  disable,
  sendTest
} = useWebPush()

const statusText = computed(() => {
  if (!supported.value) return '当前浏览器不支持系统级推送通知'
  if (!configured.value) return '站点管理员尚未配置 Web Push'
  if (permission.value === 'denied') return '通知权限已被浏览器阻止'
  return enabled.value ? '此设备可以在 VoiceHub 关闭后接收通知' : '此设备尚未订阅系统通知'
})

const handleToggle = async () => {
  const success = enabled.value ? await disable() : await enable()
  if (success) showToast(enabled.value ? '浏览器推送已开启' : '浏览器推送已关闭', 'success')
}

const handleTest = async () => {
  if (await sendTest()) showToast('推送服务已接收，请查看系统通知栏', 'success')
}

onMounted(initialize)
</script>
