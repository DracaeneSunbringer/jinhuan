// 2026-11-07 b7：52弟 的玩具摊（剪刀石头布 / 抽牌比大小 / 五子棋 / 盲盒夺宝）+ 鱼彩（刮刮乐 / 谷内大乐透）。网站和小程序共用。
// 结果全部由服务端判定（isle.actNow 发出动作并等服务端结果），前端只负责演出。
import * as R from '/pet-world-rules.js?v=472f7fbf'
import {mountScratch} from '/pet-isle-scratch.js?v=472f7fbf'
import * as A from '/pet-isle-art.js?v=472f7fbf'
import { sheet } from '/pet-isle-ui.js?v=472f7fbf'

const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k === 'style') n.style.cssText = v
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v)
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) n.append(c instanceof Node ? c : document.createTextNode(String(c)))
  return n
}
const put = (n, ...k) => n.replaceChildren(...k.flat(Infinity).filter((x) => x != null && x !== false))
const fmt = (n) => Math.round(n).toLocaleString('zh-CN')
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms))
const btn = (label, onclick, cls = '') => el('button', { class: 'isle-btn ' + cls, type: 'button', onclick }, label)
const RPS = ['✊', '✌️', '🖐'], RPS_N = ['石头', '剪刀', '布']
const CARD = (v) => ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'][v], SUIT = ['♠', '♥', '♣', '♦']
// 52弟 头像：有素材用素材，没有就用表情
const npcFace = (mood = 'wave') => el('img', { class: 'fun-npc', src: A.itemIcon('npc:' + mood), alt: '52弟' })

