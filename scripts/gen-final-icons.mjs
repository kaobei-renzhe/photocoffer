/**
 * 片匣 · 最终图标生成器
 *
 * 图形：俯视的匣 + 扇形展开的一叠照片（PA2 配色）
 * 容器：macOS 超椭圆 + 留白 / Windows 满铺圆角
 * 分档：>=64px 三张 / 32-48px 两张 / <=24px 一张
 *
 * 用法：node scripts/gen-final-icons.mjs
 */
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const BUILD = 'build';
const DRAFT = 'design/icon-drafts';

const INK = '#14161B';
// P1 冷白 / 月白：去掉暖米色的黄调，让三张彩色照片更明快
const PAPER = '#E8EEF4', PAPER_HI = '#F7FAFC', PAPER_LO = '#D3DCE6';
const WELL = '#2A2E36';
// PA2：左后天蓝 / 右后暖黄 / 前面珊瑚红（主体）
const C = ['#5B9FE8', '#F5C344', '#F2604A'];

function squircle(cx, cy, a, b, n = 5, steps = 240) {
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const ct = Math.cos(t), st = Math.sin(t);
    pts.push([
      cx + a * Math.sign(ct) * Math.pow(Math.abs(ct), 2 / n),
      cy + b * Math.sign(st) * Math.pow(Math.abs(st), 2 / n),
    ]);
  }
  return 'M ' + pts.map((p) => p.map((v) => v.toFixed(2)).join(' ')).join(' L ') + ' Z';
}

function photo(size, x, y, w, h, color, rot, detail) {
  const pad = size * 0.026;
  const iw = w - pad * 2, ih = h - size * 0.145;
  const mtn = detail
    ? `<path d="M ${x+pad} ${y+pad+ih} L ${x+pad+iw*0.4} ${y+pad+ih*0.42} L ${x+pad+iw*0.62} ${y+pad+ih*0.7} L ${x+pad+iw*0.8} ${y+pad+ih*0.48} L ${x+pad+iw} ${y+pad+ih} Z" fill="${INK}" opacity="0.24"/>`
    : '';
  return `<g transform="rotate(${rot} ${x+w/2} ${y+h/2})">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${size*0.012}" fill="${PAPER_HI}"/>
    <rect x="${x+pad}" y="${y+pad}" width="${iw}" height="${ih}" rx="${size*0.006}" fill="${color}"/>
    ${mtn}
  </g>`;
}

/** 在 (ox,oy)-(ox+size,ox+size) 区域内绘制匣与照片 */
function content(size, ox, oy, detail) {
  const d = [];
  const k = detail;   // 用于 filter id 去重
  let L = '';
  const bx = ox + size*0.10, by = oy + size*0.10;
  const bw = size*0.80, bh = size*0.80, brx = size*0.075;

  d.push(`<filter id="sh${k}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${(size*0.014).toFixed(2)}"/></filter>`);
  d.push(`<linearGradient id="bg${k}" x1="0.1" y1="0" x2="0.9" y2="1"><stop offset="0" stop-color="${PAPER_HI}"/><stop offset="0.55" stop-color="${PAPER}"/><stop offset="1" stop-color="${PAPER_LO}"/></linearGradient>`);

  L += `<rect x="${bx+size*0.005}" y="${by+size*0.014}" width="${bw}" height="${bh}" rx="${brx}" fill="#000" opacity="0.4" filter="url(#sh${k})"/>`;
  L += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="${brx}" fill="url(#bg${k})"/>`;
  if (detail >= 2) {
    L += `<rect x="${bx+size*0.016}" y="${by+size*0.016}" width="${bw-size*0.032}" height="${bh-size*0.032}" rx="${brx-size*0.008}" fill="none" stroke="#FFFDF7" stroke-width="${size*0.005}" stroke-opacity="0.45"/>`;
  }

  const wx = bx+size*0.055, wy = by+size*0.055, ww = bw-size*0.11, wh = bh-size*0.11;
  L += `<rect x="${wx}" y="${wy}" width="${ww}" height="${wh}" rx="${size*0.032}" fill="${WELL}"/>`;

  const pw = size*0.40, ph = size*0.48;
  const px = ox, py = oy;
  if (detail >= 2) {
    L += photo(size, px+size*0.19, py+size*0.19, pw, ph, C[0], -17, true);
    L += photo(size, px+size*0.31, py+size*0.17, pw, ph, C[1], 14, true);
    L += photo(size, px+size*0.26, py+size*0.25, pw, ph, C[2], -1, true);
  } else if (detail === 1) {
    L += photo(size, px+size*0.21, py+size*0.20, pw, ph, C[0], -10, false);
    L += photo(size, px+size*0.29, py+size*0.23, pw, ph, C[2], 3, false);
  } else {
    L += photo(size, px+size*0.26, py+size*0.22, pw, ph, C[2], -3, false);
  }
  L += `<rect x="${wx}" y="${wy}" width="${ww}" height="${size*0.045}" rx="${size*0.018}" fill="#000" opacity="0.2"/>`;
  return { defs: d.join(''), body: L };
}

function detailFor(size) {
  return size >= 64 ? 2 : size >= 32 ? 1 : 0;
}

/** macOS：1024 画布里内容占 824，超椭圆 n=5 */
function macIcon(P) {
  const inset = P * (100 / 1024);
  const size = P - inset * 2;
  const det = detailFor(size);
  const c = content(size, inset, inset, det);
  const half = size / 2, ctr = P / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${P}" height="${P}" viewBox="0 0 ${P} ${P}">
  <defs>${c.defs}</defs>
  <path d="${squircle(ctr, ctr, half, half, 5)}" fill="${INK}"/>
  ${c.body}
</svg>`;
}

