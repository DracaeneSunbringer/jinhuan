// 单个 Edge / 主页面串行运行；线上仅允许无登录公开页面验证。finally 清理自身进程/profile。
import { spawn, execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
const live = process.argv.includes('--public-live')
const base = live ? 'https://52dmeme.com' : 'http://127.0.0.1:8787'
const targetRoot = process.argv.find(x=>x.startsWith('--evidence-root='))?.slice('--evidence-root='.length)
const root = resolve(targetRoot || (live ? '.agents/tasks/road-feedback-2026-10-12/release-b1' : 'tests/evidence/road-feedback-batch1'))
if (!root.startsWith(resolve('.') + '\\')) throw new Error('证据目录必须在项目内')
mkdirSync(root, { recursive: true })
const profile = mkdtempSync(join(tmpdir(), 'rf-batch1-'))
const port = 9437
const sleep = ms => new Promise(r => setTimeout(r, ms))
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking', '--disable-extensions', '--disable-popup-blocking', '--remote-debugging-port=' + port, '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' })
let ws, seq = 0
const pending = new Map(), errors = [], apiNetwork = []
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = ++seq
  const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)) }, 45000)
  pending.set(id, m => { clearTimeout(timer); m.error ? reject(new Error(m.error.message)) : resolve(m.result) })
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
})
const evaluate = async expression => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
  return r.result?.value
}
const shot = async (name, sessionId) => { await sleep(400); const r = await send('Page.captureScreenshot', { format: 'png' }, sessionId); writeFileSync(join(root, name + '.png'), Buffer.from(r.data, 'base64')) }
try {
  let tab
  for (let i = 0; i < 60; i++) { try { tab = (await (await fetch('http://127.0.0.1:' + port + '/json')).json()).find(t => t.type === 'page'); if (tab) break } catch {} await sleep(200) }
  if (!tab) throw new Error('Edge 未启动')
  ws = new WebSocket(tab.webSocketDebuggerUrl)
  await new Promise(r => ws.addEventListener('open', r, { once: true }))
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); if(m.method==='Network.responseReceived' && m.params.response.url.includes('/api/'))apiNetwork.push({url:m.params.response.url,status:m.params.response.status}) })
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable')
  if (!live) {
  const key = readFileSync('.dev.vars', 'utf8').match(/^DEV_LOGIN_KEY\s*=\s*"?([^"\r\n]+)"?/m)[1]
  const login = await fetch('http://127.0.0.1:8787/auth/dev', { signal: AbortSignal.timeout(10000), method: 'POST', redirect: 'manual', body: new URLSearchParams({ key, username: '52D', tl: '3', admin: '1', next: '/' }) })
  const sid = login.headers.get('set-cookie')?.match(/sid=([^;]+)/)?.[1]
  if (!sid) throw new Error('本地登录失败 ' + login.status)
  await send('Network.setCookie', { name: 'sid', value: sid, url: 'http://127.0.0.1:8787' })
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: "localStorage.setItem('guideDone','1');localStorage.setItem('nsfwHint','1');localStorage.setItem('theme','light');localStorage.setItem('wallHz','1');localStorage.setItem('chatDock',JSON.stringify({on:true,open:false,split:false}));window.__rfWindows=[];const rfOpen=window.open;window.open=(...a)=>{const w=rfOpen(...a);if(w)window.__rfWindows.push(w);return w};" })
  await send('Page.navigate', { url: base + '/' })
  for (let i = 0; i < 120; i++) { if (await evaluate("!!document.querySelector('.wall .card')" + (live ? '' : " && !!document.querySelector('.cd-bubble')"))) break; await sleep(100) }
  if (!live) {
  const seed = JSON.parse(readFileSync(join(targetRoot ? 'tests/evidence/road-feedback-batch1' : root, 'seed.json'), 'utf8'))
  await evaluate('window.__rfSeed=' + JSON.stringify(seed))
  }
  const script = readFileSync(process.argv[2], 'utf8')
  // 验证脚本可以调用 evaluate/send/shot，始终复用当前实例。
  const run = new (Object.getPrototypeOf(async function () {}).constructor)('evaluate', 'send', 'shot', 'sleep', 'root', script)
  const result = await run(evaluate, send, shot, sleep, root)
  writeFileSync(join(root, (process.argv[3] || 'browser') + '.json'), JSON.stringify({ result, errors, apiNetwork }, null, 2))
  console.log(JSON.stringify({ result, errors }, null, 2))
} catch(e) {
  writeFileSync(join(root, (process.argv[3] || 'browser') + '-failure.json'), JSON.stringify({ error: e.message, cases: e.caseResults, errors, apiNetwork }, null, 2))
  throw e
} finally {
  try { await evaluate('window.__rfWindows?.forEach(w=>w.close())') } catch {}
  try { await send('Browser.close') } catch {}
  ws?.close()
  await sleep(500)
  try { execFileSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
  // profile 来自 mkdtempSync，确认其父目录为系统临时目录后删除。
  if (dirname(profile) === tmpdir()) { try { rmSync(profile, { recursive: true, force: true }) } catch {} }
}
