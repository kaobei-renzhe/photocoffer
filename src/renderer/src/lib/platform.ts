/** 渲染层的平台判断：统一从 preload 暴露的 window.env 读，不用废弃的 navigator.platform */
export const isMac = window.env?.platform === 'darwin'
export const modLabel = isMac ? '⌘' : 'Ctrl'
export const altLabel = isMac ? '⌥' : 'Alt'
