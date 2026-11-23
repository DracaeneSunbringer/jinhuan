// 大肥鱼的小岛 · 像素美术。全部原创、运行时绘制（不依赖外部图片）：
//  - 统一调色板（每种材质 4–6 阶色带）；
//  - 小精灵用字符画写「平涂」，再经 autoShade 自动加「选择性描边 + 左上高光 + 右下阴影」，得到更细的像素质感；
//  - 地形、建筑用程序化绘制（带种子噪声），保证每块草地、木板都略有不同。
// 若以后要换成 CC0 素材包（如 Kenney Tiny Town），只需替换本文件导出的 bake* / SPR 即可，场景代码不变。

export const C = {
  ink: '#1b1424',
  g0: '#354b32', g1: '#4d6440', g2: '#647c4d', g3: '#849951', g4: '#a9b86b', g5: '#c6ce91',
  d0: '#4f3424', d1: '#6e4a32', d2: '#8d6443', d3: '#ad8259', d4: '#c9a274',
  s0: '#3c261c', s1: '#553425', s2: '#6c4330', s3: '#85563c', s4: '#9e6a4a',
  wt0: '#2a1a14', wt1: '#3b261c',
  w0: '#254956', w1: '#396e7c', w2: '#4d8fa5', w3: '#70aebb', w4: '#a7ced1', w5: '#e5eeeb',
  a0: '#b38a55', a1: '#cfa86d', a2: '#e3c48b', a3: '#f1dcab', a4: '#fbefd2',
  r0: '#2d2a3a', r1: '#47455a', r2: '#666479', r3: '#8a889c', r4: '#b4b2c3', r5: '#dcdbe6',
  b0: '#3a2216', b1: '#5a361f', b2: '#7b4c2a', b3: '#9d6838', b4: '#c08a51', b5: '#dcae75',
  rf0: '#4e1a26', rf1: '#7c2834', rf2: '#a93a43', rf3: '#d0594f', rf4: '#ec8a6a',
  tl0: '#173f4a', tl1: '#24606b', tl2: '#35868c', tl3: '#55aea8', tl4: '#8fd5c4',
  wl0: '#9a8f80', wl1: '#c3b8a5', wl2: '#e2d9c6', wl3: '#f6f0e2',
  l0: '#354b32', l1: '#4c633c', l2: '#648044', l3: '#879950', l4: '#a7b568', l5: '#c4ce91',
  fy: '#ffd75e', fp: '#ff8fb1', fw: '#fff4ea', fv: '#b48cff', fr: '#ff5d5d',
  gold: '#ffcf4a', gold2: '#e89b23', glow: '#ffe9a8',
}
// 小精灵用的字符 → 颜色
const K = {
  '1': C.ink, w: '#f6f3ee', W: '#cfd3dd', g: '#9aa3b5', G: '#646d84',
  h: '#4a72d6', H: '#2f4aa0', i: '#7fb2ff', I: '#bcd8ff', f: '#5ec6d8', F: '#2f8fa6',
  p: '#ffe0c8', P: '#f0b998', o: '#ff9db2', r: '#e0475e', R: '#ff7a5a', e: '#2c3255', E: '#424b7a',
  y: '#ffd75e', Y: '#e8a830', l: '#9be070', L: '#4fa64f', d: '#2c6a3e', n: '#9a6538', N: '#5e3a20',
  m: '#c79563', s: '#efdcb1', v: '#a77de8', V: '#6c47b5', u: '#62c3ee', U: '#2c78b8', x: '#e2565f', q: '#9e2c3a',
  a: '#d6e6ff', z: '#7ccf4a', t: '#fff36a', k: '#2a2a35', c: '#e8f8ff', b: '#3d2a20', O: '#ff9c3a', B: '#ffb9c9',
}
// ---------- 工具 ----------
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255] }
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
export function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296 } }
const canvas = (w, h) => { const c = typeof OffscreenCanvas !== 'undefined' && false ? new OffscreenCanvas(w, h) : document.createElement('canvas'); c.width = w; c.height = h; return c }
// 自动明暗：描边用相邻颜色的深色（不是纯黑），左上缘提亮，右下缘压暗
export function autoShade(src, { outline = true, light = 0.22, dark = 0.28 } = {}) {
  const w = src.width, h = src.height, x = src.getContext('2d'), d = x.getImageData(0, 0, w, h), p = d.data
  const out = new Uint8ClampedArray(p)
  const A = (X, Y) => X >= 0 && Y >= 0 && X < w && Y < h && p[(Y * w + X) * 4 + 3] > 0
  const same = (X, Y, i) => { if (!A(X, Y)) return false; const j = (Y * w + X) * 4; return Math.abs(p[j] - p[i]) + Math.abs(p[j + 1] - p[i + 1]) + Math.abs(p[j + 2] - p[i + 2]) < 40 }
  for (let Y = 0; Y < h; Y++) for (let X = 0; X < w; X++) {
    const i = (Y * w + X) * 4
    if (p[i + 3]) {
      const c = [p[i], p[i + 1], p[i + 2]]
      let t = null
      if (!same(X, Y - 1, i) || !same(X - 1, Y, i)) t = mix(c, [255, 250, 235], light)
      if (!same(X, Y + 1, i) || !same(X + 1, Y, i)) t = mix(c, [20, 14, 40], dark)
      if (t) { out[i] = t[0]; out[i + 1] = t[1]; out[i + 2] = t[2] }
    } else if (outline) {
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) if (A(X + dx, Y + dy)) {
        const j = ((Y + dy) * w + X + dx) * 4, t = mix([p[j], p[j + 1], p[j + 2]], [27, 20, 36], 0.72)
        out[i] = t[0]; out[i + 1] = t[1]; out[i + 2] = t[2]; out[i + 3] = 255; break
      }
    }
  }
  d.data.set(out); x.putImageData(d, 0, 0)
  return src
}
// 字符画 → 画布（四周各留 1px 给描边）。'.' 透明
const sprCache = new Map()
export function spr(rows, { shade = true, pad = 1 } = {}) {
  const key = rows.join('|') + shade
  let c = sprCache.get(key)
  if (c) return c
  const h = rows.length, w = Math.max(...rows.map((r) => r.length))
  c = canvas(w + pad * 2, h + pad * 2)
  const x = c.getContext('2d')
  rows.forEach((row, y) => [...row].forEach((ch, xx) => { if (ch === '.' || ch === ' ') return; x.fillStyle = K[ch] || C[ch] || '#f0f'; x.fillRect(xx + pad, y + pad, 1, 1) }))
  if (shade) autoShade(c)
  sprCache.set(key, c)
  return c
}
// 图标（<img>/CSS 用）：放大后的 dataURL
const urlCache = new Map()
export function iconUrl(rows, scale = 3) {
  const k = rows.join('|') + scale
  if (!urlCache.has(k)) { const s = spr(rows), c = canvas(s.width * scale, s.height * scale), x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(s, 0, 0, c.width, c.height); urlCache.set(k, c.toDataURL()) }
  return urlCache.get(k)
}
export function blit(ctx, img, x, y, { flip = false, alpha = 1 } = {}) {
  x = Math.round(x); y = Math.round(y)
  if (alpha !== 1) ctx.globalAlpha = alpha
  if (flip) { ctx.save(); ctx.translate(x + img.width, y); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0); ctx.restore() } else ctx.drawImage(img, x, y)
  if (alpha !== 1) ctx.globalAlpha = 1
}
// ---------- 主角：大肥鱼（16×24，四分之三侧面，朝右；朝左时水平翻转） ----------
const WH_HEAD = [
  '.....hhhhh......',
  '...hhhhhhhhh....',
  '..hhiIihhhhhh...',
  '..hiIihhhhhhhh..',
  'f.hhhhhhhhhhhh.f',
  'ffhhhhhhhhhhhhff',
  'Ffhhhpphhhpphhf.',
  '.hhhppppppppphh.',
  '.hhppkcpppkcpph.',
  '.hhppkkpppkkpph.',
  '..hpoppppppopph.',
  '..hhppppkkpppH..',
  '...hHppppppHH...',
]
const WH_BLINK = ['.hhppppppppppph.', '.hhppkkpppkkpph.']
const WH_BODY = [
  '....eewwwwee....',
  '...peewrrweep...',
  '..ppeewwwweepp..',
  '..p.eEwwwwEe.p..',
  '....eeewwweee...',
  '...eeeeeeeeeeuu.',
  '..eeeeeeeeeeeuUu',
  '..ewewewewewe.u.',
]
const WH_LEGS = [
  ['....pp...pp.....', '...NNN...NNN....'],
  ['...pp.....pp....', '..NNN.....NNN...'],
  ['....pp...pp.....', '...NNN...NNN....'],
  ['.....pp.pp......', '....NNN.NNN.....'],
]
// frame：0–3 走路帧；blink：眨眼
export function whale(frame = 0, blink = false) {
  const head = blink ? [...WH_HEAD.slice(0, 8), WH_BLINK[0], WH_BLINK[1], ...WH_HEAD.slice(10)] : WH_HEAD
  return spr([...head, ...WH_BODY, ...WH_LEGS[frame % 4]])
}
// 工具（握在手上，配合挥动角度）
export const TOOLS = {
  can: spr(['..........', '...uuuu...', '..uaauuuu.', '.uuuuuuuuu', 'uuuuuuuu..', '.uUUUUu...', '..UUUU....']),
  hoe: spr(['....gg', '...ggW', '..nn..', '.nn...', 'nn....', 'n.....']),
  rod: spr(['.......n', '......n.', '.....n..', '....n...', '...n....', '..n.....', '.NN.....', 'NN......']),
  pick: spr(['.gggggg.', 'gWg..gWg', 'g..nn..g', '...nn...', '...nn...', '...nn...', '...NN...']),
  bag: spr(['..nn..', '.nmmn.', 'nmyymn', 'nmmmmn', '.nnnn.']),
}
// ---------- 作物：每种 4 阶段 + 枯萎 ----------
const SEEDLING = ['................', '................', '................', '................', '................', '................', '................', '................', '................', '................', '......d..d......', '.......dd.......', '................']
const SPROUT = ['................', '................', '................', '................', '................', '................', '......l..l......', '.....lLllLl.....', '......lLLl......', '.......L........', '.......L........', '.......d........', '................']
const GROW = ['................', '................', '................', '....l......l....', '...lLl....lLl...', '....lLl..lLl....', '.l...lL..Ll...l.', 'lLl...LLLL...lLl', '.lLL...LL...LLl.', '...LLL.LL.LLL...', '.....LLLLLL.....', '.......dd.......', '................']
const WITHER = ['................', '................', '................', '................', '.....m....m.....', '....mnm..mnm....', '......nm.mn.....', '...mn..nnn..nm..', '....nnn.nn.nn...', '.......nnn......', '........n.......', '.......NN.......', '................']
const RIPE = {
  turnip: ['......l.l.......', '.....lLlLl......', '....lLLlLLl.....', '......LLL.......', '.....wwwww......', '....wwwwwww.....', '...wwBwwwwww....', '...wBBwwwwww....', '...wwwwwwwwW....', '....wwwwwwW.....', '.....wwwwW......', '.......w........', '................'],
  carrot: ['....l..l..l.....', '....lL.lL.lL....', '.....lLLLLl.....', '.......LL.......', '......OOOO......', '.....OOROOO.....', '.....OOOORO.....', '......OROO......', '......OOOO......', '.......OR.......', '.......O........', '................', '................'],
  wheat: ['..y..y...y..y...', '.yYy.yYy.yYy.y..', '.yYy.yYy.yYy.Yy.', '.yYy.yYy.yYy.Yy.', '..Y...Y...Y..Y..', '..L...L...L..L..', '..L..LL..LL..L..', '.LL...L...L..LL.', '..L...L...L..L..', '..L...L...L..L..', '..LL.LL..LL.LL..', '................', '................'],
  strawberry: ['................', '....lLl..lLl....', '...lLLLllLLLl...', '..lLLlLLLLlLLl..', '...LrrLLLLrrL...', '...rrtrLLrtrr...', '...rrrr..rrrr...', '...rtrr..rrtr...', '....rr....rr....', '......LLLL......', '.......dd.......', '................', '................'],
  tomato: ['.....L.L.L......', '....LLLLLLL.....', '...LxxLLLxxL....', '..xxxxx.xxxxx...', '..xwxxx.xwxxx...', '..xxxxx.xxxxx...', '..xxxxq.xxxxq...', '...xxq...xxq....', '....L.....L.....', '....L.....L.....', '....LLLLLLL.....', '.......dd.......', '................'],
  corn: ['.......L........', '......lLl.......', '.....lyyYl......', '.....yyyYY..l...', '..l..yyYyY.lL...', '..Ll.yYyyY.L....', '...L.yyYyY.L....', '...LLyYyyYLL....', '....LLyyYLL.....', '..LL..LLL..LL...', '.LL....L....LL..', '.......L........', '......dd........'],
  grape: ['.....NNN........', '....N...l.......', '...vvvN..lL.....', '..vIvvvv.LL.....', '..vvvVvvv.......', '...vvvvVvv......', '...vVvvvvv......', '....vvvVv.......', '.....vvvv.......', '......vV........', '.......v........', '................', '................'],
  pumpkin: ['................', '.......NL.......', '.......NlL......', '...OOOOOOOOOO...', '..OOyOOOOOOyOO..', '.OOyOOOOOOOOyOO.', '.OOOOOOOOOOOOOO.', '.OOyOOOOOOOOyOO.', '.OOOOOOOOOOOOOO.', '..OOyOOOOOOyOO..', '...OOOOOOOOOO...', '................', '................'],
  cabbage: ['................', '................', '....lllllll.....', '...llLlllLll....', '..lLlllLlllLl...', '..llLlzzzlLll...', '..lLlzlllzlLl...', '..llLzlllzLll...', '...lLlzzzlLl....', '....lllLlll.....', '......LLL.......', '.......d........', '................'],
}
// 第 3 阶段：绿苗上长出缩小、半透明的果实（11-07）
const growing = (base, ripe) => { const c = canvas(base.width, base.height), g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(base, 0, 0); g.globalAlpha = 0.9; const w = Math.round(ripe.width * 0.62), h = Math.round(ripe.height * 0.62); g.drawImage(ripe, Math.round((base.width - w) / 2), base.height - h - 1, w, h); return c }
export const CROP = Object.fromEntries(Object.entries(RIPE).map(([k, v]) => [k, [spr(SEEDLING), spr(SPROUT), growing(spr(GROW), spr(v)), spr(v)]]))
export const CROP_WITHER = spr(WITHER)
// ---------- 动物（两帧） ----------
const AN = {
  chicken: [
    ['................', '.....rr.........', '....wwww........', '....wwkwR.......', '....wwwwRR......', '.....ww.........', '..wwwwwww.......', '.wwwwwwwww......', '.wwwWwwwwww.....', '.wwWwwwwwww.....', '..wwwwwwww......', '....y...y.......', '...yy..yy.......'],
    ['................', '................', '.....rr.........', '....wwww........', '....wwkwR.......', '..w..wwwRR......', '.wwwwwww........', '.wwwwwwwww......', '.wwwWwwwwww.....', '..wWwwwwww......', '...wwwwww.......', '....y...y.......', '...yy..yy.......'],
  ],
  duck: [
    ['................', '....LLLL........', '....LLkLY.......', '....LLLLYY......', '.....ss.........', '..sssssss.......', '.sssssssss......', '.sssmssssss.....', '.ssmsssssss.....', '..ssssssss......', '...ssssss.......', '....O...O.......', '...OO..OO.......'],
    ['................', '................', '....LLLL........', '....LLkLY.......', '..s.LLLLYY......', '.ssssss.........', '.sssssssss......', '.sssmssssss.....', '.ssmsssssss.....', '..ssssssss......', '...ssssss.......', '....O...O.......', '...OO..OO.......'],
  ],
  cow: [
    ['................', '.s............s.', '.wwww......wwwww', '.wkwkw....wwkkww', '.wwwww...kkwwwww', '.wBBBw.wwwwwwwkk', '..www.wwkkwwwwkk', '...wwwwwkkkwwwww', '...wkkwwwwwwwwww', '...wkkwwwwwkkwww', '...wwwwwwwwwkkw.', '...kk.kk...kk.kk', '...gg.gg...gg.gg'],
    ['................', '................', '.s............s.', '.wwww......wwwww', '.wkwkw....wwkkww', '.wwwww.wwkkwwwww', '.wBBBwwwwwwwwwkk', '...wwwwwkkkwwwkk', '...wkkwwwwwwwwww', '...wkkwwwwwkkwww', '...wwwwwwwwwkkw.', '...kk.kk...kk.kk', '...gg.gg...gg.gg'],
  ],
  sheep: [
    ['................', '................', '.....wWwWwWwW...', '...wWwwwwwwwwWw.', '..WwwwwwwwwwwwwW', 'kkwwwwwwwwwwwwww', 'kkkwWwwwwwwwwwwW', 'kkkwwwwwwwwwwwW.', 'kkwWwwwwwwwwwww.', '..wwwWwwwWwwwW..', '....kk....kk....', '....kk....kk....', '................'],
    ['................', '................', '.....wWwWwWwW...', '...wWwwwwwwwwWw.', '..WwwwwwwwwwwwwW', '..wwwwwwwwwwwwww', 'kkkwWwwwwwwwwwwW', 'kkkwwwwwwwwwwwW.', 'kkkWwwwwwwwwwww.', 'kk.wwWwwwWwwwW..', '....kk....kk....', '....kk....kk....', '................'],
  ],
  pig: [
    ['................', '................', '...BB......BB...', '..BBBBBBBBBBBB..', '.BBBBBBBBBBBBBB.', 'BBkBBBBBBBBBBBBo', 'BBBBBBBBBBBBBBBo', 'ooBBBBBBBBBBBBB.', 'okoBBBBBBBBBBBB.', 'ooBBBBBBBBBBBB..', '..BB.BB..BB.BB..', '..oo.oo..oo.oo..', '................'],
    ['................', '................', '................', '...BB......BB...', '..BBBBBBBBBBBB..', '.BBBBBBBBBBBBBB.', 'BBkBBBBBBBBBBBBo', 'BBBBBBBBBBBBBBBo', 'ooBBBBBBBBBBBBB.', 'okoBBBBBBBBBBB..', '..BB.BB..BB.BB..', '..oo.oo..oo.oo..', '................'],
  ],
}
export const ANIMAL = Object.fromEntries(Object.entries(AN).map(([k, [a, b]]) => [k, [spr(a), spr(b)]]))
// 猫猫商人（集市摊主）
export const CAT = [
  spr(['..y.....y...', '.yyy...yyy..', '.yyyyyyyyy..', 'yyYyyyyyYyy.', 'yykcyyykcyy.', 'yyyyyooyyyy.', '.yyyyyyyyy..', '..wwwwwwww..', '.wwwrrwwwww.', '.wwwwwwwwww.']),
  spr(['..y.....y...', '.yyy...yyy..', '.yyyyyyyyy..', 'yyYyyyyyYyy.', 'yykkyyykkyy.', 'yyyyyooyyyy.', '.yyyyyyyyy..', '..wwwwwwww..', '.wwwrrwwwww.', '.wwwwwwwwww.']),
]
// ---------- 物品图标 12–14px ----------
const fishArt = (b, d, f, eye = 'k') => ['..............', '.....bbbb.....', '...bbbbbbbb.f.', '..bbkbbbbbbbff', '.bbbbbbbbbbbbf', '.bbbbdbbbbbbff', '..bbbbbbbbbbf.', '...dbbbbbbd...', '.....dddd.....'].map((r) => r.replace(/b/g, b).replace(/d/g, d).replace(/f/g, f).replace(/k/g, eye))
const gemArt = (a, b) => ['....wwww....', '...waaaaw...', '..waAaaaab..', '.waAaaaaabb.', '.aaaaaaabbb.', '..aaaaabbb..', '...aaabbb...', '....abbb....', '.....bb.....'].map((r) => r.replace(/a/g, a).replace(/A/g, 'w').replace(/b/g, b))
const oreArt = (a) => ['....GGGG....', '..GGgGGGGG..', '.GGaGGGgGGG.', '.GaaGGGGaGG.', 'GGGGGgGaaGGG', 'GGaGGGGGGGgG', '.GGGGaaGGGG.', '..GGGGGGGG..'].map((r) => r.replace(/a/g, a))
const ITEM = {
  egg: ['....ww....', '...wwww...', '..wwwwww..', '..wwwwwW..', '.wwwwwwWw.', '.wwwwwwWw.', '..wwwwWw..', '...wwww...'],
  duckegg: ['....aa....', '...aaaa...', '..aaaaaa..', '..aauaaW..', '.aaaaaaWa.', '.aauaaaWa.', '..aaaaWa..', '...aaaa...'],
  milk: ['...gggg...', '...wwww...', '..wwwwww..', '..wuuuuw..', '..wuwwuw..', '..wuuuuw..', '..wwwwww..', '..wwwwww..', '...wwww...'],
  wool: ['...wWwW...', '.wWwwwwWw.', 'wwwwWwwwwW', 'WwwwwwwWww', '.wwWwwwww.', '..wwwWww..'],
  truffle: ['...NNNN...', '..NnNNNN..', '.NNNNnNNN.', '.NnNNNNNN.', '.NNNNNnNN.', '..NNnNNN..', '...NNNN...'],
  sardine: fishArt('g', 'G', 'G'), carp: fishArt('y', 'Y', 'R'), bass: fishArt('L', 'd', 'd'), salmon: fishArt('o', 'R', 'R'),
  tuna: fishArt('U', 'e', 'u'), puffer: ['....y.y.y...', '..yyyyyyyy..', '.yyykyyyyyy.', 'yyyyyyyyyyyY', 'yyyyyRyyyyYY', '.yyyyyyyyyY.', '..yyyyyyyy..', '....y.y.y...'],
  squid: ['....vvvv....', '...vvvvvv...', '...vIvvvv...', '...vkvvkv...', '...vvvvvv...', '...vvvvvv...', '..v.v..v.v..', '.v..v..v..v.', '.v.v....v.v.'],
  whale: fishArt('h', 'H', 'i', 'c'),
  coal: oreArt('k'), copper: oreArt('O'), iron: oreArt('W'), gold: oreArt('y'),
  amethyst: gemArt('v', 'V'), emerald: gemArt('z', 'd'), ruby: gemArt('x', 'q'), diamond: gemArt('c', 'u'),
  feed: ['..nnnnnn..', '.nssssssn.', 'nssyYsysn.', 'nsYsyssYsn', 'nssssYsssn', 'nsysssysn.', '.nnnnnnnn.'],
  bait: ['....o.....', '...ooo....', '..ooxoo...', '..oooooo..', '...ooooo..', '....ooo...', '.....o....'],
  coffee: ['..g.g.g...', '...g.g....', '.wwwwwww..', '.wbbbbbwww', '.wbbbbbw.w', '.wbbbbbwww', '.wwwwwww..', '..wwwww...'],
  coin: ['...YYYY...', '..YyyyyY..', '.YyYYYYyY.', '.YyYttYyY.', '.YyYYYYyY.', '..YyyyyY..', '...YYYY...'],
  energy: ['.....yy...', '....yyY...', '...yyY....', '..yyyyyy..', '....yyY...', '...yyY....', '..yY......'],
  seed: ['...nnnn...', '..nmmmmn..', '.nmmyymmn.', '.nmyLLymn.', '.nmmyymmn.', '..nmmmmn..', '...nnnn...'],
  trap: ['.nnnnnnnn.', 'nNnNnNnNnn', 'nnnnnnnnnn', 'nNnNnNnNnn', 'nnnnnnnnnn', '.nnnnnnnn.'],
  heart: ['.rr.rr.', 'rRrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'],
  star: ['...y...', '..yyy..', 'yyyyyyy', '.yyyyy.', '.yy.yy.', 'y.....y'],
  drop: ['..u..', '.uuu.', 'uuauu', 'uuuuu', '.uuu.'],
  ladder: ['n....n', 'nnnnnn', 'n....n', 'n....n', 'nnnnnn', 'n....n', 'n....n', 'nnnnnn', 'n....n'],
}
for (const [k, v] of Object.entries(RIPE)) if (!ITEM[k]) ITEM[k] = v.slice(2, 12).map((r) => r.slice(1, 15))
export const ITEM_ROWS = ITEM
export const itemSpr = (id) => spr(ITEM[id] || ITEM.seed)
// 11-07 贴图包：有贴图的物品优先用贴图图标
let packIcon = null
export const setPackIcons = (fn) => { packIcon = fn }
export const canvasIcon = (c) => c.toDataURL()
const ICON_ALIAS = {"salad":"carrot","flour":"wheat","jam":"strawberry","ketchup":"tomato","popcorn":"corn","wine":"grape","pie":"pumpkin","kimchi":"cabbage","mayo":"duckegg","cheese":"milk","sweater":"wool","ironbar":"iron","ingot":"gold","jewel":"ruby","crown":"diamond","bomb":"coal","guard1":"sardine","guard2":"ruby","guard3":"emerald","cloak":"amethyst","sack":"wool"}
export const itemIcon = (id, scale = 3) => { const own = packIcon && packIcon(id); if (own) return own; if (Object.hasOwn(ICON_ALIAS, id)) id = ICON_ALIAS[id]; else if (typeof id === 'string' && id.startsWith('sd_')) id = 'seed'; return (packIcon && packIcon(id)) || iconUrl(ITEM[id] || ITEM.seed, scale) }

