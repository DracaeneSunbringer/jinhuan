import {readFileSync,writeFileSync,mkdirSync,statSync} from 'node:fs'
import {gzipSync} from 'node:zlib'
const dir='assets/generated/personal-decorations-20261014'
mkdirSync(dir,{recursive:true})
const rows=JSON.parse(readFileSync('assets/source/personal-decorations-20261014/designs.json','utf8'))
const palette=readFileSync('public/personal-palettes.css','utf8'),skin=readFileSync('public/personal.css','utf8')
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const raw=JSON.parse(readFileSync('data/raw/personal-decorations-20261014/samples.json','utf8'))
const users=new Map(raw.flatMap(x=>x.results||[]).map(x=>[x.id,x]))
let manifest='# 群友专属套装目录\n\n快照：2026-10-14；59 位真实成员，42 位有文字片段、17 位中性创作。测试账号排除。所有款式均为普通 · 简笔画，称号/徽章/气泡共同佩戴，可摘下，不参加公共抽奖。\n\n|成员|套装|设计主题|历史依据|\n|---|---|---|---|\n'
let bytes=0
for(let page=0;page<Math.ceil(rows.length/12);page++){
 const cards=rows.slice(page*12,page*12+12).map(([uid,name,type,prop,pal,mood,refs],k)=>{
  const id='p'+String(page*12+k+1).padStart(3,'0'),u=users.get(uid),member=u?.name||u?.username||uid
  const data='data:image/svg+xml;base64,'+readFileSync('public/assets/personal/'+id+'.svg').toString('base64')
  bytes+=statSync('public/assets/personal/'+id+'.svg').size
  manifest+=`|${escape(member)} (@${escape(u?.username||uid)})|${name}|${mood}|${refs.length?'消息编号 '+refs.join('、'):'历史不足，中性创作'}|\n`
  return `<article><div class="meta">${escape(member)} <small>@${escape(u?.username||uid)}</small></div><div class="identity"><span class="pt-title u-title pt-${id}">${name}</span><span class="pt-badge"><img src="${data}"></span></div><div class="cm-text pt-bubble pt-${id}" style="--pt-icon:url('${data}')"><span>今天也要开心呀</span></div><p>${mood}</p><img class="detail" src="${data}"></article>`
 }).join('')
 writeFileSync(`${dir}/catalog-${page+1}.html`,`<!doctype html><meta charset="utf-8"><title>群友专属套装 ${page+1}</title><style>${palette}${skin}*{box-sizing:border-box}body{margin:0;padding:24px;background:#f7f6f2;color:#263847;font:14px/1.5 system-ui,"Microsoft YaHei"}header{display:flex;justify-content:space-between;margin-bottom:18px}header h1{font-size:22px;margin:0}header span{align-self:end;color:#697984}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}article{position:relative;height:218px;padding:15px;background:white;border-radius:12px;border:1px solid #e4e6e7}article p{width:180px;font-size:12px;color:#687883;margin:16px 0 0}.identity{display:flex;align-items:center;gap:7px;margin:8px 0 16px}.meta{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}small{font-weight:400;color:#7a8892}.cm-text{width:max-content;font-size:14px}img.detail{position:absolute;bottom:9px;right:8px;width:66px;height:66px}.pt-title{font-size:12px!important;height:24px!important}</style><header><h1>群友专属 · 简笔画套装</h1><span>${page+1} / ${Math.ceil(rows.length/12)}　普通 · 自由佩戴</span></header><main class="grid">${cards}</main>`)
}
writeFileSync('research/personal-decorations-20261014/catalog.md',manifest)
const meta={sets:59,svgBytes:bytes,svgAverageBytes:Math.round(bytes/59),catalogGzipBytes:gzipSync(readFileSync('public/personal-catalog.js')).length,palettesGzipBytes:gzipSync(readFileSync('public/personal-palettes.css')).length,notes:'静态图像；只加载实际呈现的头像；没有新增监听或模型调用。不是生产内存实测。'}
writeFileSync('tests/evidence/bubble-density-20261014/asset-budget.json',JSON.stringify(meta,null,2));console.log(meta)
