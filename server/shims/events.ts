// Cloudflare Workers 中为 Node 事件 API 提供最小兼容实现。
export class EventEmitter {
  private listenersMap = new Map<string | symbol, Set<(...args: any[]) => void>>()

  on(event: string | symbol, listener: (...args: any[]) => void) {
    let listeners = this.listenersMap.get(event)
    if (!listeners) {
      listeners = new Set()
      this.listenersMap.set(event, listeners)
    }
    listeners.add(listener)
    return this
  }

  addListener(event: string | symbol, listener: (...args: any[]) => void) {
    return this.on(event, listener)
  }

  once(event: string | symbol, listener: (...args: any[]) => void) {
    const wrapper = (...args: any[]) => {
      this.removeListener(event, wrapper)
      listener(...args)
    }
    return this.on(event, wrapper)
  }

  emit(event: string | symbol, ...args: any[]) {
    const listeners = this.listenersMap.get(event)
    if (!listeners) return false
    for (const listener of [...listeners]) listener(...args)
    return listeners.size > 0
  }

  removeListener(event: string | symbol, listener: (...args: any[]) => void) {
    const listeners = this.listenersMap.get(event)
    listeners?.delete(listener)
    if (listeners?.size === 0) this.listenersMap.delete(event)
    return this
  }

  off(event: string | symbol, listener: (...args: any[]) => void) {
    return this.removeListener(event, listener)
  }

  removeAllListeners(event?: string | symbol) {
    if (event === undefined) this.listenersMap.clear()
    else this.listenersMap.delete(event)
    return this
  }

  listeners(event: string | symbol) {
    return [...(this.listenersMap.get(event) || [])]
  }

  listenerCount(event: string | symbol) {
    return this.listenersMap.get(event)?.size || 0
  }
}

export const once = async (emitter: EventEmitter, event: string | symbol) =>
  new Promise<any[]>((resolve) => emitter.once(event, (...args) => resolve(args)))

export default { EventEmitter, once }
