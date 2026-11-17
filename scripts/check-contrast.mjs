// 用法：npm run check:contrast
// 按 WCAG 公式检查每套主题的关键颜色组合，防止调色时把辅助文字调得看不见。
// 表面层次只拦「完全同色」：主界面是「一个表面 + 边框分层」，分区靠 border 而不是底色差，
// 所以 bg/panel、card/canvas 的阈值放得很低，真正把关的是 border/panel。
import { readFileSync } from 'node:fs'

// 先去掉注释再解析，否则注释里的 :root 会被当成选择器，皮肤名解析成乱码
const css = readFileSync('src/renderer/src/styles.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const lum = (h) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

const blocks = {}
for (const m of css.matchAll(/(:root(?:\[[^\]]+\])?[^{]*)\{([^}]*)\}/g)) {
  const vars = Object.fromEntries(
    [...m[2].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((v) => [v[1], v[2]])
  )
  if (!vars.bg) continue
  const key = m[1].replace(':root', '').replace(/\[|\]|'|"|data-theme=|data-skin=/g, '') || 'dark'
  blocks[key] = vars
}

let bad = 0
for (const [name, v] of Object.entries(blocks)) {
  const checks = [
    ['text/bg', v.text, v.bg, 4.5],
    ['faint/panel', v.faint, v.panel, 4.5],
    ['muted/panel', v.muted, v.panel, 4.5],
    ['bg/panel 不同色', v.bg, v.panel, 1.02],
    ['star/panel', v.star, v.panel, 3.0],
    ['text/chrome', v.text, v.chrome, 4.5],
    ['muted/chrome', v.muted, v.chrome, 4.5],
    ['chrome/canvas 层次', v.chrome, v.canvas, 1.05],
    ['card/canvas 不同色', v.card, v.canvas, 1.05],
    ['border/panel 分界', v.border, v.panel, 1.15]
  ]
  for (const [label, a, b, need] of checks) {
    if (!a || !b) continue
    const r = ratio(a, b)
    if (r < need) {
      bad++
      console.log(`✗ ${name.padEnd(10)} ${label.padEnd(14)} ${r.toFixed(2)} < ${need}`)
    }
  }
}
console.log(bad ? `\n${bad} 处不达标` : '\n全部达标 ✓')
process.exitCode = bad ? 1 : 0
