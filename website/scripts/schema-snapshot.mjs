import {DatabaseSync} from 'node:sqlite'
import {readFileSync,writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
// 0018 基线仅用于复现升级。新空库使用根 schema.sql；生产按增量迁移升级。
const files=['tests/fixtures/schema-0018.sql','migrations/0019_platform_settings.sql','migrations/0020_accounts.sql','migrations/0021_handle_setup.sql','migrations/0022_login_alert_index.sql','migrations/0023_chat_ai_away.sql','migrations/0024_ai_image_jobs.sql','migrations/0025_account_retirements.sql','migrations/0026_dm.sql','migrations/0027_title_raffles.sql','migrations/0028_redpack_image_clue.sql','migrations/0029_daily_post_views.sql','migrations/0030_deepseek_raffle.sql','migrations/0031_reference_collection.sql','migrations/0032_optional_raffle_decorations.sql','migrations/0033_personal_v2_collections.sql','migrations/0034_chat_sticker_favorites.sql']
files.push('migrations/0035_redpacket_draw.sql')
files.push('migrations/0036_native_ldc.sql')
files.push('migrations/0037_read_indexes.sql')
files.push('migrations/0038_guess_chat.sql')
files.push('migrations/0039_sender_search.sql')
files.push('migrations/0040_chat_files.sql')
files.push('migrations/0041_guess_rewards.sql')
files.push('migrations/0042_guess_word_history.sql')
files.push('migrations/0043_guess_room.sql')
files.push('migrations/0044_guess_history.sql')
files.push('migrations/0045_free_guess.sql')
files.push('migrations/0046_guess_extra_hints.sql')
files.push('migrations/0047_guess_author_options.sql')
files.push('migrations/0048_guest_gallery_order.sql')
files.push('migrations/0049_notif_recent_indexes.sql')
files.push('migrations/0050_chat_at_unread_index.sql')
const db=new DatabaseSync(':memory:')
try{
 for(const file of files)db.exec(readFileSync(file,'utf8').replaceAll('\r\n','\n'))
 const objects=db.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END,name").all()
 const settings=db.prepare('SELECT k,v FROM site_settings ORDER BY k').all()
 const quote=value=>"'"+value.replaceAll("'","''")+"'"
 const output='-- 尽欢空数据库初始化结构，截至迁移 0050。禁止用于已有生产库。\n-- 由 node scripts/schema-snapshot.mjs 生成；已有库只执行尚未应用的 migrations。\n\n'+objects.map(r=>r.sql+';').join('\n\n')+'\n\n'+settings.map(r=>`INSERT OR IGNORE INTO site_settings(k,v,updated_at) VALUES(${quote(r.k)},${quote(r.v)},strftime('%s','now'));`).join('\n')+'\n'
 if(process.argv.includes('--check'))assert.equal(readFileSync('schema.sql','utf8').replaceAll('\r\n','\n'),output,'schema.sql 与增量迁移不一致')
 else writeFileSync('schema.sql',output)
 console.log(JSON.stringify({schemaVersion:50,objects:objects.length,checked:process.argv.includes('--check')}))
}finally{db.close()}
