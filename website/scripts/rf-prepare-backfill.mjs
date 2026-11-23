// 对用户明确批准的候选清单生成与自动转入同等语义的幂等 SQL。
import { readFileSync, writeFileSync } from 'node:fs'
import { chatRoadContent } from '../src/chat-road.ts'
const rows=JSON.parse(readFileSync('.build/rf-backfill-input.json','utf8'))[0].results
if(rows.length>100)throw Error('候选超过核对范围，停止')
const q=v=>v==null?'NULL':"'"+String(v).replaceAll("'","''")+"'"
const sql=['-- 用户批准的历史反馈回填，2026-10-12；幂等，保留现有状态/投票/讨论。']
let n=0
for(const r of rows){
  const c=chatRoadContent(r.body);if(!c)continue;n++
  let source;try{source=JSON.parse(r.media)}catch{}
  const media=Array.isArray(source)?source.filter(m=>m.kind!=='f').map(m=>({u:'/img/'+(m.p??m.k),w:m.w,h:m.h,...(m.p?{v:'/img/'+m.k}:{}),...(m.kind?{k:m.kind}:{}),...(m.o?{o:'/img/'+m.o}:{}),...(m.b?{b:1}:{}),...(m.c?{c:1}:{})})):(r.image_key?[{u:'/img/'+r.image_key,w:r.width,h:r.height}]:[])
  sql.push(`INSERT INTO road_items (user_id,kind,title,body,media,source_msg_id,source_group_id,source_hidden,score,created_at,updated_at)
SELECT user_id,${q(c.kind)},${q(c.title)},body,${q(media.length?JSON.stringify(media):null)},id,group_id,0,1,created_at,strftime('%s','now')
FROM chat_messages WHERE id=${Number(r.id)} AND deleted=0 AND body=${q(r.body)}
ON CONFLICT(source_msg_id) DO UPDATE SET kind=excluded.kind,title=excluded.title,body=excluded.body,media=excluded.media,source_hidden=0,updated_at=excluded.updated_at;
INSERT OR IGNORE INTO road_votes(item_id,user_id,v) SELECT id,user_id,1 FROM road_items WHERE source_msg_id=${Number(r.id)} AND score=1 AND NOT EXISTS(SELECT 1 FROM road_votes WHERE item_id=road_items.id);
UPDATE chat_messages SET updated_at=strftime('%s','now') WHERE id=${Number(r.id)} AND deleted=0;`)
}
writeFileSync('.agents/tasks/road-feedback-2026-10-12/release-b1/backfill.sql',sql.join('\n'))
console.log('已生成 '+n+' 条历史反馈回填 SQL')
