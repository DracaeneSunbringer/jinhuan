// 独立静态简笔画套装：共享笔触规则，不复刻或修改已有参考图。
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import assert from 'node:assert/strict'
const rows=JSON.parse(readFileSync('assets/source/personal-decorations-20261014/designs.json','utf8'))
assert.equal(rows.length,59);assert.equal(new Set(rows.map(r=>r[0])).size,59)
const palettes=[['#4b6a9b','#dceaff','#f1b6cd'],['#367a78','#e0f2e9','#f2bc72'],['#65528c','#e9e3fa','#efc97c'],['#7653a0','#efe3ff','#e9accc'],['#965638','#fff0dc','#e79f65'],['#3d668c','#deeff7','#e4a879'],['#386e94','#e3f4ff','#91c9db'],['#507f73','#e5f5ed','#bca6d8'],['#396c80','#e3f3f2','#b6c8ed'],['#86643e','#fff2d9','#c69b72'],['#765aa4','#f6edff','#e4bc64'],['#52577d','#eeedf8','#e9aa62'],['#537a43','#eff6cd','#e4cc67'],['#407c88','#e3f4f4','#e7a390'],['#526a82','#eaf0f8','#d6ac72'],['#985248','#fff0e4','#cf8f70'],['#86672c','#fff8db','#97cbd1'],['#477952','#e5f3dc','#c9bd72'],['#486c79','#e6f5f5','#87b6bc'],['#9b6637','#fff0dd','#b7a5d6'],['#6e5a97','#eee7f7','#dcbf78'],['#71859b','#eff8ff','#c2b7df'],['#5b558d','#eae8ff','#8abbd7'],['#60778c','#edf2f8','#cbd5a4'],['#9b666c','#fff0ed','#a6bcd5'],['#5d7b65','#eaf2df','#dfcb7b'],['#826240','#fbefdf','#91a8bd'],['#5d7b45','#edf5d9','#de9f82'],['#3c7b82','#e0f4f2','#e9aa96'],['#826c37','#fbf4d8','#b9ce87'],['#406e9c','#e7f3ff','#eac774'],['#626184','#f1f0fc','#c4afdb'],['#8a6253','#fff0e0','#dcbd6c'],['#3b7a72','#def3e8','#f1b3a1'],['#4f6791','#e7f0fd','#a5d3c5'],['#85534f','#f6e6e3','#acb8bd'],['#535f91','#eaeffc','#bad1e8'],['#658361','#edf7eb','#e0b9ca'],['#71549b','#f0e6fd','#c8b9df'],['#87634d','#faf0e4','#a7ced7'],['#8b633c','#f8ecd8','#cb9667'],['#7f743e','#fff8dd','#9cbfd7'],['#567e48','#edf5df','#d9c48f'],['#8c6679','#f8e8ed','#bea28c'],['#557f6e','#edf7ed','#dbb9cf'],['#936648','#fff2d9','#dd9a83'],['#816b51','#f6eedf','#bac998'],['#776143','#faf0d8','#b8a2bf'],['#8a684e','#fff1dc','#a1caca'],['#826991','#fff3df','#c3a6d8'],['#92585f','#fae7e7','#b4bfd6'],['#64804b','#eff5de','#dfa974'],['#527e87','#edf8fa','#add0d2'],['#587277','#eaf1f0','#bba68d'],['#5c80a0','#eaf5ff','#d4c6e8'],['#4f898a','#e5f6f1','#b8cb95'],['#7a719c','#f1eefa','#bfc7e5'],['#98704e','#fff1e2','#a2b9d6']]
const p=(d,fill='none')=>`<path d="${d}" fill="${fill}"/>`,ellipse=(cx,cy,rx,ry,fill)=>`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"/>`
function creature(type,base,accent){
 const ears={cat:p('M24 35 20 12Q36 15 40 32M56 31Q64 13 77 14L73 39',accent),fox:p('M23 35 14 10 42 27M55 27 82 10 73 40',accent),rabbit:ellipse(32,23,8,21,base)+ellipse(64,23,8,21,accent),dog:p('M28 27Q3 18 11 49L27 45M67 27Q90 18 85 50L70 45',accent),bear:ellipse(25,29,12,12,accent)+ellipse(70,29,12,12,accent),mouse:ellipse(23,27,16,16,accent)+ellipse(72,27,16,16,accent),hamster:ellipse(25,27,12,12,accent)+ellipse(70,27,12,12,accent),deer:p('M29 31 22 15 14 11M22 15 24 5M65 31 73 15 82 11M73 15 71 5',base),ant:p('M34 30Q20 14 23 9M60 30Q76 14 73 9')}
 let body=''
 if(ears[type])body=ears[type]+ellipse(48,50,31,27,base)
 else if(type==='fish'||type==='whale')body=p('M24 35Q52 14 68 39L86 28 82 56 68 51Q47 82 20 61Q8 48 24 35Z',base)+p('M34 31 45 19 51 29M26 62Q38 57 42 67',accent)
 else if(type==='bird')body=p('M24 39Q25 13 49 19Q72 18 74 47L85 57 72 60Q64 78 41 75L20 73 27 62Q9 53 24 39Z',base)+p('M32 53Q50 47 51 64Q36 69 32 53Z',accent)
 else if(type==='plant')body=p('M23 48Q6 29 24 21Q41 20 47 44Q43 9 63 10Q82 13 65 44Q84 23 90 41Q92 57 66 58',accent)+p('M22 46H75L69 77Q48 84 27 77Z',base)
 else if(type==='ghost')body=p('M20 72V43Q19 16 48 17Q78 18 77 47L83 78 68 70 54 80 41 71 26 80Z',base)
 else if(type==='robot')body=p('M47 23V10M39 10H55')+`<rect x="17" y="25" width="62" height="51" rx="17" fill="${base}"/>`+p('M17 42H10V60H17M79 42H86V60H79',accent)
 else if(type==='egg')body=p('M27 28Q4 35 17 58Q12 78 36 80Q62 90 82 69Q94 45 71 30Q49 7 27 28Z',base)+ellipse(48,50,23,21,accent)
 else if(type==='boat')body=p('M12 57H84L70 78H30ZM48 15V57M44 19 18 52H44M53 26 74 52H53',base)+p('M19 82Q29 88 39 82T60 82T81 82',accent)
 else if(type==='star')body=p('M48 10 60 32 85 36 67 55 72 80 48 68 24 80 29 55 11 36 36 32Z',base)
 else if(type==='sun')body=p('M48 5V12M48 83V90M5 48H12M83 48H90M17 17 23 23M73 73 79 79M17 79 23 73M73 23 79 17')+ellipse(48,48,29,29,base)
 else body=ellipse(48,50,32,27,base)+ellipse(23,51,8,12,accent)+ellipse(73,51,8,12,accent)
 return body+ellipse(35,51,2.2,3,'currentColor')+ellipse(60,51,2.2,3,'currentColor')+p('M43 60Q48 65 53 60')+`<g stroke="none" opacity=".55">${ellipse(27,59,6,3,accent)+ellipse(69,59,6,3,accent)}</g>`
}
const props={
 cloud:p('M6 23Q0 13 9 12Q11 1 21 7Q31 4 32 15Q41 18 32 25Z'),star:p('M18 2 23 12 34 14 26 22 28 33 18 28 8 33 10 22 2 14 13 12Z'),
 laptop:p('M4 5H32V26H4ZM0 30H36L32 34H4Z')+p('M12 12 8 16 12 20M24 12 28 16 24 20'),monitor:p('M2 3H34V26H2ZM18 26V33M9 34H27')+p('M7 9H29M7 14H17M7 19H23'),
 picture:p('M2 3H34V33H2ZM5 27 14 17 21 23 27 14 32 25')+ellipse(11,11,3,3,'#fff'),
 book:p('M18 8Q7 1 2 5V30Q9 26 18 33Q26 26 34 30V5Q27 1 18 8V33')+p('M7 12H13M7 18H13M23 12H29M23 18H29'),
 magnifier:ellipse(14,14,11,11,'#fff')+p('M22 22 34 34M9 11Q12 6 17 8'),
 plane:p('M2 17 35 2 26 34 18 22 9 29 11 20ZM11 20 35 2 18 22'),
 crown:p('M3 10 10 17 18 4 26 17 33 10 29 31H7ZM8 26H28'),
 bowl:p('M2 17H34Q32 34 18 34Q4 34 2 17ZM9 12Q4 8 11 3M19 12Q14 8 21 3M29 12Q24 8 31 3'),
 leaf:p('M3 32Q0 4 33 3Q37 32 3 32ZM3 32 27 9M13 22V11M14 22H26'),
 coffee:p('M2 12H26V28Q14 39 2 28ZM26 15Q41 13 33 26H26M7 8Q3 4 9 1M18 8Q14 4 20 1'),
 phone:p('M9 1H27Q31 1 31 5V31Q31 35 27 35H9Q5 35 5 31V5Q5 1 9 1ZM10 8H26V26H10M15 31H21'),
 clock:ellipse(18,18,15,15,'#fff')+p('M18 8V19L26 23'),
 lemon:p('M4 26Q1 8 19 5L31 4 32 14Q35 29 16 33L5 33Z')+p('M12 12 15 10M9 20V18'),
 radio:p('M3 13H33V33H3ZM9 13 27 1M8 19H28M24 24V29')+ellipse(12,26,5,5,'#fff'),
 ticket:p('M2 7H34V14Q26 18 34 22V29H2V22Q10 18 2 14ZM18 10V13M18 17V20M18 24V27'),
 tools:p('M4 4 12 7 14 15 30 29 25 34 10 18 3 15ZM31 3 22 12M19 12 24 17M15 20 4 31 8 35 20 23'),
 music:p('M13 28V7L31 3V24M13 13 31 9')+ellipse(7,29,6,4,'#fff')+ellipse(25,26,6,4,'#fff'),
 flower:ellipse(18,18,7,7,'#fff')+p('M12 12Q1 0 5 18Q0 34 12 25Q19 40 24 26Q40 33 30 19Q39 4 24 10Q20-4 12 12'),
 jar:p('M7 2H29V8H7ZM9 8 4 14V31Q18 37 32 31V14L27 8')+p('M18 14 21 20 27 21 22 25 23 31 18 28 13 31 14 25 9 21 15 20Z'),
 ruler:p('M3 5H33V29H3ZM8 5V14M14 5V10M20 5V14M26 5V10'),
 clipboard:p('M11 5H3V34H33V5H25M11 2H25V10H11ZM9 17H27M9 23H27M9 29H20'),
 key:ellipse(11,11,8,8,'#fff')+p('M17 17 33 33M25 25 30 20M30 30 35 25'),
 spoon:ellipse(11,10,7,9,'#fff')+p('M14 18 30 34'),
 flag:p('M5 35V3M5 4Q16 0 20 4T33 4V22Q25 27 20 22T5 22'),
 map:p('M2 8 12 2 24 8 34 2V28L24 34 12 28 2 34ZM12 2V28M24 8V34'),
 puzzle:p('M2 9H11Q6-2 18 2Q28 2 22 9H33V18Q22 12 25 25Q25 33 33 28V35H2Z'),
 letter:p('M2 6H34V31H2ZM2 6 18 21 34 6M2 31 13 18M34 31 23 18'),
 chocolate:p('M4 3H32V34H4ZM4 13H32M4 23H32M18 3V34'),
 acorn:p('M5 16Q7 34 18 35Q30 31 31 16ZM2 16Q2 3 18 5Q34 3 34 16ZM18 5V0'),
 smile:ellipse(18,18,15,15,'#fff')+p('M11 13H12M24 13H25M10 22Q18 31 27 22'),
 candy:p('M9 10Q18 4 27 10V26Q18 31 9 26L1 32V5L9 10M27 10 35 5V32L27 26M14 10 23 26'),
 kite:p('M18 1 32 16 18 31 4 16ZM18 1V31M4 16H32M18 31Q5 35 13 40'),
 telescope:p('M2 13 29 3 34 17 7 28ZM20 23 13 35M20 23 28 35'),
 compass:ellipse(18,18,15,15,'#fff')+p('M23 8 20 21 10 28 14 14Z'),
 bulb:p('M10 23Q-1 9 11 3Q27-4 32 11Q35 19 26 24V29H10ZM12 34H24M16 27 12 15M21 27 25 15'),
 grain:p('M18 35V6M18 13Q0 15 6 3Q18 2 18 13M18 24Q0 26 6 14Q18 13 18 24M18 18Q36 20 30 8Q18 7 18 18M18 30Q36 32 30 20Q18 19 18 30')
}
const catalog={},assign=[];let css='/* 静态专属套装；生成文件，见 scripts/build-personal-decorations.mjs。 */\n'
mkdirSync('public/assets/personal',{recursive:true})
for(const [i,[uid,name,type,prop,palette,mood,refs]] of rows.entries()){
 assert.ok([...name].length<=6,name);assert.ok(props[prop],prop)
 const id='p'+String(i+1).padStart(3,'0'),[ink,base,accent]=palettes[palette]
 catalog[id]={name,mood};assign.push({id,uid,refs})
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 104 104" fill="none" stroke="${ink}" color="${ink}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><g transform="translate(1 2)">${creature(type,base,accent)}</g><g transform="translate(62 65) scale(.92)" fill="${accent}" stroke-width="2.8">${props[prop]}</g><path d="M10 84l3-4m-8-1 4-2" stroke="${accent}"/></svg>`
 writeFileSync(`public/assets/personal/${id}.svg`,svg)
 css+=`.pt-${id}{--pt-ink:${ink};--pt-paper:${base};--pt-accent:${accent};--pt-icon:url('/assets/personal/${id}.svg')}\n`
}
writeFileSync('public/personal-catalog.js','// 创作目录，不包含成员映射、原始消息或性格推断。\nexport const PERSONAL_TITLES='+JSON.stringify(catalog)+'\n')
writeFileSync('src/shared/personal-catalog.ts','// 由 scripts/build-personal-decorations.mjs 生成。\nexport const PERSONAL_TITLES='+JSON.stringify(catalog)+' as const\nexport const personalTitleId=(v:unknown): string | null => typeof v === "string" && Object.hasOwn(PERSONAL_TITLES,v) ? v : null\n')
writeFileSync('public/personal-palettes.css',css)
writeFileSync('research/personal-decorations-20261014/assignments.json',JSON.stringify(assign,null,2))
// 一次性授予收藏资格；后续资料 PATCH 只读 user_unlocks，不再读取群历史。
let migration=readFileSync('migrations/0032_optional_raffle_decorations.sql','utf8').split('-- PERSONAL COLLECTION')[0].trimEnd()
migration+='\n\n-- PERSONAL COLLECTION：本次快照中的真实成员；不强制佩戴，不纳入群抽奖。\nWITH gifts(user_id,item) AS (VALUES\n'+assign.map(x=>`(${x.uid},'personal:${x.id}')`).join(',\n')+`)\nINSERT OR IGNORE INTO user_unlocks(user_id,item,at)\nSELECT u.id,g.item,unixepoch() FROM gifts g JOIN users u ON u.id=g.user_id\nWHERE u.kind='user' AND u.disabled=0\nAND EXISTS(SELECT 1 FROM chat_members WHERE group_id=1 AND user_id=u.id)\nAND NOT EXISTS(SELECT 1 FROM account_retirements WHERE source_id=u.id);\n`
writeFileSync('migrations/0032_optional_raffle_decorations.sql',migration)
console.log({sets:rows.length,withHistory:assign.filter(x=>x.refs.length).length,neutral:assign.filter(x=>!x.refs.length).length})
