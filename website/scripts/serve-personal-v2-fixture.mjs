// Local visual inspection only. No DB, account data, listening to chat or model calls.
import {createServer} from 'node:http'
import {readFileSync,existsSync} from 'node:fs'
import {resolve} from 'node:path'
const root=resolve('public'),work=resolve('.build/personal-v2')
const source=readFileSync(root+'/app.js','utf8')
const renderer=source.slice(source.indexOf('const personalOf='),source.indexOf('// ---------- 徽章'))
const bubbleRenderer=source.slice(source.indexOf('function bubbleParts('),source.indexOf('const bubbleCls ='))
const catalog=readFileSync(root+'/personal-v2-catalog.js','utf8').replace('export const PERSONAL_V2_TITLES=','const PERSONAL_TITLES=')
const styles=['style.css','skin.css','chat.css','official-titles.css','bubble-options.css','title-raffle.css','linuxdo.css','collection.css','personal-palettes.css','personal.css','title-layout.css','personal-v2.css','personal-v2-art.css']
const names=JSON.parse(readFileSync('research/personal-decorations-v2-20261014/design-directions.json','utf8')).map(x=>x.title)
const inventory=()=>JSON.parse(readFileSync(work+'/inventory.json','utf8'))
const page=()=>`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>第二轮专属套装尺寸核验</title>${styles.map(x=>`<link rel="stylesheet" href="/${x}">`).join('')}
<style>body{display:block;overflow:auto;height:auto;padding:16px;box-sizing:border-box;background:var(--bg);color:var(--text)}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr));gap:14px}article{min-width:0;padding-bottom:18px;border-bottom:1px solid var(--line)}h1{font-size:18px}h2{font-size:12px;font-weight:400;color:var(--text-2);margin:8px 0}.controls{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}.head{display:flex;align-items:center;gap:5px;min-height:32px;flex-wrap:wrap}body[data-titlezoom="yes"] .pt-title{zoom:3}body[data-titlezoom="yes"] .head{min-height:95px}body[data-titlezoom="yes"] .line{display:none}.head time{font-size:11px;color:var(--text-2)}.line{margin:4px 0;min-width:0}.message{font-size:14px}.asset{display:none}body[data-assets="yes"] .asset{display:block;width:100%;height:90px;object-fit:contain;margin:8px 0}.attachment{display:block;width:110px;height:60px;background:#cadced;border-radius:4px}.summary{font-size:12px}button,select{min-height:32px}a{color:inherit}</style>
<h1>第二轮专属套装尺寸核验</h1><div class="controls"><button id="theme">切换深浅</button><button id="assets">查看原图切片</button><button id="zoomtitles">放大称号</button><label>批次 <select id="batch"></select></label><label>正文 <select id="copy"><option value="short">短句</option><option value="long">多行与链接</option><option value="media">附件</option></select></label><label>字体 <select id="font"><option value="">系统默认</option><option>Microsoft YaHei</option><option>Arial</option></select></label></div><p class="summary"></p><main></main>
<script>
const inventory=${JSON.stringify(inventory().map(x=>({id:x.id,assets:Object.fromEntries(Object.entries(x.assets).map(([k,v])=>[k,{width:v.width,height:v.height}]))})))},names=${JSON.stringify(names)};
${catalog}
const S={me:{username:'fixture'}},decoAt=u=>u.deco;
${renderer}
${bubbleRenderer}
const main=document.querySelector('main'),batch=document.querySelector('#batch');
for(let i=0;i<inventory.length;i+=12){const o=document.createElement('option');o.value=i;o.textContent=(i+1)+'–'+Math.min(i+12,inventory.length);batch.append(o)}
const h=(tag,attrs,...children)=>{const el=document.createElement(tag);for(const [k,v]of Object.entries(attrs||{})){if(v!=null)el.setAttribute(k,v)}for(const c of children.flat())if(c!=null)el.append(c);return el};
function draw(){main.replaceChildren();for(const item of inventory.slice(Number(batch.value),Number(batch.value)+12)){const index=Number(item.id.slice(5,8))-1,name=names[index],style='--pv-frame:url(/preview/'+item.id+'-frame.webp);--pv-title:url(/preview/'+item.id+'-title.webp);--pv-character:url(/preview/'+item.id+'-character.webp)';const article=h('article',{'data-id':item.id,style},h('h2',null,item.id));const u={username:'fixture',deco:{pt:item.id}},title=titleEl(u);article.append(h('div',{class:'head cm-head'},h('span',null,'昵称'),title,personalBadge({id:item.id,...PERSONAL_TITLES[item.id]}),h('time',null,'12:30')));const mode=document.querySelector('#copy').value,copy=h('span',{class:'rt-copy'},mode==='long'?'这是一段较长的消息，用来核对边框是否能随文字撑高，正文从左侧正常开始，保持上下留白协调。 ':mode==='media'?'附件说明':'收到，今天也开心');if(mode==='long')copy.append(h('a',{href:'#'},'https://example.invalid/'+('longlink').repeat(12)));if(mode==='media')copy.append(h('span',{class:'attachment','aria-label':'附件占位'}));article.append(h('div',{class:'line message'},h('div',{class:'cm-text'+bubbleParts(u)[0].classes},copy)));for(const type of ['frame','title'])article.append(h('img',{class:'asset',src:'/preview/'+item.id+'-'+type+'.webp',alt:type}));main.append(article)}document.querySelector('.summary').textContent='已拆分 '+inventory.length+' 套；当前只展示12套，未上线。'}
document.querySelector('#zoomtitles').onclick=()=>document.body.dataset.titlezoom=document.body.dataset.titlezoom==='yes'?'no':'yes';batch.onchange=draw;document.querySelector('#copy').onchange=draw;document.querySelector('#theme').onclick=()=>document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.querySelector('#assets').onclick=()=>document.body.dataset.assets=document.body.dataset.assets==='yes'?'no':'yes';document.querySelector('#font').onchange=e=>document.body.style.fontFamily=e.target.value||'var(--font)';draw();
</script></html>`
createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost'),p=url.pathname
 if(req.method!=='GET'){res.writeHead(405).end();return}
 if(p==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}).end(page());return}
 let file,type
 if(styles.includes(p.slice(1))){file=resolve(root,p.slice(1));type='text/css'}
 else if(/^\/assets\/personal-v2\/pv2-p\d{3}-(doodle|ssr)-(frame|title|character|badge)\.webp$/.test(p)){file=resolve(root,p.slice(1));type='image/webp'}
 else if(/^\/preview\/pv2-p\d{3}-(doodle|ssr)-(frame|title|character|badge)\.webp$/.test(p)){file=resolve(work,'assets',p.split('/').pop());type='image/webp'}
 else {res.writeHead(404).end();return}
 if(!existsSync(file)){res.writeHead(404).end();return}
 res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'}).end(readFileSync(file))
}).listen(8798,'127.0.0.1',()=>console.log('Personal v2 fixture http://127.0.0.1:8798/'))
