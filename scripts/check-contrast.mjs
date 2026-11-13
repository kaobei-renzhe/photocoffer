// 用法：npm run check:contrast
// 按 WCAG 公式检查每套主题的关键颜色组合，防止调色时把辅助文字调得看不见。
import { readFileSync } from 'node:fs'

const css = readFileSync('src/renderer/src/styles.css', 'utf8')
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
    ['bg/panel 层次', v.bg, v.panel, 1.1],
    ['star/panel', v.star, v.panel, 3.0]
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
