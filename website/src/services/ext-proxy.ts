// GET /ext?u=...：外链图片兜底代理（历史梗图的 linux.do 原图直连失败时用）。
// 2026-11-23 安全修复：此前只看 content-type 是否以 image/ 开头就原样透传，SVG 会在主站同源执行脚本；
// 且 fetch 自动跟随重定向，可借白名单域名上的跳转点取回任意外部内容并缓存 30 天。
// 现在：只放行文件头核对过的位图；手动逐跳校验重定向；响应一律 nosniff + 沙箱 CSP；换缓存键让旧缓存失效。
import type { Context } from 'hono'

const MAX_HOPS = 3
const MAX_BYTES = 10 * 1024 * 1024
const BITMAP = /^image\/(?:png|jpeg|gif|webp)(?:;|$)/i
// 缓存键换前缀：旧版以原图地址为键缓存的响应（可能含 SVG）不再命中
const CACHE_PREFIX = '/__ext_v2?u='

export function extHostAllowed(url: URL, hosts: string[]) {
  return url.protocol === 'https:' && !url.username && !url.password
    && hosts.some((h) => url.hostname === h || url.hostname.endsWith('.' + h))
}

// 按文件头判断真实格式，声明的 content-type 不可信
export function sniffBitmap(b: Uint8Array): string | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif'
  const ascii = (i: number, n: number) => String.fromCharCode(...b.slice(i, i + n))
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'image/webp'
  return null
}

export const EXT_SAFE_HEADERS = {
  'x-content-type-options': 'nosniff',
  'content-security-policy': "sandbox; default-src 'none'",
  // 只给本站（含子域）引用，防止被别的站拿来当图床
  'cross-origin-resource-policy': 'same-site',
} as const

const deny = (status: number, text: string) => new Response(text, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...EXT_SAFE_HEADERS } })

type ExtEnv = { Bindings: { EXT_HOSTS?: string } }
export async function handleExt(c: Context<ExtEnv>, fetcher: typeof fetch = fetch) {
  let url: URL
  try { url = new URL(c.req.query('u') ?? '') } catch { return deny(400, 'bad url') }
  const hosts = (c.env.EXT_HOSTS ?? 'linux.do').split(',').map((s) => s.trim()).filter(Boolean)
  if (!extHostAllowed(url, hosts)) return deny(403, 'host not allowed')

  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default
  const cacheKey = new Request(new URL(CACHE_PREFIX + encodeURIComponent(url.href), c.req.url).toString())
  const hit = await cache?.match(cacheKey)
  if (hit) return hit

  let current = url, up: Response | null = null
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    up = await fetcher(current.toString(), {
      redirect: 'manual',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; MemeHall/1.0)', accept: 'image/png,image/jpeg,image/gif,image/webp' },
      cf: { cacheTtl: 2592000, cacheEverything: true },
    } as RequestInit)
    if (![301, 302, 303, 307, 308].includes(up.status)) break
    const location = up.headers.get('location')
    if (!location) return deny(502, 'upstream redirect without location')
    let next: URL
    try { next = new URL(location, current) } catch { return deny(502, 'bad upstream redirect') }
    if (!extHostAllowed(next, hosts)) return deny(403, 'redirect not allowed')
    if (hop === MAX_HOPS) return deny(502, 'too many redirects')
    current = next
  }
  if (!up || !up.ok) return deny(502, `upstream ${up?.status ?? 0}`)
  if (!BITMAP.test(up.headers.get('content-type') ?? '')) return deny(415, 'unsupported image type')
  if (Number(up.headers.get('content-length') || 0) > MAX_BYTES) return deny(413, 'image too large')

  const body = new Uint8Array(await up.arrayBuffer())
  if (body.byteLength > MAX_BYTES) return deny(413, 'image too large')
  const type = sniffBitmap(body)
  if (!type) return deny(415, 'unsupported image type')

  const res = new Response(body, { headers: { 'content-type': type, 'cache-control': 'public, max-age=2592000', ...EXT_SAFE_HEADERS } })
  if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, res.clone()))
  return res
}
