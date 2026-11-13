/**
 * 从拖拽数据里挑第一个 http(s) 网址。
 * `text/uri-list` 可能多行、以 # 开头的行是注释；`text/plain` 则可能夹着说明文字。
 */
export function pickHttpUrl(raw: string): string | null {
  if (!raw) return null
  for (const line of raw.split(/\r?\n/)) {
    const value = line.trim()
    if (!value || value.startsWith('#')) continue
    const match = value.match(/https?:\/\/[^\s<>"']+/i)
    if (!match) continue
    try {
      const url = new URL(match[0])
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString()
    } catch {
      /* 不合法就继续看下一行 */
    }
  }
  return null
}
