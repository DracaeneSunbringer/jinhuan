// @ts-nocheck
// 站内确认 / 输入 / 提示框，替代浏览器原生 confirm / prompt / alert（与主站 public/app.js 开头那段相同，来自线上 b1 补丁）。
;(() => {
if (window.siteConfirm) return
const css = '.site-ask{max-width:min(380px,calc(100vw - 32px));width:380px;border:1px solid var(--line,#d9dfd5);border-radius:16px;padding:20px 18px 16px;background:var(--surface,#fff);color:var(--text,#172d25);box-shadow:0 24px 64px rgba(0,0,0,.22);font:inherit;font-family:var(--font,system-ui,sans-serif)}'
  + '.site-ask::backdrop{background:rgba(10,20,16,.42)}.site-ask p{margin:0 0 14px;font-size:14px;line-height:1.65;white-space:pre-line;word-break:break-word}'
  + '.site-ask input{display:block;width:100%;box-sizing:border-box;margin:0 0 14px;padding:9px 11px;border:1px solid var(--line,#d9dfd5);border-radius:10px;background:var(--surface-2,#f3f4f0);color:inherit;font:inherit;font-size:14px}'
  + '.site-ask .site-ask-acts{display:flex;justify-content:flex-end;gap:8px}.site-ask button{min-width:72px;padding:8px 14px;border-radius:10px;border:1px solid var(--line,#d9dfd5);background:transparent;color:inherit;font:inherit;font-size:13px;font-weight:600;cursor:pointer}'
  + '.site-ask button.site-ask-ok{border-color:transparent;background:var(--primary,#1f6b4f);color:var(--primary-ink,#fff)}.site-ask button:focus-visible{outline:2px solid var(--primary,#1f6b4f);outline-offset:2px}'
let styled = false
function ask(text, mode, value) {
  return new Promise((resolve) => {
    if (!styled) { styled = true; const s = document.createElement('style'); s.textContent = css; document.head.append(s) }
    const d = document.createElement('dialog'); d.className = 'site-ask'; d.setAttribute('aria-label', '确认')
    const p = document.createElement('p'); p.textContent = String(text ?? '')
    const input = mode === 'prompt' ? Object.assign(document.createElement('input'), { type: 'text', value: value == null ? '' : String(value) }) : null
    const acts = document.createElement('div'); acts.className = 'site-ask-acts'
    const ok = Object.assign(document.createElement('button'), { type: 'button', className: 'site-ask-ok', textContent: mode === 'alert' ? '知道了' : '确定' })
    const no = mode === 'alert' ? null : Object.assign(document.createElement('button'), { type: 'button', textContent: '取消' })
    let done = false
    const prev = document.activeElement
    const end = (v) => { if (done) return; done = true; try { d.close() } catch {} d.remove(); try { prev && prev.focus && prev.focus() } catch {} resolve(v) }
    const cancel = () => end(mode === 'confirm' ? false : mode === 'prompt' ? null : undefined)
    ok.onclick = () => end(mode === 'confirm' ? true : mode === 'prompt' ? input.value : undefined)
    if (no) no.onclick = cancel
    d.addEventListener('cancel', (e) => { e.preventDefault(); cancel() })
    d.addEventListener('click', (e) => { if (e.target !== d) return; const r = d.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) cancel() })
    if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); ok.click() } })
    if (no) acts.append(no); acts.append(ok)
    d.append(p); if (input) d.append(input); d.append(acts)
    document.body.append(d)
    try { d.showModal() } catch { d.setAttribute('open', '') }
    ;(input || ok).focus(); if (input) input.select()
  })
}
window.siteConfirm = (text) => ask(text, 'confirm')
window.sitePrompt = (text, value) => ask(text, 'prompt', value)
window.siteAlert = (text) => { void ask(text, 'alert') }
})();
export {}
