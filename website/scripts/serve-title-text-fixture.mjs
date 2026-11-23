// Read-only artwork fixture using the production title renderer and styles.
import {createServer} from 'node:http'
import {readFileSync,existsSync} from 'node:fs'
import {resolve} from 'node:path'
const root=resolve('public'), source=readFileSync(root+'/app.js','utf8')
const renderer=source.slice(source.indexOf('function titleEl('),source.indexOf('// ---------- 徽章'))
const catalog=source.slice(source.indexOf('const RAFFLE_TITLES ='),source.indexOf('const raffleArt ='))
const styles=['style.css','skin.css','chat.css','official-titles.css','bubble-options.css','title-raffle.css','linuxdo.css','collection.css','personal-palettes.css','personal.css','title-layout.css']
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>称号文字位置核验</title>${styles.map(x=>`<link rel="stylesheet" href="/${x}">`).join('')}
<style>body{display:block;overflow:auto;padding:20px;box-sizing:border-box;height:auto;background:var(--bg);color:var(--text);font-family:var(--font)}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(290px,100%),1fr));gap:12px}article{min-width:0;border-bottom:1px solid var(--line);padding:8px 4px 20px}h1{font-size:20px;margin:0 0 12px}h2{font-size:13px;margin:0 0 10px}.fixture-row{display:flex;align-items:center;gap:6px;min-height:36px}.zoom{zoom:2.5;width:max-content;margin-top:8px}.fixture-controls{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px}.fixture-row>.cm-author{font-size:12px}.identity{padding:0;display:block}.identity-main{display:flex;gap:6px;align-items:center}.zoom .rt-level{display:none}body[data-grid="compact"] .zoom{display:none}body[data-grid="compact"] article{padding:6px}button,select{min-height:32px}p{font-size:12px;color:var(--text-2);margin:2px 0}</style>
<h1>称号文字位置核验</h1><div class="fixture-controls"><button id="theme">切换深浅</button><button id="compact">切换放大图</button><label>字体 <select id="font"><option value="">系统默认</option><option>Microsoft YaHei</option><option>Microsoft YaHei UI</option><option>Arial</option></select></label></div><main></main>
<script>
const h=(tag,attrs,...children)=>{const el=document.createElement(tag);for(const [k,v] of Object.entries(attrs||{})){if(v==null)continue;if(k==='class')el.className=v;else if(k==='style'){for(const [p,val]of Object.entries(v))el.style.setProperty(p,val)}else el.setAttribute(k,v)}for(const x of children.flat()){if(x!==false&&x!=null)el.append(x)}return el};
const OFFICIAL_ART={whale:''},personalOf=()=>null;
${catalog}
${renderer}
for(const [id,t]of Object.entries(RAFFLE_TITLES)){if(t.enabled===false)continue;const u={deco:{ft:id,fn:12}},a=h('article',{'data-title':id},h('h2',null,t.name+' · '+t.rarity));a.append(h('p',null,'群聊'),h('div',{class:'fixture-row cm-head'},h('span',{class:'cm-author'},'昵称'),titleEl(u),h('time',null,'12:30')),h('p',null,'名片'),h('div',{class:'identity'},h('div',{class:'identity-main'},titleEl(u))),h('div',{class:'zoom cm-head'},titleEl(u)));document.querySelector('main').append(a)}
document.querySelector('#theme').onclick=()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark'};
document.querySelector('#compact').onclick=()=>{document.body.dataset.grid=document.body.dataset.grid==='compact'?'':'compact'};
document.querySelector('#font').onchange=e=>{document.body.style.fontFamily=e.target.value||'var(--font)'};
</script></html>`
createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');const p=url.pathname
 if(req.method!=='GET'){res.writeHead(405).end();return}
 if(p==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}).end(html);return}
 if(!styles.includes(p.slice(1))&&!/^\/assets\/raffle\/(?:collection\/|v2\/|title-layout-v2\/)?[a-z-]+\.webp$/.test(p)){res.writeHead(404).end();return}
 const file=resolve(root,p.slice(1));if(!file.startsWith(root+'/')&&!file.startsWith(root+'\\')){res.writeHead(404).end();return}
 if(!existsSync(file)){res.writeHead(404).end();return}
 res.writeHead(200,{'Content-Type':p.endsWith('.css')?'text/css':'image/webp','Cache-Control':'no-store'}).end(readFileSync(file))
}).listen(8797,'127.0.0.1',()=>console.log('Title fixture http://127.0.0.1:8797/'))