function prizeView(o) {
  if (!o) return null
  if (o.res === 'lose') return el('div', { class: 'fun-prize lose' }, el('b', { text: '52弟 赢了这一局' }), el('small', { text: '没关系，明天的次数还多着呢' }))
  if (o.res === 'draw') return el('div', { class: 'fun-prize' }, el('b', { text: '平局，不算次数，再来！' }))
  const parts = []
  if (o.jackpot) parts.push(el('div', { class: 'fun-jackpot', text: '🎉 千分之一大奖！+' + fmt(o.earn) + ' D币' }))
  else if (o.earn) parts.push(el('span', {}, el('img', { src: A.itemIcon('coin', 2), alt: '' }), '+' + fmt(o.earn) + ' D币'))
  for (const g of o.got || []) parts.push(el('span', {}, el('img', { src: A.itemIcon(g.id, 2), alt: '' }), '+' + g.n + ' ' + (R.ITEM_NAME[g.id] || g.id)))
  return el('div', { class: 'fun-prize win' + (o.jackpot ? ' big' : '') }, el('b', { text: '你赢了！' }), el('div', { class: 'fun-got' }, parts))
}
function confetti(host, big) {
  if(document.documentElement.dataset.reducedMotion==='true'||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;host.querySelectorAll('.fun-confetti').forEach(n=>n.remove());
  const c = el('div', { class: 'fun-confetti' }); host.append(c)
  for (let i = 0; i < (big ? 90 : 36); i++) { const p = el('i'); p.style.left = Math.random() * 100 + '%'; p.style.background = ['#ffd75e', '#ff7a7a', '#7ad3ff', '#9be27a', '#d6a6ff'][i % 5]; p.style.animationDelay = Math.random() * 0.4 + 's'; p.style.animationDuration = 1.2 + Math.random() * 1.2 + 's'; c.append(p) }
  setTimeout(() => c.remove(), 2800)
}

export function openFun(host, isle, { toast } = {}) {
  const body = el('div', { class: 'fun' })
  const sh = sheet(host, '🎲 52弟 的玩具摊', body, { wide: true, onClose: () => isle?.refresh?.() })
  const left = () => Math.max(0, R.NPC.daily - (isle.state.cnt.npc || 0))
  const send = async (action) => { try { return await isle.actNow(action) } catch (e) { toast?.(e.message || '网络不稳，再试一次', 'err'); return null } }
  const head = (sub, mood) => el('div', { class: 'fun-head' }, npcFace(mood), el('div', {}, el('b', { text: '52弟：' + sub }), el('small', { text: '今天还能玩 ' + left() + ' 局 · 赢了随机给 D币或道具，千分之一概率 100 万 D币' })))
  const home = () => {
    put(body, head('来玩一局，公平比试！'),
      el('div', { class: 'fun-games' }, Object.entries({ rps: ['✊✌️🖐', '出一拳定胜负'], card: ['🂡', '各抽一张，比大小'], gomoku: ['⚫⚪', '15 路棋盘，简单/普通/困难三档'], box: ['🎁', '9 个盲盒里有奖有罚，各开 3 个比总分'] }).map(([g, [ic, d]]) =>
        el('button', { class: 'fun-game', type: 'button', disabled: !left() && g !== 'gomoku', onclick: () => GAMES[g]() }, el('span', { class: 'ic', text: ic }), el('b', { text: R.NPC_GAMES[g] }), el('small', { text: d })))),
      el('p', { class: 'isle-note', text: '每天 ' + R.NPC.daily + ' 局（平局不算），0 点刷新。猜拳、抽牌和盲盒公平随机；五子棋分三档难度认真对弈，每天前 ' + R.GOMOKU_PAID + ' 局计奖励，之后可以下练习局。' }))
  }
  const back = () => btn('← 换个游戏', home, 'ghost')
  const GAMES = {
    async rps() {
      const stage = el('div', { class: 'fun-rps' }, el('div', { class: 'hand me', text: '✊' }), el('b', { text: 'VS' }), el('div', { class: 'hand npc', text: '✊' }))
      const res = el('div', { class: 'fun-res' })
      let head0 = head('石头剪刀布！')
      const pick = el('div', { class: 'fun-pick' }, RPS.map((h, m) => el('button', { class: 'fun-big', type: 'button', onclick: async () => {
        pick.querySelectorAll('button').forEach((b) => (b.disabled = true)); put(res, )
        stage.querySelector('.me').textContent = '✊'; stage.querySelector('.npc').textContent = '✊'
        stage.classList.add('shake'); const o = await send({ a: 'npc', g: 'rps', m }); await sleep(900); stage.classList.remove('shake')
        if (o) { stage.querySelector('.me').textContent = RPS[m]; stage.querySelector('.npc').textContent = RPS[o.npc]; put(res, el('small', { text: '你出' + RPS_N[m] + '，52弟 出' + RPS_N[o.npc] }), prizeView(o)); if (o.res === 'win') confetti(body, o.jackpot) }
        pick.querySelectorAll('button').forEach((b) => (b.disabled = !left()))
        const h2 = head(o?.res === 'win' ? '哎呀又输了！' : o?.res === 'lose' ? '嘿嘿这把我赢！' : '再来再来', o?.res === 'lose' ? 'cheer' : o?.res === 'win' ? 'think' : 'idle'); head0.replaceWith(h2); head0 = h2
      } }, el('span', { text: h }), el('small', { text: RPS_N[m] }))))
      put(body, head0, stage, pick, res, back())
    },
    async card() {
      const cardEl = (who) => el('div', { class: 'fun-card back ' + who }, el('i', { text: '?' }))
      const me = cardEl('me'), np = cardEl('npc'), res = el('div', { class: 'fun-res' })
      const go = btn('抽牌！', async () => {
        go.disabled = true; put(res, )
        for (const c of [me, np]) { c.classList.remove('flip', 'red', 'blk'); c.classList.add('back'); c.firstChild.textContent = '?' }
        const o = await send({ a: 'npc', g: 'card' }); if (!o) { go.disabled = false; return }
        const show = (c, v, s) => { c.classList.remove('back'); c.classList.add('flip', s % 2 ? 'red' : 'blk'); c.firstChild.textContent = SUIT[s] + CARD(v) }
        await sleep(300); show(me, o.me, o.suit[0]); await sleep(650); show(np, o.np, o.suit[1]); await sleep(300)
        put(res, prizeView(o)); if (o.res === 'win') confetti(body, o.jackpot)
        go.disabled = !left(); go.textContent = o.res === 'draw' ? '平局，再抽！' : '再来一局'
      })
      put(body, head('A 最小，K 最大'), el('div', { class: 'fun-cards' }, el('div', {}, me, el('small', { text: '你' })), el('b', { text: 'VS' }), el('div', {}, np, el('small', { text: '52弟' }))), el('div', { class: 'fun-pick' }, go), res, back())
    },
    async gomoku() {
      const N = R.GOMOKU_N, LV = R.GOMOKU_LEVELS, paidLeft = () => Math.max(0, R.GOMOKU_PAID - (isle.state.cnt.gomokuPaid || 0))
      const coarse = window.matchMedia?.('(pointer: coarse)').matches
      // 先选难度：显示奖励倍率与今日剩余计奖局数；用完后仍可下练习局（不计次数、不发奖励）。
      const choose = () => {
        const practice = !left() || !paidLeft()
        put(body, head(practice ? '今天的计奖局下完啦，来几盘练习局？' : '挑个难度，我陪你下！', 'think'),
          el('div', { class: 'fun-games gomoku-levels' }, [1, 2, 3].map((d) => el('button', { class: 'fun-game', type: 'button', onclick: () => start(d) },
            el('span', { class: 'ic', text: ['', '🐣', '🐟', '🐋'][d] }), el('b', { text: LV[d].name }),
            el('small', { text: practice ? '练习局 · 不计奖励' : '赢了奖励 ×' + LV[d].mult })))),
          el('p', { class: 'isle-note', text: '15×15 棋盘，你执黑先手，先连成五子获胜，棋盘下满算和棋（不计次数）。每天前 ' + R.GOMOKU_PAID + ' 局五子棋计奖励，今天还剩 ' + paidLeft() + ' 局；之后可以继续下练习局。' + (coarse ? ' 手机上点一下预览落点，再点同一格确认。' : '') }),
          back())
      }
      const start = async (d) => {
        const st = await send({ a: 'npc', g: 'gomoku', k: 'start', d }); if (!st) return choose()
        const seed = st.seed, practice = !!st.practice, b = new Array(N * N).fill(0), mv = []
        const size = Math.min(520, Math.max(300, Math.floor(body.clientWidth || 440))), dpr = Math.min(2, window.devicePixelRatio || 1)
        const cv = el('canvas', { class: 'fun-board gomoku15', width: Math.round(size * dpr), height: Math.round(size * dpr), tabindex: 0, role: 'application', 'aria-label': '五子棋 15 路，方向键选择位置，回车落子' }), g = cv.getContext('2d')
        const info = el('div', { class: 'fun-res' }, el('small', { text: (practice ? '练习局 · ' : '') + LV[d].name + ' · 你执黑先下' }))
        let busy = false, over = false, last = -1, ghost = -1, line = null, kx = N >> 1, ky = N >> 1, keyOn = false
        const draw = () => {
          const W = size * dpr, C = W / N; g.setTransform(1, 0, 0, 1, 0, 0)
          g.fillStyle = '#e8c27a'; g.fillRect(0, 0, W, W); g.strokeStyle = '#8a5a22'; g.lineWidth = Math.max(1, dpr)
          for (let i = 0; i < N; i++) { g.beginPath(); g.moveTo(C / 2, C / 2 + i * C); g.lineTo(W - C / 2, C / 2 + i * C); g.stroke(); g.beginPath(); g.moveTo(C / 2 + i * C, C / 2); g.lineTo(C / 2 + i * C, W - C / 2); g.stroke() }
          g.fillStyle = '#8a5a22'; for (const [x, y] of [[3, 3], [11, 3], [7, 7], [3, 11], [11, 11]]) { g.beginPath(); g.arc(C / 2 + x * C, C / 2 + y * C, C * 0.1, 0, 7); g.fill() }
          const stone = (i, v, alpha = 1) => { const x = (i % N) * C + C / 2, y = Math.floor(i / N) * C + C / 2; g.globalAlpha = alpha; g.beginPath(); g.arc(x, y, C * 0.43, 0, 7); g.fillStyle = v === 1 ? '#222' : '#fafafa'; g.fill(); g.strokeStyle = '#0006'; g.stroke(); g.globalAlpha = 1 }
          b.forEach((v, i) => { if (v) stone(i, v) })
          if (ghost >= 0 && !b[ghost] && !over) stone(ghost, 1, 0.45)
          if (last >= 0) { g.fillStyle = '#e74c3c'; g.beginPath(); g.arc((last % N) * C + C / 2, Math.floor(last / N) * C + C / 2, C * 0.13, 0, 7); g.fill() }
          if (line) { g.strokeStyle = '#e74c3c'; g.lineWidth = C * 0.14; g.lineCap = 'round'; g.beginPath(); g.moveTo(line[0] % N * C + C / 2, Math.floor(line[0] / N) * C + C / 2); g.lineTo(line[1] % N * C + C / 2, Math.floor(line[1] / N) * C + C / 2); g.stroke() }
          if (keyOn) { g.strokeStyle = '#155ca8'; g.lineWidth = 3 * dpr; g.strokeRect(kx * C + 2 * dpr, ky * C + 2 * dpr, C - 4 * dpr, C - 4 * dpr) }
        }
        // 找出经过 (x,y) 的五连两端，用于终局画线。
        const fiveAt = (x, y, who) => { for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) { let a = 0, c = 0; while (true) { const X = x - dx * (a + 1), Y = y - dy * (a + 1); if (X < 0 || Y < 0 || X >= N || Y >= N || b[Y * N + X] !== who) break; a++ } while (true) { const X = x + dx * (c + 1), Y = y + dy * (c + 1); if (X < 0 || Y < 0 || X >= N || Y >= N || b[Y * N + X] !== who) break; c++ } if (a + c + 1 >= 5) return [(y - dy * a) * N + x - dx * a, (y + dy * c) * N + x + dx * c] } return null }
        const finish = async () => {
          over = true; ghost = -1; draw(); put(info, el('small', { text: '结算中…' }))
          const o = await send({ a: 'npc', g: 'gomoku', k: 'end', mv })
          const view = o?.practice ? el('div', { class: 'fun-prize' + (o.res === 'win' ? ' win' : '') }, el('b', { text: o.res === 'win' ? '你赢了！（练习局）' : o.res === 'draw' ? '和棋（练习局）' : '52弟 赢了（练习局）' })) : prizeView(o)
          put(info, view || el('small', { text: '这局没算上' }), el('div', { class: 'fun-pick' }, btn('再下一局', () => start(d)), btn('换难度', choose, 'ghost')))
          if (o?.res === 'win' && !o.practice) confetti(body, o.jackpot)
        }
        const place = async (x, y) => {
          if (busy || over || x < 0 || y < 0 || x >= N || y >= N || b[y * N + x]) return
          const i = y * N + x
          if (coarse && ghost !== i) { ghost = i; draw(); return } // 触屏：先预览，再点同一格确认
          busy = true; ghost = -1; b[i] = 1; last = i; mv.push([x, y]); draw()
          if (R.gomokuLine(b, x, y, 1, N) >= 5) { line = fiveAt(x, y, 1); busy = false; return finish() }
          if (b.every(Boolean)) { busy = false; return finish() }
          put(info, el('small', { class: 'gomoku-think', text: '52弟 思考中…' }))
          await sleep(d === 3 ? 200 : 350)
          const [ax, ay] = R.gomokuAI(b, seed, mv.length - 1, d, N); b[ay * N + ax] = 2; last = ay * N + ax
          if (R.gomokuLine(b, ax, ay, 2, N) >= 5) { line = fiveAt(ax, ay, 2); draw(); busy = false; return finish() }
          draw(); put(info, el('small', { text: (practice ? '练习局 · ' : '') + LV[d].name + ' · 第 ' + (mv.length + 1) + ' 手' }))
          busy = false
          if (b.every(Boolean)) return finish()
        }
        const cell = (e) => { const r = cv.getBoundingClientRect(), C = r.width / N; return [Math.floor((e.clientX - r.left) / C), Math.floor((e.clientY - r.top) / C)] }
        cv.addEventListener('click', (e) => { keyOn = false; const [x, y] = cell(e); place(x, y) })
        if (!coarse) { cv.addEventListener('mousemove', (e) => { if (busy || over) return; const [x, y] = cell(e), i = y * N + x; if (i !== ghost) { ghost = x >= 0 && y >= 0 && x < N && y < N ? i : -1; draw() } }); cv.addEventListener('mouseleave', () => { ghost = -1; draw() }) }
        cv.addEventListener('keydown', (e) => { if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' '].includes(e.key)) return; e.preventDefault(); keyOn = true; if (e.key === 'Enter' || e.key === ' ') { ghost = ky * N + kx; place(kx, ky); return } kx = Math.max(0, Math.min(N - 1, kx + (e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0))); ky = Math.max(0, Math.min(N - 1, ky + (e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0))); draw(); cv.setAttribute('aria-label', '五子棋，第' + (ky + 1) + '行第' + (kx + 1) + '列，回车落子') })
        put(body, head(practice ? '练习局，随便下！' : '认真下棋，看谁先连成五子！'), cv, info, el('div', { class: 'fun-pick' }, btn('← 换难度', choose, 'ghost'))); draw()
      }
      choose()
    },
    async box() {
      const st = await send({ a: 'npc', g: 'box', k: 'start' }); if (!st) return home()
      const opened = new Map(), score = el('div', { class: 'fun-score' }), res = el('div', { class: 'fun-res' }), grid = el('div', { class: 'fun-boxes' })
      let me = 0, np = 0, busy = false, done = false
      const sc = () => put(score, el('span', { text: '你 ' + me }), el('small', { text: '盒子里：' + R.BOX_SET.map((v) => (v > 0 ? '+' : '') + v).join(' ') }), el('span', { text: '52弟 ' + np }))
      const paint = () => put(grid, ...Array.from({ length: 9 }, (_, i) => { const o = opened.get(i); return el('button', { class: 'fun-box' + (o ? ' open ' + o.who + (o.v < 0 ? ' neg' : '') : ''), type: 'button', disabled: !!o || busy || done, onclick: () => pick(i) }, o ? el('span', {}, el('img', { class: 'fun-boxo', src: A.itemIcon('box:1'), alt: '' }), el('b', { text: (o.v > 0 ? '+' : '') + o.v }), el('small', { text: o.who === 'me' ? '你' : '52弟' })) : el('img', { class: 'fun-boxi', src: A.itemIcon('box:0'), alt: '盲盒' })) }))
      const pick = async (i) => {
        if (busy || done) return; busy = true; paint()
        const o = await send({ a: 'npc', g: 'box', k: 'pick', i }); if (!o) { busy = false; return paint() }
        opened.set(i, { v: o.mine, who: 'me' }); me += o.mine; sc(); paint(); await sleep(650)
        const free = Array.from({ length: 9 }, (_, k) => k).filter((k) => !opened.has(k)), j = Number.isInteger(o.j) ? o.j : free[Math.floor(Math.random() * free.length)]
        opened.set(j, { v: o.theirs, who: 'npc' }); np += o.theirs; sc(); busy = false
        if (o.res) { done = true; put(res, el('small', { text: '总分 你 ' + o.sa + ' : ' + o.sb + ' 52弟（平分为平局）' }), prizeView(o), el('div', { class: 'fun-pick' }, btn('再开一局', () => GAMES.box()))); if (o.res === 'win') confetti(body, o.jackpot) }
        paint()
      }
      put(body, head('一人开一个，开三轮比总分！'), score, grid, res, back()); sc(); paint()
    },
  }
  home()
  return sh
}

