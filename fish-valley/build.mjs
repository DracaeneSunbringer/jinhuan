import { createRequire } from 'node:module'
import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.resolve(here, '../website/public')
const require = createRequire(new URL('../website/package.json', import.meta.url))
const { build } = require('esbuild')
const sdk = process.env.MINI_SDK_DIR
if (!sdk) throw Error('请用 MINI_SDK_DIR 指定平台 SDK 目录')
const sdkDir = path.resolve(sdk)
const { MINI_APP_ID: id, MINI_APP_ORIGIN: origin } = process.env
if (!!id !== !!origin) throw Error('打包时请同时设置 MINI_APP_ID 和 MINI_APP_ORIGIN')
if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) throw Error('请填写平台分配的 UUIDv7')
if (origin) {
  const url = new URL(origin)
  if (url.protocol !== 'https:' || url.origin !== origin) throw Error('MINI_APP_ORIGIN 须为 HTTPS origin')
}

const dist = path.join(here, 'dist')
const out = path.join(dist, 'web')
const art = 'pets/dsh/isle/art/'
const assets = {
  ['/' + art + 'tiny-farm.png']: 'assets/tiny-farm.png',
  ['/' + art + 'tiny-town.png']: 'assets/tiny-town.png',
  ['/' + art + 'tiny-farm-LICENSE.txt']: 'assets/tiny-farm-LICENSE.txt',
  ['/' + art + 'tiny-town-LICENSE.txt']: 'assets/tiny-town-LICENSE.txt',
}
await mkdir(path.join(out, 'assets'), { recursive: true })
for (const [src, target] of Object.entries(assets)) await cp(path.join(publicDir, src.slice(1)), path.join(out, target))

await build({
  entryPoints: [path.join(here, 'src/main.js')],
  outdir: out,
  bundle: true,
  format: 'iife',
  target: 'es2022',
  entryNames: 'app',
  define: {
    __MINI_NAME__: JSON.stringify('鱼鱼谷'),
    __MINI_CHORES__: 'false',
  },
  inject: [path.join(here, 'src/inject.js')],
  plugins: [{
    name: 'valley-assets',
    setup(builder) {
      const platform = path.join(here, 'src/platform.js')
      builder.onResolve({ filter: /^valley-assets$/ }, () => ({ path: 'allowed', namespace: 'asset-list' }))
      builder.onLoad({ filter: /.*/, namespace: 'asset-list' }, () => ({ contents: JSON.stringify(assets), loader: 'json' }))
      builder.onResolve({ filter: /^@discourse-mini-app\/sdk$/ }, () => ({ path: path.join(sdkDir, 'index.mjs') }))
      builder.onResolve({ filter: /^\/pet-(?:isle(?:-art|-scenery|-ui)?|world-rules)\.js$/ }, ({ path: asset }) => ({ path: path.join(publicDir, asset.slice(1)), namespace: 'valley-module' }))
      builder.onLoad({ filter: /.*/, namespace: 'valley-module' }, async ({ path: file }) => {
        let source = await readFile(file, 'utf8')
        source = source.replace('await A.loadArt()', 'await A.loadArt(assetURL)')
          .replace(/(\b\w+)\.toDataURL\(\)/g, 'canvasURL($1)')
          .replace('src: A.merchantUrl,', "src: A.itemIcon('seed'),")
        const imports = 'import {assetURL,canvasURL} from ' + JSON.stringify(platform) + ';\n'
        return { contents: imports + source, loader: 'js', resolveDir: publicDir }
      })
    },
  }],
})
await cp(path.join(here, 'src/template.html'), path.join(out, 'index.html'))
await writeFile(path.join(out, 'strings.json'), '{"name":"鱼鱼谷"}\n')

const manifest = {
  format: 1, ...(id ? { id } : {}), name: '鱼鱼谷', version: '1.0.0',
  entry: 'index.html', script: 'app.js', style: 'app.css',
  permissions: ['user.read', 'theme.read', 'storage.read', 'storage.write', 'network.request'],
  assets: Object.values(assets),
}
if (origin) manifest.endpoints = {
  gameRead: { url: origin + '/api/miniapp/sandbox/read', method: 'GET', query: ['route'], auth: 'platform' },
  gameWrite: { url: origin + '/api/miniapp/sandbox/write', method: 'POST', auth: 'platform' },
}
await writeFile(path.join(dist, 'manifest-draft.json'), JSON.stringify(manifest, null, 2) + '\n')
const fileNames = ['app.js', 'app.css', 'index.html', 'strings.json', ...manifest.assets]
await Promise.all(fileNames.map(name => stat(path.join(out, name))))
if (id) {
  const { pack } = await import(pathToFileURL(path.join(sdkDir, 'pack.mjs')))
  const files = Object.fromEntries(await Promise.all(fileNames.map(async name => [name, await readFile(path.join(out, name))])))
  const result = await pack({ manifest, files, outputDirectory: path.join(dist, 'package') })
  console.log(result.file)
} else console.log('鱼鱼谷构建已生成 dist/web，等待平台分配的应用 ID 和沙箱地址。')
