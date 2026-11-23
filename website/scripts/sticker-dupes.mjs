// 找重复的表情包图片，生成 public/stickers/dupes.json：{ 被隐藏的代码: 保留的代码 }
// 判重：① 文件字节完全一样（sha1）；② 不同包之间，缩到 24×24 铺白底后逐像素 RMS 距离 < 25，且互为最像的那张
// （L站转存的 B站 / 贴吧 是重新压缩过的，字节不同但画面一样）。同包内只认字节完全一致，免得把「笑 / 脸红」这类差一点的当成重复。
// 保留规则：优先留有英文名的原版包（bm / tieba …），隐藏 L站 编号版（ld:bili_001 这种）。文件一个不删，老消息里的代码照常显示。
// 用法：node scripts/sticker-dupes.mjs
import fs from 'node:fs'
import crypto from 'node:crypto'
import sharp from 'sharp'

const DIR = 'public/stickers'
const packs = JSON.parse(fs.readFileSync(`${DIR}/packs.json`, 'utf8'))
const all = []
for (const p of packs) {
  for (const it of p.items) {
    const file = `${DIR}/${p.key}/${it}.${p.ext}`
    if (!fs.existsSync(file)) continue
    const buf = fs.readFileSync(file)
    const { data } = await sharp(buf, { animated: false }).ensureAlpha()
      .resize(24, 24, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).raw().toBuffer({ resolveWithObject: true })
    const v = new Float32Array(24 * 24 * 3)
    for (let i = 0; i < 576; i++) {
      const a = data[i * 4 + 3] / 255
      for (let c = 0; c < 3; c++) v[i * 3 + c] = data[i * 4 + c] * a + 255 * (1 - a)
    }
    all.push({ key: `${p.key}:${it}`, pack: p.key, sha: crypto.createHash('sha1').update(buf).digest('hex'), v })
  }
}
const dist = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d } return Math.sqrt(s / a.length) }
// 留哪个：非 ld 优先；同类里按 packs.json 顺序、再按名字
const order = new Map(packs.map((p, i) => [p.key, i]))
const rank = (x) => [x.pack === 'ld' ? 1 : 0, order.get(x.pack), x.key]
const better = (a, b) => { const ra = rank(a), rb = rank(b); for (let i = 0; i < 3; i++) if (ra[i] !== rb[i]) return ra[i] < rb[i] ? a : b; return a }

// 并查集，把重复的连成一组
const parent = all.map((_, i) => i)
const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])))
const join = (i, j) => { parent[find(i)] = find(j) }
const bySha = new Map()
all.forEach((x, i) => { if (bySha.has(x.sha)) join(i, bySha.get(x.sha)); else bySha.set(x.sha, i) })
const nearest = all.map(() => ({ d: Infinity, j: -1 }))
for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
  if (all[i].pack === all[j].pack) continue
  const d = dist(all[i].v, all[j].v)
  if (d < nearest[i].d) nearest[i] = { d, j }
  if (d < nearest[j].d) nearest[j] = { d, j: i }
}
nearest.forEach(({ d, j }, i) => { if (d < 25 && nearest[j].j === i) join(i, j) })

const groups = new Map()
all.forEach((x, i) => { const r = find(i); groups.set(r, [...(groups.get(r) || []), x]) })
const map = {}
for (const g of groups.values()) {
  if (g.length < 2) continue
  const keep = g.reduce(better)
  for (const x of g) if (x !== keep) map[x.key] = keep.key
}
const sorted = Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)))
fs.writeFileSync(`${DIR}/dupes.json`, JSON.stringify(sorted, null, 0) + '\n')
console.log(`共 ${all.length} 个表情，${Object.keys(sorted).length} 个重复已写入 ${DIR}/dupes.json`)