// ---------- 鱼彩 ----------
const SYMS = ['🐟', '🐠', '🐡', '🦀', '🦐', '🐳', '🦑', '⭐']
export function openLotto(host, isle, { toast } = {}) {
  const body = el('div', { class: 'fun' })
  const sh = sheet(host, '🎟 鱼彩', body, { wide: true, onClose: () => isle?.refresh?.() })
  const send = async (action) => { try { return await isle.actNow(action) } catch (e) { toast?.(e.message || '网络不稳，再试一次', 'err'); return null } }
  let tab = 'scratch', scratchEpoch = 0
  const tabs = () => el('div', { class: 'isle-tabs' }, [['scratch', '刮刮乐'], ['lotto', '谷内大乐透']].map(([k, t]) => el('button', { class: 'isle-tab' + (k === tab ? ' on' : ''), type: 'button', onclick: () => { tab = k; draw() } }, t)))
  const draw = () => (tab === 'scratch' ? scratchView() : lottoView())
  function scratchView(){const version=++scratchEpoch;return mountScratch({body,tabs,R,el,put,btn,fmt,send,confetti,last:isle.state.scratchLast,active:()=>tab==='scratch'&&version===scratchEpoch&&body.isConnected})}
  async function lottoView() {
    const box = el('div', {}, el('p', { class: 'isle-note', text: '加载开奖记录…' }))
    put(body, tabs(), box)
    let info = null; try { const r = await fetch('/api/pet/world/lotto'); if (r.ok) info = await r.json() } catch {}
    const red = new Set(), blue = { v: 0 }, cur = R.lottoDrawId(Math.floor(Date.now() / 1000))
    const ball = (n, on, cls, onclick) => el('button', { class: 'fun-ball ' + cls + (on ? ' on' : ''), type: 'button', onclick }, String(n).padStart(2, '0'))
    const chip = (n, cls) => el('i', { class: 'fun-ball ' + cls + ' on', text: String(n).padStart(2, '0') })
    const picker = el('div'), mine = el('div')
    const paint = () => {
      put(picker, el('small', { text: '红球选 5 个（已选 ' + red.size + '）' }), el('div', { class: 'fun-balls' }, Array.from({ length: R.LOTTO.nums }, (_, i) => ball(i + 1, red.has(i + 1), 'red', () => { red.has(i + 1) ? red.delete(i + 1) : red.size < 5 && red.add(i + 1); paint() }))),
        el('small', { text: '蓝球选 1 个' }), el('div', { class: 'fun-balls' }, Array.from({ length: R.LOTTO.balls }, (_, i) => ball(i + 1, blue.v === i + 1, 'blue', () => { blue.v = i + 1; paint() }))),
        el('div', { class: 'fun-pick' }, btn('🎲 机选', () => { red.clear(); while (red.size < 5) red.add(1 + Math.floor(Math.random() * R.LOTTO.nums)); blue.v = 1 + Math.floor(Math.random() * R.LOTTO.balls); paint() }, 'ghost'),
          el('button', { class: 'isle-btn', type: 'button', disabled: red.size !== 5 || !blue.v, onclick: async () => { const o = await send({ a: 'lotto', n: [...red], b: blue.v }); if (o) { toast?.('买好了，第 ' + o.d + ' 期', 'ok'); red.clear(); blue.v = 0; paint() } } }, '买一注 · ' + R.LOTTO.price + ' D币')))
      const s = isle.state, tks = s.lotto || [], due = tks.filter((x) => x.d < cur)
      put(mine, el('h3', { text: '我的彩票（' + tks.length + '/' + R.LOTTO.max + '）' }),
        due.length ? el('button', { class: 'isle-btn', type: 'button', onclick: async () => { const o = await send({ a: 'lottoClaim' }); if (!o) return; const won = (o.tickets || []).filter((x) => x.coins); toast?.(won.length ? '中了 ' + won.length + ' 注，共 ' + fmt(o.earn) + ' D币！' : '这次没中，下期再来', won.length ? 'ok' : 'warn'); if (won.length) confetti(body, o.earn >= 100000); paint() } }, '兑奖（' + due.length + ' 注已开奖）') : null,
        tks.length ? el('ul', { class: 'fun-tks' }, tks.map((x) => el('li', {}, el('small', { text: '第 ' + x.d + ' 期' + (x.d < cur ? ' · 已开奖' : ' · 等开奖') }), x.n.map((n) => chip(n, 'red')), chip(x.b, 'blue')))) : el('p', { class: 'isle-note', text: '还没买。' }),
        (s.lottoLog || []).length ? el('p', { class: 'isle-note', text: '最近中奖：' + s.lottoLog.map((x) => '第' + x.d + '期 ' + x.key + ' +' + fmt(x.coins)).join('；') }) : null)
    }
    const left = info ? Math.max(0, info.next - Date.now() / 1000) : 0
    put(box, 
      el('div', { class: 'fun-lotto-head' }, el('b', { text: '第 ' + cur + ' 期 · 每个岛日（现实 4 小时）开一次' }), el('small', { text: info ? '离开奖还有 ' + Math.floor(left / 3600) + ' 小时 ' + Math.floor((left % 3600) / 60) + ' 分' : '' })),
      el('div', { class: 'fun-prizes' }, R.LOTTO_PRIZE.map(([k, v]) => el('span', {}, el('b', { text: k.replace('+1', ' + 蓝') + ' 中' }), ' ' + fmt(v)))),
      info?.last?.length ? el('div', { class: 'fun-last' }, el('small', { text: '往期开奖' }), info.last.slice(0, 3).map((d) => el('div', {}, el('small', { text: '第 ' + d.d + ' 期 ' }), d.n.map((n) => chip(n, 'red')), chip(d.b, 'blue')))) : null,
      picker, mine)
    paint()
  }
  draw()
  return sh
}
