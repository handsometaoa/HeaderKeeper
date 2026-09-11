// 生成插件图标：珊瑚橙圆角底 + 白色 ⇥ 箭头（与界面品牌标识一致）
// 纯 Node 实现，无第三方依赖
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------- PNG 编码 ----------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- 绘制 ----------
const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

const BG = hex('#e8502a'); // 品牌珊瑚橙
const WHITE = [255, 255, 255];
const INSET = 0.02; // 底板外边距
const RADIUS = 0.24; // 圆角半径（与界面 12px/36px 圆角块一致）

// ⇥ 箭头几何（相对坐标）：竖条 + 横杆 + 箭头三角
const BAR = { x1: 0.7, y1: 0.28, x2: 0.77, y2: 0.72 }; // 右侧竖条
const SHAFT = { x1: 0.2, y1: 0.46, x2: 0.62, y2: 0.54 }; // 横杆
const HEAD = { apex: { x: 0.7, y: 0.5 }, backX: 0.56, halfH: 0.13 }; // 箭头三角

function inRect(nx, ny, r) {
  return nx >= r.x1 && nx <= r.x2 && ny >= r.y1 && ny <= r.y2;
}

function inTriangle(nx, ny) {
  const { apex, backX, halfH } = HEAD;
  const ax = backX;
  const ay = apex.y - halfH;
  const bx = backX;
  const by = apex.y + halfH;
  const cx = apex.x;
  const cy = apex.y;
  const d1 = (nx - bx) * (ay - by) - (ny - by) * (ax - bx);
  const d2 = (nx - cx) * (by - cy) - (ny - cy) * (bx - cx);
  const d3 = (nx - ax) * (cy - ay) - (ny - ay) * (cx - ax);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function sample(nx, ny) {
  // 圆角矩形底板
  const rx = Math.max(INSET + RADIUS - nx, nx - (1 - INSET - RADIUS), 0);
  const ry = Math.max(INSET + RADIUS - ny, ny - (1 - INSET - RADIUS), 0);
  if (Math.hypot(rx, ry) > RADIUS) return [0, 0, 0, 0];

  const isArrow = inRect(nx, ny, BAR) || inRect(nx, ny, SHAFT) || inTriangle(nx, ny);
  const [r, g, b] = isArrow ? WHITE : BG;
  return [r, g, b, 255];
}

function renderIcon(size) {
  const SS = 4; // 4x 超采样抗锯齿
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const [pr, pg, pb, pa] = sample(
            (x + (sx + 0.5) / SS) / size,
            (y + (sy + 0.5) / SS) / size,
          );
          r += pr;
          g += pg;
          b += pb;
          a += pa;
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      out[i] = Math.round(r / n);
      out[i + 1] = Math.round(g / n);
      out[i + 2] = Math.round(b / n);
      out[i + 3] = Math.round(a / n);
    }
  }
  return encodePng(size, out);
}

const outDir = join(root, 'public');
mkdirSync(outDir, { recursive: true });
for (const size of [16, 48, 128]) {
  writeFileSync(join(outDir, `icon-${size}.png`), renderIcon(size));
  console.log(`✓ public/icon-${size}.png`);
}
