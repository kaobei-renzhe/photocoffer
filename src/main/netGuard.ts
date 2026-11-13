import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/**
 * 网址导入的 SSRF 防护：只允许公网 http/https。
 * 私网、回环、链路本地、CGNAT、组播与保留段一律拒绝。
 * 注意：DNS 解析与实际 fetch 之间仍有极小 rebinding 窗口，这里只做入口校验。
 */
export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip)
  if (version === 4) {
    const parts = ip.split('.').map(Number)
    const [a, b] = parts
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true
    if (a === 0 || a === 10 || a === 127) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true
    if (a >= 224) return true
    return false
  }
  if (version === 6) {
    const lower = ip.toLowerCase()
    if (lower === '::1' || lower === '::') return true
    if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) return true
    // IPv4-mapped IPv6：::ffff:192.168.1.1
    if (lower.startsWith('::ffff:')) return isPrivateAddress(lower.slice(7))
    return false
  }
  // 认不出的一律按危险处理
  return true
}

function isLocalHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase()
  return lower === 'localhost' || lower === '127.0.0.1' || lower === '[::1]' || lower === '::1'
}

export class UnsafeUrlError extends Error {}

/**
 * 校验一个将要下载的网址；返回规范化后的 URL。
 * 抛 UnsafeUrlError 表示协议不对、解析不到地址或落在私网。
 */
export async function assertPublicHttpUrl(raw: string | URL): Promise<URL> {
  let url: URL
  try {
    url = raw instanceof URL ? raw : new URL(String(raw))
  } catch {
    throw new UnsafeUrlError('invalid-url')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError('invalid-url')
  }
  if (!url.hostname || isLocalHostname(url.hostname)) {
    throw new UnsafeUrlError('private-address')
  }
  if (isIP(url.hostname)) {
    if (isPrivateAddress(url.hostname)) throw new UnsafeUrlError('private-address')
    return url
  }
  let records: Array<{ address: string }>
  try {
    records = await lookup(url.hostname, { all: true, verbatim: true })
  } catch {
    throw new UnsafeUrlError('dns-failed')
  }
  if (records.length === 0 || records.some((record) => isPrivateAddress(record.address))) {
    throw new UnsafeUrlError('private-address')
  }
  return url
}
