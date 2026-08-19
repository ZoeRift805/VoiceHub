// Redis 客户端在未加载原生加速模块时会回退到 JavaScript 实现。
export const xxh32 = () => 0
export const xxh64 = () => 0
export default { xxh32, xxh64 }
