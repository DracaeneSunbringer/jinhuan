// Isolated, read-only UI fixture. No production API, credentials, or transactions.
import {createServer} from 'node:http'
import {readFileSync,existsSync} from 'node:fs'
import {resolve,relative,isAbsolute} from 'node:path'
const root=resolve('public'),source=readFileSync(root+'/app.js','utf8')
const slice=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)))
const styles=['style.css','skin.css','chat.css','official-titles.css','bubble-options.css','title-raffle.css','collection.css','title-layout.css']
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>气泡动图隔离验收</title>
${styles.map(x=>`<link rel="stylesheet" href="/${x}">`).join('')}
<style>body{display:block;overflow:auto;height:auto;padding:16px;box-sizing:border-box;background:var(--bg);color:var(--text)}main{max-width:700px;margin:auto}.fixture-row{margin:20px 0;padding:12px 4px;border-bottom:1px solid var(--line)}.fixture-row h2{font-size:13px;margin:0 0 10px}.fixture-controls{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}h1{font-size:20px}.fixture-row .cm-text{font-size:14px}.fixture-note{font-size:13px}</style>
<main><h1>气泡动图隔离验收</h1><p class="fixture-note">只使用正式气泡和设置代码，不连接线上群聊。</p><div class="fixture-controls"><button id="settings" class="btn">气泡显示设置</button><button id="storage" class="btn btn-ghost">模拟存储失败</button></div><div id="messages"></div><p id="feedback" role="status"></p></main>
<script type="module">
import {PERSONAL_TITLES as LEGACY_PERSONAL_TITLES} from '/personal-catalog.js';
import {PERSONAL_V2_TITLES} from '/personal-v2-catalog.js';
const PERSONAL_TITLES={...LEGACY_PERSONAL_TITLES,...PERSONAL_V2_TITLES};
const S={me:{username:'fixture'},officialTitles:[]},PIPS=new Set(),OFFICIAL_ART={whale:''},DECO_BUBBLE=[['','默认'],['paw','猫爪']];
const icon=()=>document.createTextNode('×'),toast=t=>document.querySelector('#feedback').textContent=t;
${slice('function h(', '// 原生 append')}
${slice('const decoHide =', '// 这个人的装扮')}
${slice('function decoAt(', '// 自定义样式')}
${slice('const RAFFLE_TITLES =', 'const raffleArt =')}
const personalOf=(u,where)=>{const id=decoAt(u,where)?.pt;return PERSONAL_TITLES[id]?{id,...PERSONAL_TITLES[id]}:null};
const officialOf=()=>null;
${slice('function bubbleParts(', '// 装扮编辑：')}
for(const [id,text]of [['whalepunch','笑'],['muscle','收到，继续聊天。'],['maid','这是一张静态角色图。']]){
 const u={username:'other',deco:{ft:id}},article=h('article',{class:'fixture-row','data-kind':id},h('h2',null,RAFFLE_TITLES[id].name),h('div',{...bubbleView(u,'cm-text'),id:'bubble-'+id},h('span',{class:'rt-copy'},text)));
 document.querySelector('#messages').append(article);
}
document.querySelector('#settings').onclick=e=>openBubbleSettings(e.currentTarget);
const write=Storage.prototype.setItem;let fail=false;
Storage.prototype.setItem=function(...args){if(fail)throw Error('fixture storage blocked');return write.apply(this,args)};
document.querySelector('#storage').onclick=e=>{fail=!fail;e.currentTarget.textContent=fail?'恢复存储':'模拟存储失败'};
</script></html>`
createServer((req,res)=>{
 const p=new URL(req.url,'http://localhost').pathname
 if(req.method!=='GET'){res.writeHead(405).end();return}
 if(p==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}).end(html);return}
 if(!styles.includes(p.slice(1))&&!['/personal-catalog.js','/personal-v2-catalog.js'].includes(p)&&!/^\/assets\/raffle\/(?:collection\/|v2\/|title-layout-v2\/)?[a-z-]+\.webp$/.test(p)){res.writeHead(404).end();return}
 const file=resolve(root,p.slice(1)),rel=relative(root,file)
 if(rel.startsWith('..')||isAbsolute(rel)||!existsSync(file)){res.writeHead(404).end();return}
 res.writeHead(200,{'Content-Type':p.endsWith('.css')?'text/css':p.endsWith('.js')?'application/javascript':'image/webp','Cache-Control':'no-store'}).end(readFileSync(file))
}).listen(8797,'127.0.0.1',()=>console.log('Bubble motion fixture http://127.0.0.1:8797/'))
