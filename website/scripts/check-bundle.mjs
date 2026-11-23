import {readFileSync,readdirSync,existsSync} from 'node:fs'
import {join} from 'node:path'
import {gzipSync} from 'node:zlib'
import {legacyRelease} from './legacy-assets.mjs'
import assert from 'node:assert/strict'
const client='web/dist/client', worker='web/dist/meme_hall'
const html=readFileSync(join(client,'app.html'),'utf8')
const jsFiles=readdirSync(join(client,'assets')).filter(f=>f.endsWith('.js'))
const bytes=jsFiles.reduce((sum,file)=>sum+gzipSync(readFileSync(join(client,'assets',file))).length,0)
assert.ok(bytes<=130*1024,`首屏脚本超过预算：${bytes}`)
assert.match(html,/\/assets\/app-[\w-]+\.js/)
assert.ok(!existsSync(join(worker,'index.html')),'Worker 目录不应有旧 HTML')
const config=JSON.parse(readFileSync(join(worker,'wrangler.json'),'utf8'))
for(const route of ['/api/*','/auth/*','/img/*','/ext','/m/*','/s/*','/admin/flags','/me/invites','/me/account','/me/account/email','/login','/register','/reset','/i/*','/i','/welcome']) assert.ok(config.assets.run_worker_first.includes(route),`缺少 Worker 路由 ${route}`)
assert.ok(config.triggers.crons.includes('* * * * *'),'红包提醒必须保留每分钟 Cron')
assert.ok(config.triggers.crons.includes('0 1 * * *'),'账号临时记录必须保留每日清理')
assert.ok(config.triggers.crons.includes('*/5 * * * *'),'图片任务必须保留独立五分钟 Cron')
const legacy=readFileSync(join(client,'index.html'),'utf8')
const release=legacyRelease(client)
for(const file of ['app.js','style.css','chat.css','official-titles.css','title-anime.css'])assert.ok(legacy.includes(`/${file}?v=${release.version}`),`入口资源戳不匹配：${file}`)
for(const file of [...release.files,'index.html'])for(const match of readFileSync(join(client,file),'utf8').matchAll(release.pattern))assert.ok(match[0].endsWith('?v='+release.version),`延迟加载资源戳不匹配：${file} -> ${match[0]}`)
const helper=readFileSync(join(client,'meme-redpacket.user.js'),'utf8')
assert.equal(helper.replace(/\r\n/g,'\n'),readFileSync('public/meme-redpacket.user.js','utf8').replace(/\r\n/g,'\n'),'发布包红包辅助脚本与已测试源文件不同')
for(const host of ['hb.unsnow.org','credit.linux.do','hb.lafi.sh']) assert.ok(helper.includes(host))
assert.ok(helper.startsWith('// ==UserScript=='))
console.log(JSON.stringify({clientGzipBytes:bytes,limit:130*1024,legacyStamp:true,redpacketCron:true,dualEntry:true}))
