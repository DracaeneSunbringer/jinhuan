// 肥鱼庄园 · 全站悬浮小窗：任何页面右下角一个小按钮，点开才加载庄园代码、请求一次接口。
// 快捷操作：一键全收、看谁来偷了、找能偷的人家；完整玩法点「打开庄园」。不轮询。
const KEY = 'manorMiniHidden'
let btn = null, panel = null, navigateFn = null
const hidden = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } }
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const go = (path) => { close(); if (navigateFn) navigateFn(path); else location.href = path }

export function mountManorMini({ navigate } = {}) {
  navigateFn = navigate
  if (btn || hidden()) return
  const css = document.createElement('style')
  css.textContent = `.mnm-btn{position:fixed;right:18px;bottom:96px;z-index:900;width:46px;height:46px;border:0;border-radius:50%;background:radial-gradient(circle at 35% 30%,#bff0a8,#4fae5c 60%,#2f8f4e);box-shadow:0 4px 14px rgba(30,70,20,.3);cursor:pointer;display:grid;place-items:center;font-size:22px;line-height:1;transition:transform .15s}
.mnm-btn:hover{transform:scale(1.08)}.mnm-btn[data-n]:after{content:attr(data-n);position:absolute;top:-3px;right:-3px;min-width:17px;height:17px;padding:0 4px;border-radius:9px;background:#d4493b;color:#fff;font:700 11px/17px system-ui}
@media (max-width:760px){.mnm-btn{right:12px;bottom:calc(76px + env(safe-area-inset-bottom));width:42px;height:42px;font-size:20px}}
.mnm{position:fixed;right:18px;bottom:150px;z-index:901;width:min(330px,calc(100vw - 24px));max-height:min(520px,calc(100vh - 180px));overflow:auto;border:1px solid var(--line,#ddd);border-radius:18px;background:var(--surface,#fff);color:var(--text,#222);box-shadow:0 12px 40px rgba(0,0,0,.2);font:14px/1.5 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;animation:mnm-in .16s}
@media (max-width:760px){.mnm{right:12px;bottom:calc(126px + env(safe-area-inset-bottom))}}
@keyframes mnm-in{from{opacity:0;transform:translateY(8px)}}
.mnm header{display:flex;align-items:center;gap:8px;padding:10px 12px 6px}.mnm header b{flex:1;font-size:15px}.mnm header small{color:var(--text-2,#777);font-weight:500}
.mnm .x{width:26px;height:26px;border:0;border-radius:50%;background:var(--surface-2,#f2f2f2);color:inherit;cursor:pointer}
.mnm .sec{padding:6px 12px}.mnm .chips{display:flex;flex-wrap:wrap;gap:6px}.mnm .chip{padding:2px 9px;border-radius:10px;background:var(--surface-2,#f2f2f2);font-size:12.5px}
.mnm .chip.hot{background:#ffe7c2;color:#8a5200}
.mnm .big{width:100%;margin-top:8px;padding:9px;border:0;border-radius:12px;background:linear-gradient(#f2bd3a,#dd9b19);color:#4a3105;font:inherit;font-weight:800;cursor:pointer}.mnm .big:disabled{opacity:.45;cursor:default}
.mnm .msg{min-height:18px;margin:6px 0 0;color:var(--text-2,#666);font-size:12.5px}
.mnm h4{margin:8px 0 4px;font-size:12.5px;color:var(--text-2,#777)}
.mnm .ln{display:flex;align-items:center;gap:8px;padding:5px 0;border-top:1px solid var(--line,#eee);font-size:13px}.mnm .ln span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mnm .ln.new span{font-weight:700}
.mnm .ln button,.mnm .lnk{border:0;border-radius:10px;padding:3px 9px;background:var(--surface-2,#f2f2f2);color:inherit;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}
.mnm footer{display:flex;justify-content:space-between;align-items:center;padding:8px 12px 12px}.mnm footer .open{border:0;border-radius:12px;padding:7px 14px;background:#2f8f4e;color:#fff;font:inherit;font-weight:700;cursor:pointer}
.mnm footer .hide{border:0;background:none;color:var(--text-2,#888);font-size:12px;cursor:pointer;text-decoration:underline}`
  document.head.append(css)
  btn = document.createElement('button'); btn.type = 'button'; btn.className = 'mnm-btn'; btn.title = '肥鱼庄园'; btn.setAttribute('aria-label', '肥鱼庄园小窗'); btn.textContent = '🌱'
  btn.onclick = () => (panel ? close() : open())
  document.body.append(btn)
  const sync = () => { if (btn) btn.style.display = location.pathname.startsWith('/manor') ? 'none' : '' }
  sync(); window.addEventListener('popstate', sync); setInterval(sync, 1500)
}
export function setMiniHidden(on) {
  try { on ? localStorage.setItem(KEY, '1') : localStorage.removeItem(KEY) } catch {}
  if (on) { close(); btn?.remove(); btn = null } else mountManorMini({ navigate: navigateFn })
}
function close() { panel?.remove(); panel = null; document.removeEventListener('pointerdown', outside, true) }
function outside(e) { if (panel && !panel.contains(e.target) && e.target !== btn) close() }

