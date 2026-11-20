import { validateSiteUpdates } from './validate-updates.mjs'

const source = 'https://raw.githubusercontent.com/kourou25/jinhuan/main/contributions/site-updates.json'
export async function readSiteUpdates() {
  try {
    const response = await fetch(source, {
      redirect: 'error', signal: AbortSignal.timeout(4000),
      cf: { cacheEverything: true, cacheTtlByStatus: { '200': 60, '400-599': 0 } },
    })
    if (!response.ok) throw Error('源文件暂不可用')
    const stream = response.body?.getReader()
    if (!stream) throw Error('缺少发布内容')
    let bytes = 0
    const decoder = new TextDecoder('utf-8', { fatal: true })
    let text = ''
    for (;;) {
      const { done, value } = await stream.read()
      if (done) break
      bytes += value.length
      if (bytes > 48000) {
        await stream.cancel()
        throw Error('发布内容过大')
      }
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
    const data = validateSiteUpdates(JSON.parse(text))
    return Response.json(data, { headers: { 'cache-control': 'public, max-age=60', 'x-content-type-options': 'nosniff' } })
  } catch {
    return Response.json({ error: '社区更新暂时不可用' }, { status: 503, headers: { 'cache-control': 'no-store' } })
  }
}
