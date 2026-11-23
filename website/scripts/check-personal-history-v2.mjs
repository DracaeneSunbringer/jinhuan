import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {execFileSync,spawnSync} from 'node:child_process'
import assert from 'node:assert/strict'
import {redactPersonalHistory as redact} from './personal-history-redaction.mjs'
const out='tests/evidence/personal-decorations-v2-20261014'
const base='data/processed/personal-decorations-v2-20261014'
const json=p=>JSON.parse(readFileSync(p,'utf8'))
const evidence=[]
const check=(id,fn)=>{fn();evidence.push({id,result:'pass'})}
const scope=new Set(json('assets/source/personal-decorations-20261014/designs.json').map(x=>x[0]))
const old=json('data/raw/personal-decorations-20261014/samples.json')[0].results.filter(x=>scope.has(x.id))
const fragments=old.flatMap(x=>[...JSON.parse(x.recent),...JSON.parse(x.early)])
const oldStats={members:old.length,textMessages:old.reduce((n,x)=>n+x.text_count,0),fragments:fragments.length,uniqueFragments:new Set(fragments.map(x=>x.id)).size,zeroText:old.filter(x=>!x.text_count).length}
check('PH01-old',()=>assert.deepEqual(oldStats,{members:59,textMessages:18067,fragments:560,uniqueFragments:538,zeroText:17}))
const rows=json(`${base}/timeline.json`),coverage=json(`${base}/coverage.json`),designs=json(`${base}/design-review.json`)
check('PH01-current',()=>{assert.equal(rows.length,20066);assert.equal(new Set(rows.map(x=>x.id)).size,rows.length);assert(rows.every(x=>x.id<=coverage.highwater&&typeof x.body==='string'));assert.equal(coverage.rowsWritten,0);assert.equal(coverage.memberText,19464)})
check('PH02-members',()=>{assert.equal(designs.length,59);assert.equal(new Set(designs.map(x=>x.uid)).size,59);assert(designs.every(x=>scope.has(x.uid)));assert.equal(designs.filter(x=>x.evidenceState==='无文字依据').length,17)})
check('PH02-authorship',()=>{const byId=new Map(rows.map(x=>[x.id,x]));for(const d of designs)for(const id of d.refs)assert.equal(byId.get(id).user_id,d.uid)})
check('PH04-mask',()=>{
  for(const input of ['sk-'+'Q'.repeat(32),'Bearer '+'Z'.repeat(40),'password=synthetic-value','Authorization: Bearer synthetic-value','Cookie: sid=synthetic-value','https://private.example.test/?token=synthetic-value','person@example.test','口令 12345678']){
    const output=redact(input);assert.notEqual(output,input);assert(!output.includes('synthetic-value'));assert(!output.includes('example.test'));assert(!output.includes('12345678'))
  }
  assert.equal(redact(null),'');assert.equal(redact('一起分享有趣的图片。'),'一起分享有趣的图片。')
})
check('PH04-ignore',()=>{
  for(const path of [`${base}/review.html`,`${base}/design-review.json`,'data/raw/personal-decorations-v2-20261014/page-001.json','research/personal-decorations-v2-20261014/design-directions.json'])assert.equal(execFileSync('git',['check-ignore',path],{encoding:'utf8'}).trim(),path)
})
check('PH04-ci',()=>{
  for(const file of ['audit-personal-history-v2','read-personal-history-v2','preview-personal-history-v2']){
    const result=spawnSync(process.execPath,[`scripts/${file}.mjs`],{encoding:'utf8',env:{...process.env,CI:'1'}})
    assert.notEqual(result.status,0);assert(result.stderr.includes('private review is not permitted in CI'))
  }
})
check('PH04-build-boundary',()=>{
  const vite=readFileSync('vite.config.ts','utf8'),release=readFileSync('scripts/prepare-release.mjs','utf8')
  assert(vite.includes('publicDir: `${root}/public`'));assert(release.includes("client=resolve('web/dist/client')"));assert(release.includes("cpSync(client,join(output,'client')"))
  for(const f of ['vite.config.ts','scripts/prepare-release.mjs'])assert(!readFileSync(f,'utf8').includes('personal-decorations-v2-20261014'))
})
check('PH05-pairs',()=>{assert.equal(designs.filter(x=>x.assetsReady).length,2);assert.equal(designs.length*2,118)})
mkdirSync(out,{recursive:true})
const result={date:new Date().toISOString(),oldStats,current:{messages:rows.length,textMessages:coverage.memberText,members:59,rowsRead:coverage.rowsRead,rowsWritten:0},checks:evidence,scope:'历史复核和样张，不是生产装扮验收'}
writeFileSync(`${out}/local-validation.json`,JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify({checks:evidence.length,result:'pass',oldStats,current:result.current}))
