// 🌟🐟谷「一键回收」（2026-11-04 当天有效）：花掉的 D币 全退、赚到的 D币 全扣回，小岛重置成新号。
// 入口：顶栏 🔔 通知里一条「今日可一键回收」+ 🌟🐟谷页面顶部的横幅。每个会话最多查一次接口（10 分钟缓存），过了期限就不再请求。
export const REFUND_UNTIL = Date.parse('2026-11-05T00:00:00+08:00')
const CACHE = 'petRefundQuote', DISMISS = 'petRefundDismissed'
const fmt = (n) => Math.round(n).toLocaleString('zh-CN')
const live = () => Date.now() < REFUND_UNTIL
const store = { get(k, s = sessionStorage) { try { return JSON.parse(s.getItem(k) || 'null') } catch { return null } }, set(k, v, s = sessionStorage) { try { s.setItem(k, JSON.stringify(v)) } catch {} } }

export async function refundQuote(force) {
  if (!live()) return null
  const hit = store.get(CACHE)
  if (!force && hit && Date.now() - hit.t < 600000) return hit.q
  const r = await fetch('/api/pet/world/refund', { credentials: 'same-origin' })
  if (!r.ok) return null
  const q = await r.json(); store.set(CACHE, { t: Date.now(), q }); return q
}
// 给通知中心用：符合条件时返回一条本地通知
export async function refundNotifs() {
  const q = await refundQuote().catch(() => null)
  if (!q?.available) return []
  const dismissed = store.get(DISMISS, localStorage)
  return [{ kind: 'pet_refund', at: Math.floor(Date.now() / 1000), unread: !dismissed, val: describe(q) }]
}
const describe = (q) => q.net >= 0 ? `🌟🐟谷降价了：今天可以一键回收，退回你 ${fmt(q.net)} D币（小岛会重置）` : `🌟🐟谷降价了：今天可以一键回收（要扣回 ${fmt(-q.net)} D币，小岛会重置）`

