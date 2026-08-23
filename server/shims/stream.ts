import { EventEmitter } from './events'

export class Stream extends EventEmitter {}

export class Readable extends Stream {
  readable = true
  readableEnded = false
  destroyed = false

  static from() {
    return new Readable()
  }

  read() {
    return null
  }

  push() {
    return false
  }

  pause() {
    return this
  }

  resume() {
    return this
  }

  setEncoding() {
    return this
  }

  destroy(error?: unknown) {
    this.destroyed = true
    if (error) this.emit('error', error)
    this.emit('close')
    return this
  }
}

export class Writable extends Stream {
  writable = true
  writableEnded = false
  writableFinished = false
  destroyed = false

  write(_chunk?: unknown, _encoding?: unknown, callback?: () => void) {
    callback?.()
    return !this.writableEnded
  }

  end(_chunk?: unknown, _encoding?: unknown, callback?: () => void) {
    this.writableEnded = true
    this.writableFinished = true
    this.emit('finish')
    this.emit('close')
    callback?.()
    return this
  }

  destroy(error?: unknown) {
    this.destroyed = true
    if (error) this.emit('error', error)
    this.emit('close')
    return this
  }
}

export class Duplex extends Readable {
  writable = true
  write = Writable.prototype.write
  end = Writable.prototype.end
}

export class Transform extends Duplex {}
export class PassThrough extends Transform {}

export default { Stream, Readable, Writable, Duplex, Transform, PassThrough }
