import {chatMediaKeysForAudit} from './chat-media-retention'

// 只建立引用索引；不删除对象。快照游标保证历史只扫描一次，增量由数据库触发器维护。
export async function auditChatMediaPage(db:D1Database,limit=100){
 const size=Math.max(1,Math.min(100,Math.trunc(limit)))
 let state=await db.prepare('SELECT cursor,high_water,complete FROM chat_media_audit_state WHERE id=1').first<{cursor:number;high_water:number;complete:number}>()
 if(!state){
  await db.prepare('INSERT OR IGNORE INTO chat_media_audit_state(id,cursor,high_water,complete) SELECT 1,0,COALESCE(MAX(id),0),0 FROM chat_messages').run()
  state=await db.prepare('SELECT cursor,high_water,complete FROM chat_media_audit_state WHERE id=1').first<{cursor:number;high_water:number;complete:number}>()
 }
 if(!state||state.complete)return {complete:!!state?.complete,scanned:0}
 const page=(await db.prepare('SELECT id,image_key,media,created_at FROM chat_messages WHERE id>? AND id<=? ORDER BY id LIMIT ?')
  .bind(state.cursor,state.high_water,size).all<{id:number;image_key:string|null;media:string|null;created_at:number}>()).results
 const statements:D1PreparedStatement[]=[]
 for(const row of page){
  if(!row.image_key&&!row.media)continue
  const {keys,safe}=chatMediaKeysForAudit(row.image_key,row.media)
  // 原值比较防止回填时并发修改后写入过时引用；新值由触发器记录。
  if(keys.length)statements.push(db.prepare(`INSERT OR IGNORE INTO chat_media_audit_refs(message_id,key,created_at)
   SELECT ?1,value,?2 FROM json_each(?3) WHERE EXISTS(SELECT 1 FROM chat_messages m WHERE m.id=?1 AND m.created_at=?2 AND m.image_key IS ?4 AND m.media IS ?5)`)
   .bind(row.id,row.created_at,JSON.stringify(keys),row.image_key,row.media))
  if(!safe)statements.push(db.prepare(`INSERT OR IGNORE INTO chat_media_audit_issues(message_id,reason)
   SELECT ?1,'unrecognized_media' WHERE EXISTS(SELECT 1 FROM chat_messages m WHERE m.id=?1 AND m.created_at=?2 AND m.image_key IS ?3 AND m.media IS ?4)`)
   .bind(row.id,row.created_at,row.image_key,row.media))
 }
 const last=page.at(-1)?.id??state.cursor,complete=page.length<size||last>=state.high_water
 statements.push(db.prepare('UPDATE chat_media_audit_state SET cursor=?,complete=? WHERE id=1 AND cursor=? AND complete=0').bind(last,complete?1:0,state.cursor))
 await db.batch(statements)
 return {complete,scanned:page.length}
}
