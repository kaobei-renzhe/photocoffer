/** 查看器 chrome 唯一可见性判定：常规浏览恒可见；只有沉浸与幻灯片静止会隐藏 */
export function isChromeVisible(input: {
  immersive: boolean
  peekBand: boolean
  slideIdle: boolean
}): boolean {
  if (input.immersive) return input.peekBand
  return !input.slideIdle
}
