/** 只放行 https：file:// 能打开本地文件，javascript: / 自定义协议能拉起外部程序 */
export function isSafeExternalUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https:\/\/\S+$/i.test(value.trim())
}
