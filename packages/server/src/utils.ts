import os from 'os'

/** 找一个从 startPort 开始未被占用的端口 */
export async function findAvailablePort(startPort: number): Promise<number> {
  const net = await import('net')
  return new Promise((resolve) => {
    const check = (port: number) => {
      const srv = net.createServer()
      srv.once('error', () => check(port + 1))
      srv.once('listening', () => srv.close(() => resolve(port)))
      // 必须显式绑 127.0.0.1：agent server（opencode serve 等）默认监听 127.0.0.1，
      // 不指定 host 时 Node 会绑 IPv6 '::'，与 127.0.0.1 不冲突，会把已占端口误判为空闲。
      srv.listen(port, '127.0.0.1')
    }
    check(startPort)
  })
}

/** 获取最合适的本机局域网 IP，优先 192.168.x.x，其次 10.x.x.x / 172.x.x.x */
export function getBestLocalIP(): string | null {
  const ifaces = os.networkInterfaces()
  const candidates: { ip: string; priority: number }[] = []
  for (const list of Object.values(ifaces)) {
    for (const iface of list ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const { address } = iface
        if (address.startsWith('192.168.')) candidates.push({ ip: address, priority: 0 })
        else if (address.startsWith('10.')) candidates.push({ ip: address, priority: 1 })
        else if (address.startsWith('172.')) candidates.push({ ip: address, priority: 2 })
      }
    }
  }
  candidates.sort((a, b) => a.priority - b.priority)
  return candidates[0]?.ip ?? null
}
