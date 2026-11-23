// 部署前给静态资源打版本号：内容一变，链接就变，手机浏览器不会再用旧缓存的 JS/CSS
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import './build-redpacket-helper.mjs'

const pub = new URL('../public/', import.meta.url)
const read = (f) => readFileSync(new URL(f, pub), 'utf8')
const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 8)
const stamp = (text, file, v) => text.replace(new RegExp(`/${file.replace('.', '\\.')}(\\?v=[0-9a-z]+)?(['"])`, 'g'), `/${file}?v=${v}$2`)

// cipher.js 由 app.js 动态加载，先把它的版本写进 app.js，再算 app.js 自己的
writeFileSync(new URL('redpacket-create-ui.js',pub),stamp(read('redpacket-create-ui.js'),'redpacket-create-core.js',hash(read('redpacket-create-core.js'))))
writeFileSync(new URL('redpacket-native.js',pub),stamp(read('redpacket-native.js'),'redpacket-cover.js',hash(read('redpacket-cover.js'))))
writeFileSync(new URL('redpacket.js', pub), stamp(read('redpacket.js'), 'redpacket-cover.js', hash(read('redpacket-cover.js'))))
for(const file of ['redpacket-reference.js','redpacket-create-ui.js','redpacket-native.js'])if(read('redpacket.js').includes('/'+file))writeFileSync(new URL('redpacket.js',pub),stamp(read('redpacket.js'),file,hash(read(file))))
let app = read('app.js')
app = stamp(app, 'cipher.js', hash(read('cipher.js')))
app = stamp(app, 'redpacket.js', hash(read('redpacket.js')))
app = stamp(app, 'emoji-search.json', hash(read('emoji-search.json')))
app = stamp(app, 'resource-memory.js', hash(read('resource-memory.js')))
writeFileSync(new URL('app.js', pub), app)

let html = read('index.html')
for (const f of ['app.js', 'style.css', 'skin.css', 'chat.css', 'official-titles.css', 'linuxdo.css']) html = stamp(html, f, hash(read(f)))
writeFileSync(new URL('index.html', pub), html)
console.log('stamped', html.match(/\?v=[0-9a-z]{8}/g).join(' '))