export async function openRefund({ onDone } = {}) {
  try { localStorage.setItem(DISMISS, '1') } catch {}
  const wrap = document.createElement('div')
  wrap.className = 'prf-wrap'
  wrap.innerHTML = `<style>.prf-wrap{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:rgba(15,20,10,.45);font:14px/1.6 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
.prf{width:min(420px,calc(100% - 28px));max-height:calc(100vh - 40px);overflow:auto;padding:18px 18px 14px;border-radius:18px;background:var(--surface,#fff);color:var(--text,#222);box-shadow:0 16px 50px rgba(0,0,0,.3)}
.prf h2{margin:0 0 6px;font-size:18px}.prf p{margin:6px 0;color:var(--text-2,#555)}.prf table{width:100%;margin:10px 0;border-collapse:collapse}.prf td{padding:6px 4px;border-bottom:1px solid var(--line,#eee)}.prf td:last-child{text-align:right;font-variant-numeric:tabular-nums;font-weight:700}
.prf .tot td{border-bottom:0;font-size:16px}.prf .plus{color:#2f8f4e}.prf .minus{color:#d4493b}.prf .warn{padding:8px 10px;border-radius:10px;background:#fff3d6;color:#7a5200}
.prf label{display:flex;gap:8px;align-items:flex-start;margin:10px 0;color:var(--text,#222)}.prf .row{display:flex;gap:8px;margin-top:12px}.prf button{flex:1;padding:10px;border:0;border-radius:12px;font:inherit;font-weight:700;cursor:pointer}
.prf .ok{background:#d4493b;color:#fff}.prf .ok:disabled{opacity:.45;cursor:default}.prf .no{background:var(--surface-2,#f0f0f0);color:var(--text,#222)}.prf .msg{min-height:20px;margin:8px 0 0;font-size:13px}</style>
<section class="prf" role="dialog" aria-modal="true" aria-label="🌟🐟谷一键回收"><h2>🌟🐟谷 · 一键回收</h2><p>正在算账…</p></section>`
  document.body.append(wrap)
  const box = wrap.querySelector('.prf'), close = () => wrap.remove()
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close() })
  const q = await refundQuote(true).catch(() => null)
  if (!q) { box.innerHTML += '<p>暂时查不到，稍后再试。</p><div class="row"><button class="no">关闭</button></div>'; box.querySelector('.no').onclick = close; return }
  if (!q.available) {
    box.innerHTML = `<h2>🌟🐟谷 · 一键回收</h2><p>${q.done ? `你已经回收过了（${q.done.delta >= 0 ? '退回' : '扣回'} ${fmt(Math.abs(q.done.delta))} D币）。` : !live() || q.until * 1000 <= Date.now() ? '一键回收只在今天有效，已经过期了。' : '你还没在🌟🐟谷花过或赚过 D币，不需要回收。'}</p><div class="row"><button class="no">知道了</button></div>`
    box.querySelector('.no').onclick = close; return
  }
  const until = new Date(q.until * 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  box.innerHTML = `<h2>🌟🐟谷 · 一键回收</h2>
    <p>🌟🐟谷降价了。如果你觉得之前买贵了，今天可以把在🌟🐟谷的 D币 收支全部撤回，从头再玩。</p>
    <table><tr><td>在🌟🐟谷花掉的（买东西、扩建、工具、管家工钱…）</td><td class="plus">+${fmt(q.spent)}</td></tr><tr><td>在🌟🐟谷赚到的（卖货、每日目标…）</td><td class="minus">−${fmt(q.earned)}</td></tr>
    <tr class="tot"><td>回收后 D币 ${q.net >= 0 ? '退回' : '扣回'}</td><td class="${q.net >= 0 ? 'plus' : 'minus'}">${q.net >= 0 ? '+' : '−'}${fmt(Math.abs(q.net))}</td></tr></table>
    <p class="warn">回收后<b>小岛会重置成新号</b>：地、动物、工具、小屋、库存、管家全部清空。新人礼和降价补偿不动（新人礼也不能再领一次）。只能回收一次，${until} 前有效。</p>
    ${q.enough ? '' : `<p class="minus">你现在有 ${fmt(q.coins)} D币，不够扣回 ${fmt(-q.net)}，暂时不能回收。</p>`}
    <label><input type="checkbox" class="ck" ${q.enough ? '' : 'disabled'}> 我知道小岛会被清空，确定回收</label>
    <div class="row"><button class="no">先不了</button><button class="ok" disabled>一键回收</button></div><p class="msg" role="status"></p>`
  const ok = box.querySelector('.ok'), ck = box.querySelector('.ck'), msg = box.querySelector('.msg')
  ck.onchange = () => { ok.disabled = !ck.checked }
  box.querySelector('.no').onclick = close
  ok.onclick = async () => {
    ok.disabled = true; ok.textContent = '正在回收…'; msg.textContent = ''
    try {
      const r = await fetch('/api/pet/world/refund', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ operation: crypto.randomUUID() }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok && !j.already) throw new Error(j.error || '回收失败，请稍后再试')
      try { sessionStorage.removeItem(CACHE) } catch {}
      box.innerHTML = `<h2>回收完成</h2><p>${j.already ? '你已经回收过了。' : `D币 ${j.net >= 0 ? '退回' : '扣回'} ${fmt(Math.abs(j.net))}，现在余额 ${fmt(j.coins)}。小岛已经重置，可以按新价格从头玩了。`}</p><div class="row"><button class="no">好的</button></div>`
      box.querySelector('.no').onclick = () => { close(); onDone?.(j) }
    } catch (e) { msg.textContent = e.message; ok.disabled = false; ok.textContent = '一键回收' }
  }
}

// 🌟🐟谷页面顶部横幅
export async function refundBanner({ onLeave, onDone } = {}) {
  const q = await refundQuote().catch(() => null)
  if (!q?.available) return
  const bar = document.createElement('div')
  bar.style.cssText = 'position:fixed;left:50%;top:calc(64px + env(safe-area-inset-top));transform:translateX(-50%);z-index:60;display:flex;align-items:center;gap:8px;max-width:calc(100% - 24px);padding:6px 6px 6px 14px;border-radius:18px;background:#fff3c4;color:#6b4a07;box-shadow:0 4px 14px rgba(0,0,0,.15);font:600 13px/1.4 system-ui,-apple-system,"PingFang SC",sans-serif'
  bar.innerHTML = `<span>🌟🐟谷降价了，今天可以一键回收（${q.net >= 0 ? '退回 ' + fmt(q.net) : '扣回 ' + fmt(-q.net)} D币，小岛重置）</span><button type="button" style="border:0;border-radius:14px;padding:5px 12px;background:#d4493b;color:#fff;font:inherit;cursor:pointer;white-space:nowrap">看看</button><button type="button" aria-label="关闭" style="border:0;background:none;color:inherit;font-size:16px;cursor:pointer">×</button>`
  const [go, x] = bar.querySelectorAll('button')
  go.onclick = () => openRefund({ onDone: (j) => { bar.remove(); onDone?.(j) } })
  x.onclick = () => bar.remove()
  document.body.append(bar)
  onLeave?.(() => bar.remove())
}