// ---------- 程序化画笔 ----------
function painter(ctx, seed = 7) {
  const R = rng(seed)
  const P = {
    R,
    px: (x, y, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1) },
    rect: (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h) },
    disc: (cx, cy, r, c) => { ctx.fillStyle = c; for (let y = -r; y <= r; y++) { const w = Math.floor(Math.sqrt(r * r - y * y + r * 0.6)); ctx.fillRect(cx - w, cy + y, w * 2 + 1, 1) } },
    ellipse: (cx, cy, rx, ry, c) => { ctx.fillStyle = c; for (let y = -ry; y <= ry; y++) { const w = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + 0.5)))); ctx.fillRect(cx - w, cy + y, w * 2 + 1, 1) } },
    noise: (x, y, w, h, colors, density) => { for (let i = 0; i < w * h * density; i++) P.px(x + Math.floor(R() * w), y + Math.floor(R() * h), colors[Math.floor(R() * colors.length)]) },
  }
  return P
}
// 一片树冠：几团圆 + 阴影 + 高光点
function tree(ctx, x, y, seed, kind = 0, season = 0) {
  const P = painter(ctx, seed)
  P.ellipse(x + 8, y + 27, 9, 3, 'rgba(10,20,10,.35)')
  P.rect(x + 6, y + 16, 4, 11, C.b1); P.rect(x + 7, y + 16, 2, 11, C.b2); P.px(x + 6, y + 26, C.b0); P.px(x + 9, y + 26, C.b0)
  if(season===3){
    for(const[dx,dy,len]of[[-1,-1,7],[1,-1,6],[-1,-2,4],[1,-2,4]])for(let k=0;k<len;k++){P.rect(x+7+dx*k,y+18+dy*k,2,2,C.b1);if(k>1)P.px(x+7+dx*k,y+17+dy*k,'#eaf0ef')}
    P.rect(x+5,y+25,7,2,'#d3e1e6');P.rect(x+6,y+24,5,1,'#f3f5ee');return;
  }
  const ramp = season===2?['#604332','#875a35','#a8783f','#c2934d','#dbc17b']:season===1?['#284b38','#355d4a','#4d7850','#699451','#91af67']:kind===1?['#69494b','#9d6d71','#c18c85','#dfb3a1','#f0d1b5']:[C.l0,C.l1,C.l2,C.l3,C.l4]
  const blobs = [[8, 9, 8], [3, 12, 5], [13, 12, 5], [8, 4, 5], [4, 6, 4], [12, 6, 4]]
  for (const [bx, by, r] of blobs) P.disc(x + bx, y + by + 1, r, ramp[0])
  for (const [bx, by, r] of blobs) P.disc(x + bx, y + by, r - 1, ramp[1])
  for (const [bx, by, r] of blobs) P.disc(x + bx - 1, y + by - 1, r - 2, ramp[2])
  for (const [bx, by, r] of blobs) if (r > 3) P.disc(x + bx - 2, y + by - 2, r - 4, ramp[3])
  for (let i = 0; i < 9; i++) P.px(x + 3 + Math.floor(P.R() * 10), y + 2 + Math.floor(P.R() * 10), ramp[4])
  if (kind === 0 && season!==0 && P.R() < 0.5) for (let i = 0; i < 3; i++) { const ax = x + 3 + Math.floor(P.R() * 10), ay = y + 5 + Math.floor(P.R() * 9); P.px(ax, ay, C.fr); P.px(ax + 1, ay, '#c23a3a') }
}
function bush(ctx, x, y, seed, season=0) {
  const P = painter(ctx, seed),leaf=season===3?["#667b79","#8ca4a4","#b7cacc","#d9e5e6","#f3f4ec"]:season===2?["#5d4734","#86633c","#a78647","#c3a361","#ded09c"]:[C.l0,C.l1,C.l2,C.l3,C.l4]
  P.ellipse(x + 7, y + 11, 7, 2, 'rgba(10,20,10,.3)')
  P.disc(x + 4, y + 7, 4, leaf[1]); P.disc(x + 10, y + 7, 4, leaf[1]); P.disc(x + 7, y + 5, 4, leaf[1])
  P.disc(x + 4, y + 6, 3, leaf[2]); P.disc(x + 10, y + 6, 3, leaf[2]); P.disc(x + 7, y + 4, 3, leaf[3])
  P.px(x + 6, y + 2, leaf[4]); P.px(x + 3, y + 4, leaf[4]); P.px(x + 10, y + 4, leaf[4])
  if (season!==3 && P.R() < 0.6) { const c = [C.fp, C.fw, C.fy][Math.floor(P.R() * 3)]; P.px(x + 5, y + 5, c); P.px(x + 9, y + 3, c); P.px(x + 11, y + 7, c) }
}
function rockSmall(ctx, x, y, seed) {
  const P = painter(ctx, seed)
  P.ellipse(x + 6, y + 8, 6, 2, 'rgba(0,0,0,.25)')
  P.ellipse(x + 6, y + 5, 5, 4, C.r1); P.ellipse(x + 6, y + 4, 4, 3, C.r2); P.ellipse(x + 5, y + 3, 3, 2, C.r3); P.px(x + 4, y + 2, C.r4)
}
// 地形底图（静态，一次性烘焙）：草地、小路、沙滩、海、悬崖
export const TILE = 16
const GRASS = [
  [C.g0, C.g1, C.g2, C.g3, C.g4, C.g5], // 春
  ['#294a38','#355d4a','#4e7750','#618b53','#88aa6a','#acc68a'], // 夏：更深更绿
  ['#3f4420', '#5c6229', '#7a7a34', '#98923f', '#bcae58', '#ddcd88'], // 秋：橄榄金
  ['#7d8aa3', '#a7b4c8', '#c8d3e2', '#e4ebf3', '#f4f8fc', '#ffffff'], // 冬：积雪
]
// Native static terrain baking. Visual edges never change the walkability map.
function b12TerrainDetail(ctx,map,W,H,seed,season,weather){
 const P=painter(ctx,seed^0x5268),T=16,winter=season===3;
 const at=(x,y)=>x<0||y<0||x>=W||y>=H?'~':map[y][x];
 const sides=[[0,-1],[1,0],[0,1],[-1,0]];
 const strip=(X,Y,side,k,len,width,color)=>{
  if(side===0)P.rect(X+k,Y,len,width,color);
  else if(side===1)P.rect(X+T-width,Y+k,width,len,color);
  else if(side===2)P.rect(X+k,Y+T-width,len,width,color);
  else P.rect(X,Y+k,width,len,color);
 };
 // Shallows follow the existing shoreline; an inset highlight softens tile steps.
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const t=at(x,y),X=x*T,Y=y*T;
  if(t==='~'){
   const pond=x>=14&&x<=21&&y>=19&&y<=25;
   if(pond){P.rect(X,Y,T,T,winter?'#749598':'#477e7c');P.noise(X,Y,T,T,[winter?'#86a7ab':'#538c88'],.012)}
   for(let i=0;i<4;i++){const[dx,dy]=sides[i],land=at(x+dx,y+dy);if(land==='~')continue;
    for(let k=0;k<T;k+=4){const d=3+Math.floor(P.R()*3);strip(X,Y,i,k,4,d+3,pond?'#649b92':winter?'#84adb4':'#6aa4ac');strip(X,Y,i,k,4,d,pond?'#83b4a0':winter?'#bfd0cb':'#94c2ba');if(land===','&&k%8===0)strip(X,Y,i,k,3,1,'#e6e8d8')}
   }
   if(P.R()<.10){P.rect(X+4,Y+9,5,1,pond?'#81b3a6':'#7db4bd');P.px(X+10,Y+10,pond?'#639e96':'#5b99a8')}
   if(pond&&winter&&P.R()<.28){P.rect(X+4,Y+7,7,1,'#a7c1c6');P.rect(X+5,Y+8,4,1,'#95b2b9')}
  }
  if(t===','){
   for(let i=0;i<4;i++){const[dx,dy]=sides[i],n=at(x+dx,y+dy);if(n==='~')for(let k=0;k<T;k+=4){strip(X,Y,i,k,4,4+Math.floor(P.R()*3),winter?'#a5b7b8':'#bcae8b');strip(X,Y,i,k,4,2,winter?'#c3ceca':'#d3c9aa')}
    if(winter&&n==='.')for(let k=0;k<T;k+=4){strip(X,Y,i,k,4,6+Math.floor(P.R()*5),'#d7e0e3');strip(X,Y,i,k,4,3,'#edf0ec')}
   }
   if(P.R()<.09){const c=winter?'#8a9b9b':'#a6967c';P.rect(X+7,Y+9,3,2,c);P.rect(X+7,Y+8,2,1,winter?'#d0d7d4':'#e3d5b5')}
  }
  if(t==='='){
   const edge=winter?'#9dada7':'#ac9871',rim=winter?'#dce4df':'#c5b28a';
   for(let i=0;i<4;i++){const[dx,dy]=sides[i];if(at(x+dx,y+dy)!=='.')continue;for(let k=0;k<T;k+=4){strip(X,Y,i,k,4,2+Math.floor(P.R()*2),edge);if(k%8===0)strip(X,Y,i,k,3,1,rim)}}
   const horizontal=at(x-1,y)==='='&&at(x+1,y)==='=',vertical=at(x,y-1)==='='&&at(x,y+1)==='=';
   if(horizontal&&!vertical){P.rect(X+2,Y+6,11,1,weather===1?'#a28b6d':'#c3ac86');P.rect(X+4,Y+11,8,1,'#ab9270')}
   if(vertical&&!horizontal){P.rect(X+6,Y+2,1,10,weather===1?'#a28b6d':'#c3ac86');P.rect(X+11,Y+4,1,9,'#ab9270')}
   if(P.R()<.15){P.rect(X+7,Y+8,3,2,'#938d79');P.rect(X+7,Y+8,2,1,'#d1c5a5')}
  }
 }
 // Sparse reeds sit on the pond bank, not on paths or clickable farm cells.
 for(let y=19;y<=25;y++)for(let x=14;x<=21;x++)if(at(x,y)==='.'&&sides.some(([dx,dy])=>at(x+dx,y+dy)==='~')&&P.R()<.45){
  const X=x*T+7,Y=y*T+10,col=winter?'#8d927b':season===2?'#9c8a50':'#66855b';
  P.rect(X,Y-7,1,7,col);P.rect(X+3,Y-5,1,5,col);P.rect(X-2,Y-4,1,4,col);P.rect(X,Y-9,1,3,winter?'#c9d1bd':'#8a6a47');
  if(winter)P.rect(X-2,Y+1,7,1,'#eef1e7');
 }
}

