/**
 * 查看器 chrome 唯一可见性判定。
 * 用户正在交互（键盘聚焦 / 框选 / 档案面板 / 二级面板）时一律常显，绝不中途消失；
 * 其余情况：沉浸态只看指针是否在上下唤回带。
 */
export function isChromeVisible(input: {
  immersive: boolean
  peekBand: boolean
  /** Tab 聚焦到任一控件 */
  focusWithin?: boolean
  /** 框选拖拽进行中 */
  drawing?: boolean
  /** 档案面板打开 */
  inspectorOpen?: boolean
  /** 二级面板展开 */
  interacting?: boolean
}): boolean {
  // 用户正在交互时，一律常显，绝不中途消失
  if (input.focusWithin || input.drawing || input.inspectorOpen || input.interacting) return true
  if (input.immersive) return input.peekBand
  return true
}
