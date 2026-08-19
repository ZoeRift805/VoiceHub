const noop = () => {}

export const init = noop
export const setTag = noop
export const setContext = noop
export const captureException = noop
export const consoleLoggingIntegration = () => ({ name: 'CloudflareNoopIntegration' })
export const close = async () => true

export const startSpan = (_options: unknown, callback?: () => unknown) => callback?.()

export const withScope = (callback: (scope: Record<string, typeof noop>) => unknown) =>
  callback({
    setContext: noop,
    setTag: noop,
    setLevel: noop
  })