/** Windows：满铺画布，圆角 17% */
function winIcon(P) {
  const det = detailFor(P);
  const c = content(P, 0, 0, det);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${P}" height="${P}" viewBox="0 0 ${P} ${P}">
  <defs>${c.defs}</defs>
  <rect width="${P}" height="${P}" rx="${P*0.17}" fill="${INK}"/>
  ${c.body}
</svg>`;
}

const MAC_SIZES = [1024, 512, 256, 128, 64, 32, 16];
const WIN_SIZES = [512, 256, 128, 64, 48, 32, 24, 16];

fs.mkdirSync(path.join(BUILD, 'icons'), { recursive: true });
fs.mkdirSync(path.join(BUILD, 'icons-mac'), { recursive: true });
fs.mkdirSync(DRAFT, { recursive: true });

// Windows 套件
for (const P of WIN_SIZES) {
  const svg = winIcon(P);
  fs.writeFileSync(path.join(DRAFT, `FINAL-WIN-${P}.svg`), svg);
  await sharp(Buffer.from(svg)).png().toFile(path.join(BUILD, 'icons', `${P}.png`));
}
// macOS 套件
for (const P of MAC_SIZES) {
  const svg = macIcon(P);
  fs.writeFileSync(path.join(DRAFT, `FINAL-MAC-${P}.svg`), svg);
  await sharp(Buffer.from(svg)).png().toFile(path.join(BUILD, 'icons-mac', `${P}.png`));
}

// 顶层交付文件
const win512 = winIcon(512);
fs.writeFileSync(path.join(BUILD, 'icon.svg'), win512);
await sharp(Buffer.from(win512)).png().toFile(path.join(BUILD, 'icon.png'));
await sharp(Buffer.from(win512)).png().toFile(path.join(BUILD, 'icon-win.png'));
await sharp(Buffer.from(macIcon(1024))).png().toFile(path.join(BUILD, 'icon-mac.png'));

// 单色版（灰度，用于水印 / 黑白打印）
await sharp(path.join(BUILD, 'icon.png')).greyscale().png().toFile(path.join(BUILD, 'icon-mono.png'));
fs.writeFileSync(path.join(BUILD, 'icon-mono.svg'), winIcon(512).replace(/#5B9FE8|#F5C344|#F2604A/g, '#9AA0AA'));

console.log('生成完成');
console.log('  build/icon.png / icon.svg / icon-win.png  → Windows 512');
console.log('  build/icon-mac.png                        → macOS 1024（超椭圆 + 留白）');
console.log('  build/icon-mono.png / icon-mono.svg       → 单色版');
console.log('  build/icons/      →', WIN_SIZES.join('/'));
console.log('  build/icons-mac/  →', MAC_SIZES.join('/'));
