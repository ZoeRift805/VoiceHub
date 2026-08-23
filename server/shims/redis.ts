const unavailable = () => {
  throw new Error('Cloudflare Workers 环境未启用 Redis 客户端')
}

export const createClient = () => ({
  isOpen: false,
  isReady: false,
  on() {
    return this
  },
  connect: unavailable,
  quit: async () => undefined,
  destroy() {}
})
