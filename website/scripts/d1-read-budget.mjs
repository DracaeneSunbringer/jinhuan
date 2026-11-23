// On-demand only; no scheduler and no application data queries.
import {execFileSync} from 'node:child_process'
import {writeFileSync,mkdirSync} from 'node:fs'
const args=Object.fromEntries(process.argv.slice(2).map(x=>x.replace(/^--/,'').split('=')))
const numeric=(key,fallback)=>{if(args[key]===undefined)return fallback;const n=Number(args[key]);if(!Number.isFinite(n)||n<0)throw Error(key+' 必须是非负数字');return n}
const dailyTarget=numeric('daily-target',500000000),remaining=numeric('remaining',null),days=numeric('days',null),reserve=numeric('reserve',0)
if(days===0)throw Error('days 必须大于零')
const raw=execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','info','meme-hall','--json'],{encoding:'utf8',timeout:60000,env:{...process.env,WRANGLER_LOG_PATH:'.build/wrangler-logs'}}),d=JSON.parse(raw.slice(raw.search(/^[\[{]/m)))
if(!Number.isFinite(d.rows_read_24h))throw Error('D1 用量不可用，不能按零用量处理')
const budget=remaining!==null&&days!==null?Math.min(dailyTarget,Math.max(0,remaining-reserve)/days):dailyTarget
const result={at:new Date().toISOString(),database:'meme-hall',rowsRead24h:d.rows_read_24h,dailyTarget,budgetPerDay:Math.floor(budget),status:d.rows_read_24h>budget?'over_budget':'within_budget',remainingRows:remaining,remainingDays:days,reserveRows:reserve,scope:'仅当前数据库滚动24小时；本账期剩余额度需账户账单确认；未自动限流或停服'}
mkdirSync('tests/evidence/d1-read-20261015/monitor',{recursive:true});writeFileSync('tests/evidence/d1-read-20261015/monitor/'+result.at.replace(/[:.]/g,'-')+'.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2))