async function open() {
  panel = document.createElement('section'); panel.className = 'mnm'; panel.setAttribute('role', 'dialog'); panel.innerHTML = '<header><b>🌱 肥鱼庄园</b><button type="button" class="x" aria-label="关闭">×</button></header><div class="sec">正在看看庄园…</div>'
  panel.querySelector('.x').onclick = close
  document.body.append(panel); setTimeout(() => document.addEventListener('pointerdown', outside, true), 0)
  let M
  try { M = await import('/manor-app.js') } catch { panel.querySelector('.sec').textContent = '庄园加载失败'; return }
  const draw = async () => {
    let j
    try { j = await M.manorApi('/api/manor') } catch (e) { if (panel) panel.querySelector('.sec').textContent = e.message; return }
    if (!panel) return
    const s = j.state, t = M.now(), c = M.chores(s, j.me, t), unseen = s.logs.filter((l) => l[0] > s.seen)
    const chips = [[`熟了 ${c.harvest.length} 块`, c.harvest.length], [`农活 ${c.fix.length} 件`, c.fix.length], [`动物 ${c.pens.length} 件`, c.pens.length], [`能量 ${c.ballG}g`, c.ballG], [`木材 ${c.wood.length} 棵`, c.wood.length], [`空地 ${c.empty} 块`, 0]]
    const verb = { steal: '偷走了', caught: '被看门狗逮住，赔了', water: '帮你浇水', bug: '帮你除虫', weed: '帮你除草', feed: '帮你喂食', clean: '帮你打扫', waterTree: '帮你浇树' }
    panel.innerHTML = `<header><b>🌱 ${esc(j.name)} 的庄园 <small>D币 ${Math.round(j.coins).toLocaleString('zh-CN')}</small></b><button type="button" class="x" aria-label="关闭">×</button></header>
      <div class="sec"><div class="chips">${chips.map(([text, n]) => `<span class="chip ${n ? 'hot' : ''}">${text}</span>`).join('')}</div>
      <button type="button" class="big" ${c.all.length ? '' : 'disabled'}>${c.all.length ? `一键全收 · ${c.all.length} 件` : '暂时没有要做的'}</button><p class="msg"></p></div>
      <div class="sec"><h4>${unseen.length ? `新动态 ${unseen.length} 条` : '最近动态'}</h4>${s.logs.slice(0, 4).map((l) => `<div class="ln ${l[0] > s.seen ? 'new' : ''}"><span>${esc(l[2])} ${verb[l[3]] || l[3]} ${l[3] === 'steal' ? l[5] + (l[4] === 'energy' ? 'g 能量' : ' 个' + M.itemName(l[4])) : l[3] === 'caught' ? l[5] + ' D币' : ''}</span><button type="button" data-go="${l[1]}">${l[3] === 'steal' ? '报仇' : '回访'}</button></div>`).join('') || '<div class="ln"><span>还没人来过</span></div>'}</div>
      <div class="sec"><h4>谁家有东西可拿</h4><div class="nb"><button type="button" class="lnk find">找一找</button></div></div>
      <footer><button type="button" class="hide">隐藏这个按钮</button><button type="button" class="open">打开庄园</button></footer>`
    panel.querySelector('.x').onclick = close
    panel.querySelector('.open').onclick = () => go('/manor')
    panel.querySelector('.hide').onclick = () => { if (confirm('隐藏后可以在「肥鱼庄园」页面顶部重新打开。确定隐藏？')) setMiniHidden(true) }
    panel.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => go('/manor?tab=farm&visit=' + b.dataset.go))
    panel.querySelector('.find').onclick = async (e) => {
      const nb = panel.querySelector('.nb'); e.target.disabled = true
      try {
        const n = await M.manorApi('/api/manor/neighbors')
        const list = n.list.filter((x) => x.ripe || x.help).slice(0, 4)
        nb.innerHTML = list.map((x) => `<div class="ln"><span>${esc(x.name)} · ${x.ripe ? '有东西可拿' : '需要帮忙'}</span><button type="button" data-go="${x.id}">${x.ripe ? '去偷' : '去帮'}</button></div>`).join('') || '<div class="ln"><span>暂时都收拾得挺干净</span></div>'
        nb.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => go('/manor?tab=farm&visit=' + b.dataset.go))
      } catch (err) { nb.textContent = err.message }
    }
    const big = panel.querySelector('.big')
    big.onclick = async () => {
      big.disabled = true; big.textContent = '大肥鱼正在干活…'
      try {
        const r = await M.manorApi('/api/manor/act', { rev: j.rev, operation: crypto.randomUUID(), actions: c.all.slice(0, 30) })
        const got = {}; let earn = 0, done = 0
        for (const o of r.out || []) { if (!o.ok) continue; done++; for (const [id, n] of o.got || []) got[id] = (got[id] || 0) + n; earn += o.earn || 0 }
        await draw()
        const msg = panel?.querySelector('.msg'); if (msg) msg.textContent = done ? '搞定：' + (Object.entries(got).map(([id, n]) => `${M.itemName(id)} +${n}${id === 'energy' ? 'g' : ''}`).join('，') || `${done} 件农活`) + (earn ? `，D币 +${earn}` : '') : (r.error || '没做成，稍后再试')
      } catch (err) { big.textContent = err.message }
    }
  }
  await draw()
}
