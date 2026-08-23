import { Socket } from './net'

export { Socket }

export class TLSSocket extends Socket {}

export function connect(...args: any[]) {
  const socket = new TLSSocket()
  socket.connect(...args)
  return socket
}

export default { TLSSocket, connect }
