import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

const hash = text => createHash('sha1').update(text).digest('hex').slice(0, 8)
const stamp = (text, file, value) => text.replace(new RegExp(`/${file.replace('.', '\\.')}(\\?v=[0-9a-z.-]+)?(['"])`, 'g'), `/${file}?v=${value}$2`)

export function legacyRelease(directory){
  const files=readdirSync(directory).filter(f=>/\.(js|css)$/.test(f)&&!['sw.js','meme-redpacket.user.js'].includes(f)).sort()
  const pattern=new RegExp(`(\\/(${files.map(f=>f.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')}))(?:\\?v=[0-9a-z.-]+)*(?=['"\x60])`,'g')
  const version=hash(files.map(file=>file+'\n'+readFileSync(join(directory,file),'utf8').replace(pattern,'$1')).join('\n'))
  return {files,pattern,version}
}

// 仅处理 client 产物。public 源码和 worker bundle 不在写入范围内。
export function stampLegacyAssets(directory) {
  const read = file => readFileSync(join(directory, file), 'utf8')
  writeFileSync(join(directory,'app.js'),stamp(read('app.js'),'emoji-search.json',hash(read('emoji-search.json'))))
  // helper 的输入全部来自这次构建复制的 client 资源；保留已审核的 userscript 权限头。
  const template = read('meme-redpacket.user.js')
  const headerEnd = template.indexOf('// ==/UserScript==') + '// ==/UserScript=='.length
  if (headerEnd < 18) throw new Error('红包辅助脚本权限头缺失')
  const providers = read('redpacket-providers.js').replace(/^export /gm, '')
  const fishCode = read('fish-ecoji.js').replace(/^export /gm, '')
  const creditCore = readFileSync(new URL('./credit-create-core.js', import.meta.url), 'utf8').replace(/^export /gm, '')
  const creditPage = readFileSync(new URL('./credit-create-page.js', import.meta.url), 'utf8')
  const runtime = readFileSync(new URL('./redpacket-helper-runtime.js', import.meta.url), 'utf8')
  const platformCore=read('redpacket-create-core.js').replace(/^export /gm,'')
  const platformRuntime=readFileSync(new URL('./platform-create-runtime.js',import.meta.url),'utf8')
  writeFileSync(join(directory, 'meme-redpacket.user.js'), `${template.slice(0, headerEnd)}\n\n(()=>{\n"use strict";\n${providers}\n${fishCode}\n${creditCore}\n${creditPage}\n${platformCore}\n${platformRuntime}\n${runtime}\n})();\n`)
  // Lazy feature modules must share the same release identity as the entrypoint.
  // A single fingerprint handles circular imports without duplicate module instances.
  const {files,pattern,version}=legacyRelease(directory)
  for(const file of [...files,'index.html'])writeFileSync(join(directory,file),read(file).replace(pattern,`$1?v=${version}`))
}