export function bakeTerrain(map, W, H, seed = 20261104, season = 0, weather=0) {
  const c = canvas(W * TILE, H * TILE), ctx = c.getContext('2d'), P = painter(ctx, seed)
  const G = GRASS[season] || GRASS[0], g = { g0: G[0], g1: G[1], g2: G[2], g3: G[3], g4: G[4], g5: G[5] }
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? '~' : map[y][x])
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = at(x, y), X = x * TILE, Y = y * TILE
    if (t === '~') { P.rect(X, Y, TILE, TILE, C.w1); P.noise(X, Y, TILE, TILE, [C.w0, C.w2], 0.006) }
    else if (t === ',') { P.rect(X,Y,TILE,TILE,season===3?'#c5c9bb':'#d5c59d'); P.noise(X,Y,TILE,TILE,season===3?['#b8c2bc','#d9ddd0']:['#ccbb93','#e3d3ae'],.018); if (P.R() < 0.06) { P.px(X + 5, Y + 7, C.fw); P.px(X + 6, Y + 7, C.fp) } }
    else if (t === '=') { P.rect(X,Y,TILE,TILE,season===3?'#adb5a9':weather===1?'#ad9470':'#b9a17c'); P.noise(X, Y, TILE, TILE, [C.d1, C.d3, C.d3, C.d4], 0.12); if(weather===1&&P.R()<.16){P.ellipse(X+8,Y+10,5,2,'#687c76');P.rect(X+5,Y+9,4,1,'#a6bcb2')} if(season===2&&P.R()<.2){P.rect(X+4,Y+4,2,1,'#bc8745');P.px(X+11,Y+12,'#995f38')}  if (P.R() < 0.3) P.px(X + Math.floor(P.R() * 14) + 1, Y + Math.floor(P.R() * 14) + 1, C.r3) }
    else if (t === '#') { P.rect(X, Y, TILE, TILE, C.r1); P.noise(X, Y, TILE, TILE, [C.r0, C.r2, C.r2], 0.25) }
    else { // 草
      P.rect(X, Y, TILE, TILE, g.g3)
      P.noise(X, Y, TILE, TILE, [g.g2, g.g2, g.g4], 0.014)
      for (let i = 0; i < (P.R()<.22?2:0); i++) { const bx = X + 1 + Math.floor(P.R() * 14), by = Y + 2 + Math.floor(P.R() * 13); P.px(bx, by, g.g2); P.px(bx, by - 1, g.g4) }
      if (season!==3 && P.R() < (season===0?.07:.025)) { const fc = [C.fy, C.fw, C.fp, C.fv][Math.floor(P.R() * 4)], fx = X + 3 + Math.floor(P.R() * 10), fy = Y + 3 + Math.floor(P.R() * 10); P.px(fx, fy, fc); P.px(fx + 1, fy + 1, g.g1) }
    }
  }
  // 过渡：草地压在沙/路/海上的边缘（不规则锯齿）+ 沙滩接海的湿沙与浪花底
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = at(x, y), X = x * TILE, Y = y * TILE
    if (t === '.') {
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
        const n = at(x + dx, y + dy)
        if (n === ',' || n === '=' || n === '~') for (let k = 0; k < TILE; k++) {
          const j = 1 + Math.floor(P.R() * 3)
          if (dy === 1) { P.rect(X + k, Y + TILE, 1, j, g.g3); P.px(X + k, Y + TILE + j, g.g1) }
          if (dy === -1) { P.rect(X + k, Y - j, 1, j, g.g4) }
          if (dx === 1) P.rect(X + TILE, Y + k, j, 1, g.g3)
          if (dx === -1) P.rect(X - j, Y + k, j, 1, g.g3)
        }
        if (n === '~' && dy === 1) P.rect(X, Y + TILE + 2, TILE, 2, g.g1)
      }
    }
    if (t === ',') for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) if (at(x + dx, y + dy) === '~') {
      if (dx === 1) { P.rect(X + 12, Y, 4, TILE, C.a1); P.noise(X + 12, Y, 4, TILE, [C.a0], 0.3) }
      if (dx === -1) P.rect(X, Y, 3, TILE, C.a1)
      if (dy === 1) P.rect(X, Y + 12, TILE, 4, C.a1)
      if (dy === -1) P.rect(X, Y, TILE, 3, C.a1)
    }
    if (t === '#' && at(x, y + 1) !== '#') { // 悬崖正面
      P.rect(X, Y + 6, TILE, 10, C.r2); P.rect(X, Y + 6, TILE, 2, C.r3)
      for (let k = 0; k < 4; k++) P.rect(X + Math.floor(P.R() * 14), Y + 8 + Math.floor(P.R() * 6), 2, 1, C.r1)
      P.rect(X, Y + 15, TILE, 1, C.r0)
    }
  }
  b12TerrainDetail(ctx,map,W,H,seed,season,weather);
  return c
}
// ---------- 建筑（静态）：每个返回一张带透明的画布 ----------
export function bakeHouse(level = 0) {
  const c = canvas(80, 72), x = c.getContext('2d'), P = painter(x, 31 + level)
  P.ellipse(40, 66, 38, 5, 'rgba(10,20,10,.35)')
  // 墙
  P.rect(8, 30, 64, 34, C.wl1); P.rect(9, 30, 62, 33, C.wl2)
  for (let yy = 34; yy < 63; yy += 5) P.rect(9, yy, 62, 1, C.wl1)
  P.rect(8, 60, 64, 4, C.b2); P.rect(8, 63, 64, 1, C.b0)
  // 屋顶（青瓦，一行深一行浅，随等级变色更华丽）
  const roof = level >= 3 ? [C.rf0, C.rf1, C.rf2, C.rf3, C.rf4] : [C.tl0, C.tl1, C.tl2, C.tl3, C.tl4]
  for (let r = 0; r < 7; r++) {
    const y0 = 4 + r * 4, inset = 18 - r * 3
    P.rect(inset, y0, 80 - inset * 2, 4, roof[1])
    for (let k = inset; k < 80 - inset; k += 6) { P.rect(k + (r % 2) * 3, y0, 5, 3, roof[2]); P.px(k + (r % 2) * 3, y0, roof[3]) }
    P.rect(inset, y0 + 3, 80 - inset * 2, 1, roof[0])
  }
  P.rect(0, 30, 80, 3, roof[0]); P.rect(1, 29, 78, 2, roof[2]); P.rect(1, 29, 78, 1, roof[4])
  // 烟囱
  P.rect(56, 2, 8, 14, C.r1); P.rect(57, 2, 6, 13, C.r2); P.rect(55, 1, 10, 3, C.r3)
  // 门
  P.rect(34, 40, 13, 24, C.b0); P.rect(35, 41, 11, 23, C.b2); P.rect(36, 42, 4, 20, C.b3); P.rect(41, 42, 4, 20, C.b3); P.px(44, 52, C.gold)
  P.rect(32, 38, 17, 2, C.b1)
  // 窗（夜里由场景叠加灯光）
  for (const wx of [14, 54]) { P.rect(wx, 40, 13, 11, C.b1); P.rect(wx + 1, 41, 11, 9, '#7fb6d6'); P.rect(wx + 1, 41, 5, 4, '#c2e4f2'); P.rect(wx + 6, 41, 1, 9, C.b1); P.rect(wx + 1, 45, 11, 1, C.b1); P.rect(wx - 1, 51, 15, 2, C.b2) }
  // 花箱
  for (const wx of [13, 53]) { P.rect(wx, 53, 15, 3, C.b3); for (let k = 0; k < 5; k++) P.px(wx + 1 + k * 3, 52, [C.fp, C.fy, C.fr, C.fw, C.fv][(k + level) % 5]) }
  // 等级小旗
  for (let k = 0; k < level; k++) { P.rect(70 - k * 4, 18 - k, 1, 8, C.b1); P.rect(71 - k * 4, 18 - k, 3, 2, [C.fy, C.fp, C.fv, C.fr, C.gold][k]) }
  return c
}
export function bakeBarn() {
  const c = canvas(72, 64), x = c.getContext('2d'), P = painter(x, 41)
  P.ellipse(36, 59, 34, 4, 'rgba(10,20,10,.35)')
  P.rect(6, 24, 60, 34, C.rf1); for (let k = 7; k < 66; k += 4) P.rect(k, 24, 2, 34, C.rf2)
  P.rect(6, 56, 60, 2, C.rf0)
  // 屋顶（深灰）
  for (let r = 0; r < 6; r++) { const inset = 16 - r * 3; P.rect(inset, 4 + r * 4, 72 - inset * 2, 4, r % 2 ? C.r1 : C.r2); P.rect(inset, 7 + r * 4, 72 - inset * 2, 1, C.r0) }
  P.rect(2, 26, 68, 3, C.r0); P.rect(3, 25, 66, 2, C.r3)
  // 大门 + 白色叉
  P.rect(24, 32, 24, 26, C.wl3); P.rect(26, 34, 20, 24, C.rf2)
  for (let k = 0; k < 20; k++) { P.px(26 + k, 34 + Math.round(k * 1.2), C.wl3); P.px(45 - k, 34 + Math.round(k * 1.2), C.wl3); P.px(26 + k, 35 + Math.round(k * 1.2), C.wl2); P.px(45 - k, 35 + Math.round(k * 1.2), C.wl2) }
  P.rect(35, 34, 2, 24, C.wl3)
  // 阁楼窗
  P.rect(31, 13, 10, 8, C.wl3); P.rect(32, 14, 8, 6, C.b0); P.rect(35, 14, 2, 6, C.wl3)
  // 干草
  P.ellipse(60, 54, 6, 4, C.a0); P.ellipse(60, 53, 5, 3, C.a2); P.noise(55, 50, 10, 6, [C.a3, C.a1], 0.3)
  return c
}
export function bakeStall() {
  const c = canvas(80, 64), x = c.getContext('2d'), P = painter(x, 51)
  P.ellipse(40, 59, 38, 4, 'rgba(10,20,10,.3)')
  // 柱子
  for (const px of [6, 70]) { P.rect(px, 14, 4, 44, C.b1); P.rect(px + 1, 14, 2, 44, C.b3) }
  // 柜台
  P.rect(4, 38, 72, 20, C.b2); for (let k = 5; k < 76; k += 7) P.rect(k, 39, 1, 18, C.b1); P.rect(2, 36, 76, 4, C.b4); P.rect(2, 36, 76, 1, C.b5)
  // 货箱：菜、鱼、矿
  const crate = (cx, colors) => { P.rect(cx, 26, 16, 11, C.b3); P.rect(cx, 26, 16, 1, C.b5); P.rect(cx, 31, 16, 1, C.b1); for (let k = 0; k < 9; k++) P.disc(cx + 3 + (k % 3) * 5, 24 - Math.floor(k / 3) * 2 + 2, 2, colors[k % colors.length]) }
  crate(12, [C.fr, '#ff9c3a', '#9be070']); crate(52, ['#7fb2ff', '#c3c2d1', '#ffcf4a'])
  // 遮阳棚（红白条纹，波浪下摆）
  for (let k = 0; k < 10; k++) { P.rect(2 + k * 8, 4, 8, 12, k % 2 ? C.wl3 : C.rf2); P.disc(6 + k * 8, 16, 4, k % 2 ? C.wl3 : C.rf2) }
  P.rect(2, 4, 80, 2, C.rf0); P.rect(2, 3, 76, 1, C.rf3)
  // 招牌
  P.rect(30, 0, 20, 7, C.b1); P.rect(31, 1, 18, 5, C.b4)
  for (let k = 0; k < 4; k++) P.rect(34 + k * 4, 2, 2, 3, C.b0)
  return c
}
export function bakeBoard() {
  const c = canvas(28, 30), x = c.getContext('2d'), P = painter(x, 61)
  P.ellipse(14, 27, 12, 2, 'rgba(0,0,0,.3)')
  P.rect(4, 12, 3, 16, C.b1); P.rect(21, 12, 3, 16, C.b1)
  P.rect(1, 2, 26, 16, C.b1); P.rect(2, 3, 24, 14, C.b3)
  P.rect(4, 5, 9, 7, C.wl3); P.rect(15, 4, 8, 9, '#ffe8a8'); P.rect(5, 6, 7, 1, C.r2); P.rect(5, 8, 5, 1, C.r2); P.rect(16, 6, 6, 1, C.r2); P.rect(16, 8, 4, 1, C.r2)
  P.px(8, 5, C.fr); P.px(19, 4, C.fr)
  return c
}
export function bakeGate() {
  const c = canvas(48, 52), x = c.getContext('2d'), P = painter(x, 71)
  P.ellipse(24, 49, 22, 3, 'rgba(0,0,0,.3)')
  for (const px of [6, 38]) { P.rect(px, 10, 5, 38, C.rf1); P.rect(px + 1, 10, 3, 38, C.rf2); P.rect(px - 1, 44, 7, 4, C.r2) }
  P.rect(0, 4, 48, 5, C.rf0); P.rect(1, 3, 46, 3, C.rf2); P.rect(4, 12, 40, 3, C.rf1)
  // 旗帜 + 交叉剑
  P.rect(16, 15, 16, 18, C.wl3); P.rect(16, 33, 4, 3, C.wl3); P.rect(28, 33, 4, 3, C.wl3)
  for (let k = 0; k < 10; k++) { P.px(19 + k, 18 + k, C.r2); P.px(28 - k, 18 + k, C.r2) }
  P.rect(18, 27, 4, 2, C.b2); P.rect(26, 27, 4, 2, C.b2)
  return c
}
export function bakeMine() {
  const c = canvas(64, 56), x = c.getContext('2d'), P = painter(x, 81)
  // 山体
  P.ellipse(32, 30, 32, 26, C.r1); P.ellipse(30, 26, 28, 22, C.r2); P.ellipse(26, 20, 18, 14, C.r3)
  P.noise(4, 6, 56, 46, [C.r1, C.r3, C.r0], 0.06)
  for (let i = 0; i < 5; i++) { const ox = 10 + Math.floor(P.R() * 44), oy = 10 + Math.floor(P.R() * 30); P.px(ox, oy, [C.gold, '#b48cff', '#7fb2ff'][i % 3]) }
  // 洞口
  P.ellipse(32, 44, 14, 12, C.r0); P.ellipse(32, 46, 11, 10, '#0c0a12'); P.rect(18, 48, 28, 8, '#0c0a12')
  // 木支架
  P.rect(17, 34, 4, 22, C.b1); P.rect(43, 34, 4, 22, C.b1); P.rect(15, 32, 34, 4, C.b2); P.rect(15, 32, 34, 1, C.b4)
  // 铁轨
  for (let k = 0; k < 4; k++) P.rect(24, 49 + k * 2, 16, 1, C.b1)
  P.rect(26, 48, 1, 8, C.r3); P.rect(37, 48, 1, 8, C.r3)
  // 灯
  P.rect(13, 38, 3, 4, C.gold); P.px(14, 37, C.r0)
  return c
}
export function bakeAnvil() {
  const c = canvas(28, 22), x = c.getContext('2d'), P = painter(x, 91)
  P.ellipse(14, 19, 12, 2, 'rgba(0,0,0,.3)')
  P.rect(8, 12, 10, 7, C.b2); P.rect(8, 12, 10, 1, C.b4)
  P.rect(3, 6, 20, 5, C.r1); P.rect(3, 6, 20, 1, C.r4); P.rect(0, 6, 4, 3, C.r2); P.rect(10, 11, 6, 2, C.r0)
  P.rect(20, 1, 2, 6, C.b1); P.rect(18, 0, 6, 3, C.r3)
  return c
}
export function bakeDock(len) {
  const c = canvas(len * TILE, 2 * TILE + 8), x = c.getContext('2d'), P = painter(x, 99)
  for (let k = 0; k < len * TILE; k += 16) { P.rect(k + 2, 26, 3, 14, C.b0); P.rect(k + 12, 26, 3, 14, C.b0) }
  for (let k = 0; k < len * TILE; k += 5) { P.rect(k, 2, 4, 26, C.b3); P.rect(k, 2, 4, 1, C.b5); P.rect(k + 4, 2, 1, 26, C.b1); if (P.R() < 0.4) P.px(k + 1, 4 + Math.floor(P.R() * 20), C.b2) }
  P.rect(0, 27, len * TILE, 2, C.b1)
  return c
}
export function bakeFence(w, h) { // w,h in tiles；横栏 + 立柱
  const c = canvas(w * TILE + 4, h * TILE + 8), x = c.getContext('2d'), P = painter(x, 111)
  const post = (px, py) => { P.rect(px, py, 3, 10, C.b1); P.rect(px, py, 3, 1, C.b5); P.rect(px + 1, py + 1, 1, 8, C.b3) }
  const rail = (x0, y0, len, vert) => { if (vert) { P.rect(x0 + 1, y0, 1, len, C.b3) } else { P.rect(x0, y0 + 2, len, 2, C.b3); P.rect(x0, y0 + 2, len, 1, C.b4); P.rect(x0, y0 + 6, len, 2, C.b3) } }
  rail(0, 0, w * TILE, false); rail(0, h * TILE - 2, w * TILE, false)
  for (let k = 0; k <= w; k++) { post(k * TILE, 0); post(k * TILE, h * TILE - 2) }
  for (let k = 1; k < h; k++) { post(0, k * TILE - 2); post(w * TILE, k * TILE - 2) }
  return c
}
// 场景里的点缀（树、灌木、石头）一次画进地形层
function palm(ctx, x, y, seed) {
  const P = painter(ctx, seed)
  P.ellipse(x + 10, y + 31, 8, 2, 'rgba(60,40,10,.3)')
  for (let k = 0; k < 20; k++) { const bx = x + 8 + Math.round(Math.sin(k / 6) * 2); P.rect(bx, y + 11 + k, 3, 1, k % 3 ? C.b3 : C.b2) }
  const leaf = (dx, dy, dir) => { for (let k = 0; k < 9; k++) { const lx = x + 9 + dir * k, ly = y + 10 + dy + Math.round((k * k) / 12); P.rect(lx, ly, 2, 2, k < 3 ? C.l2 : C.l3); if (k % 2) P.px(lx, ly + 2, C.l1) } }
  leaf(0, -2, 1); leaf(0, -2, -1); leaf(0, 0, 1); leaf(0, 0, -1)
  for (let k = 0; k < 6; k++) P.rect(x + 9 - 3 + k, y + 4 + Math.abs(k - 3), 2, 2, C.l3)
  P.disc(x + 9, y + 12, 1, C.b1); P.disc(x + 12, y + 12, 1, C.b1)
}
function shell(ctx, x, y, seed) {
  const P = painter(ctx, seed), c = [[C.fp, '#ffd6e0'], [C.wl3, C.wl1], ['#ffb38a', '#ffe0c8']][seed % 3]
  P.rect(x, y + 1, 4, 2, c[0]); P.rect(x + 1, y, 2, 1, c[1]); P.px(x + 1, y + 1, c[1])
}
function trough(ctx, x, y) {
  const P = painter(ctx, 5)
  P.ellipse(x + 12, y + 10, 13, 2, 'rgba(0,0,0,.25)')
  P.rect(x, y + 2, 24, 7, C.b1); P.rect(x + 1, y + 2, 22, 2, C.w3); P.rect(x + 1, y + 2, 22, 1, C.w4); P.rect(x, y + 8, 24, 1, C.b0)
  P.rect(x + 30, y - 2, 12, 10, C.a1); P.rect(x + 30, y - 2, 12, 2, C.a3); P.noise(x + 30, y, 12, 8, [C.a0, C.a2], 0.3)
}
function bench(ctx, x, y) {
  const P = painter(ctx, 6)
  P.rect(x, y + 3, 18, 3, C.b3); P.rect(x, y + 3, 18, 1, C.b5); P.rect(x, y, 18, 2, C.b2); P.rect(x + 1, y + 6, 2, 4, C.b1); P.rect(x + 15, y + 6, 2, 4, C.b1)
}
function lily(ctx, x, y, seed) {
  const P = painter(ctx, seed)
  P.disc(x, y, 2, C.l2); P.px(x + 1, y - 1, C.l4); P.px(x, y + 2, C.w2); if (seed % 2) { P.px(x - 1, y - 1, C.fp); P.px(x, y - 2, C.fw) }
}
function flowers(ctx, x, y, seed) {
  const P = painter(ctx, seed), c = [C.fp, C.fy, C.fw, C.fv, C.fr][seed % 5]
  for (let k = 0; k < 9; k++) { const fx = x + Math.floor(P.R() * 18), fy = y + Math.floor(P.R() * 10); P.px(fx, fy + 1, C.g1); P.px(fx, fy + 2, C.g2); P.px(fx, fy, c); if (P.R() < 0.4) { P.px(fx - 1, fy, c); P.px(fx + 1, fy, c) } }
}
export function bakeDecor(ctx, items, season=0) {
  for (const [kind, x, y, seed, v] of items) { if (kind === 'tree') tree(ctx, x, y, seed, v || 0, season); else if (kind === 'bush') bush(ctx, x, y, seed, season); else if (kind === 'rock') rockSmall(ctx, x, y, seed); else if (kind === 'flowers') flowers(ctx, x, y, seed); else if (kind === 'palm') palm(ctx, x, y, seed); else if (kind === 'shell') shell(ctx, x, y, seed); else if (kind === 'trough') trough(ctx, x, y); else if (kind === 'bench') bench(ctx, x, y); else if (kind === 'lily') lily(ctx, x, y, seed) }
}
// 一块耕地（干 / 湿）
const soilCache = new Map()
export function soil(wet, seed = 1) {
  const k = (wet ? 'w' : 'd') + (seed % 4)
  if (soilCache.has(k)) return soilCache.get(k)
  const c = canvas(TILE, TILE), x = c.getContext('2d'), P = painter(x, 200 + seed)
  const r = wet ? [C.wt0, C.wt1, C.s1, C.s2] : [C.s0, C.s2, C.s3, C.s4]
  P.rect(1, 1, 14, 14, r[1]); P.rect(1, 1, 14, 1, r[0]); P.rect(1, 14, 14, 1, r[3])
  for (let yy = 3; yy < 14; yy += 4) { P.rect(2, yy, 12, 1, r[0]); P.rect(2, yy + 1, 12, 1, r[2]) }
  P.noise(2, 2, 12, 12, [r[3], r[0]], 0.08)
  P.rect(0, 0, 16, 1, 'rgba(0,0,0,.18)'); P.rect(0, 15, 16, 1, 'rgba(255,255,255,.08)')
  soilCache.set(k, c)
  return c
}
// 矿洞里的石头（大小三档）
export function mineRock(kind, seed) {
  const c = canvas(18, 16), x = c.getContext('2d'), P = painter(x, 300 + seed)
  const ramp = kind === 2 ? ['#2b2440', '#4a3a6e', '#6b55a0', '#9a84d6'] : kind === 1 ? ['#3a2e22', '#5e4a35', '#7d6448', '#a68a64'] : [C.r0, C.r1, C.r2, C.r3]
  P.ellipse(9, 13, 8, 2, 'rgba(0,0,0,.4)')
  P.ellipse(9, 9, 8, 6, ramp[0]); P.ellipse(9, 8, 7, 5, ramp[1]); P.ellipse(8, 7, 5, 3, ramp[2]); P.px(6, 5, ramp[3]); P.px(7, 5, ramp[3])
  if (kind > 0) for (let i = 0; i < 4; i++) P.px(4 + Math.floor(P.R() * 10), 6 + Math.floor(P.R() * 5), kind === 2 ? '#e0c8ff' : C.gold)
  return c
}
export function bakeCave(W, H, seed) {
  const c = canvas(W * TILE, H * TILE), x = c.getContext('2d'), P = painter(x, seed)
  P.rect(0, 0, W * TILE, H * TILE, '#2a2433')
  P.noise(0, 0, W * TILE, H * TILE, ['#231e2b', '#332c3e', '#3a3346'], 0.12)
  for (let i = 0; i < 40; i++) P.disc(Math.floor(P.R() * W * TILE), Math.floor(P.R() * H * TILE), 1 + Math.floor(P.R() * 2), '#3f384c')
  // 顶部岩壁
  P.rect(0, 0, W * TILE, 30, '#17131d'); for (let k = 0; k < W * TILE; k += 6) P.rect(k, 26 + Math.floor(P.R() * 6), 6, 8, '#211b29')
  for (let k = 0; k < W * TILE; k += 9) { P.rect(k, 30 + Math.floor(P.R() * 4), 3, 2, '#4a425a') }
  // 两侧
  P.rect(0, 0, 10, H * TILE, '#17131d'); P.rect(W * TILE - 10, 0, 10, H * TILE, '#17131d')
  // 墙上的水晶簇、地上的蘑菇和碎石、木支架
  const crystal = (x0, y0, c1, c2) => { for (let k = 0; k < 3; k++) { const hgt = 4 + Math.floor(P.R() * 6), xx = x0 + k * 3; P.rect(xx, y0 - hgt, 2, hgt, c1); P.px(xx, y0 - hgt, '#fff'); P.rect(xx + 1, y0 - hgt + 1, 1, hgt - 1, c2) } }
  for (let i = 0; i < 6; i++) crystal(16 + Math.floor(P.R() * (W * TILE - 40)), 30 + Math.floor(P.R() * 6), ['#b48cff', '#7fd8ff', '#ff8fb1'][i % 3], ['#6c47b5', '#2c78b8', '#b5263c'][i % 3])
  for (let i = 0; i < 7; i++) { const mx = 14 + Math.floor(P.R() * (W * TILE - 28)), my = 50 + Math.floor(P.R() * (H * TILE - 60)); P.rect(mx + 1, my + 2, 1, 2, '#e8dcc8'); P.rect(mx, my, 3, 2, i % 2 ? '#ff7a8a' : '#7cf0c8'); P.px(mx + 1, my, '#fff') }
  for (let i = 0; i < 26; i++) { const px = 12 + Math.floor(P.R() * (W * TILE - 24)), py = 44 + Math.floor(P.R() * (H * TILE - 50)); P.rect(px, py, 2, 1, '#4a425a'); P.px(px, py - 1, '#5a5268') }
  for (const bx of [40, W * TILE - 44]) { P.rect(bx, 30, 3, H * TILE - 30, '#3b2a1e'); P.rect(bx + 1, 30, 1, H * TILE - 30, '#5a3f2a') }
  P.rect(40, 30, W * TILE - 81, 3, '#3b2a1e'); P.rect(40, 31, W * TILE - 81, 1, '#5a3f2a')
  return c
}
