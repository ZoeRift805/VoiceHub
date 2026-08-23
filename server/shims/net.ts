import { Duplex } from './stream'

export class Socket extends Duplex {
  destroyed = false
  connecting = false
  writable = true
  readable = true
  remoteAddress = ''
  remotePort = 0

  connect() {
    this.connecting = false
    queueMicrotask(() => this.emit('connect'))
    return this
  }

  setTimeout() {
    return this
  }

  setNoDelay() {
    return this
  }

  setKeepAlive() {
    return this
  }

  address() {
    return { address: this.remoteAddress, port: this.remotePort, family: 'IPv4' }
  }
}

export function isIP(value: unknown) {
  if (typeof value !== 'string') return 0
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)) return 4
  if (value.includes(':')) return 6
  return 0
}

export function isIPv4(value: unknown) {
  return isIP(value) === 4
}

export function isIPv6(value: unknown) {
  return isIP(value) === 6
}

export default { Socket, isIP, isIPv4, isIPv6 }
