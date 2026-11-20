// 登录后的一次性提示：还没设置「登录名 + 密码」的用户，弹一个小窗让他自己设置（以后可以不用 Linux.DO 登录）。
// 点「以后再说」3 天内不再弹；设置过就再也不弹。只在需要时请求一次 /api/me/login-password（读 1 行）。
export async function maybePromptLoginPassword() {
  try {
    if (localStorage.getItem('loginPasswordSet') === '1') return
    if (Number(localStorage.getItem('loginPasswordSnooze') || 0) > Date.now()) return
    if (!localStorage.getItem('guideDone')) return // 新用户先看完站内引导，下次再提示，避免两个弹窗叠在一起
  } catch { return }
  if (location.pathname.startsWith('/me/account') || location.pathname === '/login') return
  let me
  try { const r = await fetch('/api/me/login-password', { credentials: 'same-origin' }); if (!r.ok) return; me = await r.json() } catch { return }
  if (!me.available) return
  if (me.login) { try { localStorage.setItem('loginPasswordSet', '1') } catch {} return }
  if (document.querySelector('.alp-wrap, .guide-body, dialog[open]')) return
  const css = document.createElement('style')
  css.textContent = `.alp-wrap{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:rgba(15,18,25,.45);animation:alp-in .18s}
.alp{width:min(380px,calc(100% - 32px));padding:22px 20px 16px;border-radius:16px;background:var(--surface,#fff);color:var(--text,#1f2328);box-shadow:0 12px 40px rgba(0,0,0,.25);font:15px/1.6 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
.alp h2{margin:0 0 6px;font-size:18px}.alp p{margin:0 0 12px;color:var(--muted,#6b7280);font-size:14px}
.alp label{display:grid;gap:3px;margin:0 0 10px;font-weight:600;font-size:13px}.alp input{font:inherit;padding:9px 11px;border:1px solid var(--line,#d0d5dd);border-radius:10px;background:transparent;color:inherit}
.alp .row{display:flex;gap:8px;margin-top:6px}.alp button{flex:1;padding:10px;border:0;border-radius:10px;font:inherit;font-weight:700;cursor:pointer}
.alp .ok{background:#16a34a;color:#fff}.alp .later{background:transparent;color:var(--muted,#6b7280);border:1px solid var(--line,#d0d5dd)}
.alp .msg{min-height:20px;margin:8px 0 0;font-size:13px;color:#b42318}.alp .msg.good{color:#16a34a}
@keyframes alp-in{from{opacity:0}}`
  document.head.append(css)
  const wrap = document.createElement('div')
  wrap.className = 'alp-wrap'
  const suggested = /^[A-Za-z0-9_][A-Za-z0-9_.-]{1,22}[A-Za-z0-9_]$/.test(me.username || '') && !/^\d+$/.test(me.username) ? me.username : ''
  wrap.innerHTML = `<form class="alp" role="dialog" aria-modal="true" aria-label="设置账号密码">
  <h2>给你的账号设个登录密码</h2>
  <p>设好以后可以直接用「登录名 + 密码」登录这个账号，不用再靠 Linux.DO；也能在「账号安全」里关联 Google / GitHub。</p>
  <label>登录名（3～24 位字母、数字、下划线，只用来登录）<input name="login" autocomplete="username" required maxlength="24" autocapitalize="off" spellcheck="false"></label>
  <label class="cur" hidden>当前密码（你之前设过密码，先验证一下）<input name="current" type="password" autocomplete="current-password" maxlength="128"></label>
  <label>密码（8 位以上）<input name="password" type="password" autocomplete="new-password" required minlength="8" maxlength="128"></label>
  <label>再输一次<input name="confirm" type="password" autocomplete="new-password" required minlength="8" maxlength="128"></label>
  <div class="row"><button type="button" class="later">以后再说</button><button type="submit" class="ok">保存</button></div>
  <p class="msg" role="status" aria-live="polite"></p></form>`
  document.body.append(wrap)
  const f = wrap.querySelector('form'), m = wrap.querySelector('.msg')
  f.login.value = suggested
  if (me.has_password) { wrap.querySelector('.cur').hidden = false; f.current.required = true }
  const close = () => { wrap.remove(); css.remove() }
  wrap.querySelector('.later').onclick = () => { try { localStorage.setItem('loginPasswordSnooze', String(Date.now() + 3 * 86400000)) } catch {} close() }
  f.onsubmit = async (e) => {
    e.preventDefault(); m.textContent = ''; m.className = 'msg'
    if (f.password.value !== f.confirm.value) { m.textContent = '两次输入的密码不一样'; return }
    const ok = f.querySelector('.ok'); ok.disabled = true; ok.textContent = '正在保存…'
    try {
      const r = await fetch('/api/me/login-password', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: f.login.value, password: f.password.value, confirm: f.confirm.value, current: f.current.value || undefined }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || '保存失败，请稍后再试')
      try { localStorage.setItem('loginPasswordSet', '1') } catch {}
      m.className = 'msg good'; m.textContent = `已保存：以后可以用「${j.login}」+ 密码登录`
      setTimeout(close, 1600)
    } catch (err) { m.textContent = err.message; ok.disabled = false; ok.textContent = '保存' }
  }
  setTimeout(() => f.login.value ? f.password.focus() : f.login.focus(), 50)
}
