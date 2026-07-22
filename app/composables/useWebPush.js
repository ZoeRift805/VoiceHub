const urlBase64ToUint8Array = (value) => {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)))
}

const uint8ArrayToUrlBase64 = (value) => {
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const subscriptionUsesKey = (subscription, publicKey) => {
  const applicationServerKey = subscription?.options?.applicationServerKey
  if (!applicationServerKey) return false
  return uint8ArrayToUrlBase64(new Uint8Array(applicationServerKey)) === publicKey
}

export const useWebPush = () => {
  const supported = useState('web-push-supported', () => false)
  const enabled = useState('web-push-enabled', () => false)
  const permission = useState('web-push-permission', () => 'default')
  const loading = useState('web-push-loading', () => false)
  const error = useState('web-push-error', () => '')
  const configured = useState('web-push-configured', () => false)
  const publicKey = useState('web-push-public-key', () => '')

  const getRegistration = async () => {
    if (!supported.value) return null
    return await navigator.serviceWorker.ready
  }

  const syncSubscription = async (subscription) => {
    await $fetch('/api/notifications/push-subscriptions', {
      method: 'POST',
      body: subscription.toJSON()
    })
  }

  const initialize = async () => {
    if (!import.meta.client) return

    supported.value =
      'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    permission.value = supported.value ? Notification.permission : 'unsupported'
    configured.value = false
    publicKey.value = ''
    enabled.value = false

    if (!supported.value) return

    try {
      const status = await $fetch('/api/notifications/push-subscriptions/status')
      configured.value = Boolean(status?.data?.configured && status.data.publicKey)
      publicKey.value = status?.data?.publicKey || ''
      if (!configured.value) return

      const registration = await getRegistration()
      let subscription = await registration?.pushManager.getSubscription()

      if (subscription && !subscriptionUsesKey(subscription, publicKey.value)) {
        try {
          await $fetch('/api/notifications/push-subscriptions', {
            method: 'DELETE',
            body: { endpoint: subscription.endpoint }
          })
        } catch {
          // 旧订阅可能已经在服务端清理
        }
        await subscription.unsubscribe()
        subscription = null

        if (permission.value === 'granted') {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey.value)
          })
        }
      }

      if (subscription && permission.value === 'granted') {
        await syncSubscription(subscription)
        enabled.value = true
      }
    } catch (err) {
      error.value = err?.data?.message || err?.message || '读取浏览器通知状态失败'
    }
  }

  const enable = async () => {
    if (!supported.value || !configured.value) return false

    loading.value = true
    error.value = ''
    try {
      permission.value = await Notification.requestPermission()
      if (permission.value !== 'granted') {
        throw new Error('浏览器通知权限未获得授权')
      }

      const registration = await getRegistration()
      let subscription = await registration.pushManager.getSubscription()
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey.value)
        })
      }

      await syncSubscription(subscription)
      enabled.value = true
      return true
    } catch (err) {
      error.value = err?.data?.message || err?.message || '开启浏览器通知失败'
      return false
    } finally {
      loading.value = false
    }
  }

  const disable = async () => {
    loading.value = true
    error.value = ''
    try {
      const registration = await getRegistration()
      const subscription = await registration?.pushManager.getSubscription()
      if (subscription) {
        await $fetch('/api/notifications/push-subscriptions', {
          method: 'DELETE',
          body: { endpoint: subscription.endpoint }
        })
        await subscription.unsubscribe()
      }
      enabled.value = false
      return true
    } catch (err) {
      error.value = err?.data?.message || err?.message || '关闭浏览器通知失败'
      return false
    } finally {
      loading.value = false
    }
  }

  const sendTest = async () => {
    loading.value = true
    error.value = ''
    try {
      await $fetch('/api/notifications/push-subscriptions/test', { method: 'POST' })
      return true
    } catch (err) {
      error.value = err?.data?.message || err?.message || '测试通知发送失败'
      return false
    } finally {
      loading.value = false
    }
  }

  return {
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
  }
}
