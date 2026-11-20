import { validateSiteUpdates } from './validate-updates.mjs'

const sources = [
  'https://raw.githubusercontent.com/kourou25/jinhuan/main/contributions/site-updates.json',
  'https://api.github.com/repos/kourou25/jinhuan/contents/contributions/site-updates.json?ref=main',
]

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

export async function readSiteUpdates() {
  const failures = []
  for (const source of sources) {
    try {
      const data = await fetchUpdates(source)
      return Response.json(data, { headers: { 'cache-control': 'public, max-age=60', 'x-content-type-options': 'nosniff' } })
    } catch (error) {
      failures.push(error.message)
    }
  }
  console.warn('community_updates_unavailable', failures.join(' / '))
  return Response.json({ error: '社区更新暂时不可用' }, { status: 503, headers: { 'cache-control': 'no-store' } })
}
