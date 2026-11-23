import { validateSiteUpdates } from './validate-updates.mjs'
import bundled from './site-updates.json' with { type: 'json' }

// 读取顺序：内存缓存（5 分钟内直接返回）→ GitHub raw → GitHub API → 上次成功的结果 → 打包时的清单。
// 不依赖 Cloudflare 专有接口，迁到普通 Node 服务器也能直接用。
const sources = [
  'https://raw.githubusercontent.com/kourou25/jinhuan/main/contributions/site-updates.json',
  'https://api.github.com/repos/kourou25/jinhuan/contents/contributions/site-updates.json?ref=main',
]
const FRESH_MS = 5 * 60 * 1000
let cache = null // { data, at }
let inflight = null

async function fetchUpdates(source) {
  const response = await fetch(source, {
    headers: { accept: 'application/vnd.github.raw+json', 'user-agent': 'Jinhuan-Community-Updates' },
    redirect: 'follow',
    signal: AbortSignal.timeout(6500),
  })
  if (!response.ok) throw Error('HTTP ' + response.status)
  if (Number(response.headers.get('content-length')) > 48000) throw Error('清单过大')
  const raw = await response.text()
  if (raw.length > 48000) throw Error('清单过大')
  return validateSiteUpdates(JSON.parse(raw))
}

async function refresh() {
  const failures = []
  for (const source of sources) {
    try {
      cache = { data: await fetchUpdates(source), at: Date.now() }
      return cache
    } catch (error) {
      failures.push(error.message)
    }
  }
  console.warn('community_updates_unavailable', failures.join(' / '))
  return null
}

const reply = (data, extra) => Response.json({ ...data, ...extra }, {
  headers: { 'cache-control': 'public, max-age=60, stale-while-revalidate=600', 'x-content-type-options': 'nosniff' },
})

export async function readSiteUpdates() {
  if (cache && Date.now() - cache.at < FRESH_MS) return reply(cache.data, { fetchedAt: cache.at })
  inflight ||= refresh().finally(() => { inflight = null })
  const fresh = await inflight
  if (fresh) return reply(fresh.data, { fetchedAt: fresh.at })
  if (cache) return reply(cache.data, { fetchedAt: cache.at, stale: true })
  try {
    return reply(validateSiteUpdates(bundled), { stale: true })
  } catch {
    return Response.json({ error: '社区更新暂时不可用' }, { status: 503, headers: { 'cache-control': 'no-store' } })
  }
}
