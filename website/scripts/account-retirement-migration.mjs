// 固定0025生成器；新增表/列请新建增量迁移，不修改已部署0025。
import {writeFileSync,readFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const references={
 ai_jobs:['user_id'],anchors:['user_id'],api_tokens:['user_id'],auth_tokens:['user_id'],badge_log:['user_id'],chat_bans:['user_id'],chat_boosts:['user_id'],chat_groups:['created_by'],chat_join_reqs:['user_id'],chat_members:['user_id'],chat_messages:['user_id'],chat_reactions:['user_id'],chat_redpack_external_views:['user_id'],chat_redpack_opens:['user_id'],chat_redpack_successes:['user_id'],comments:['user_id'],fav_folders:['user_id'],favorites:['user_id'],identities:['user_id'],invite_codes:['owner_id','used_by'],invites:['invitee_id','inviter_id'],likes:['user_id'],login_fails:['user_id'],memes:['author_id'],notif_reads:['user_id','actor_id'],official_title_log:['user_id','actor_id'],passwords:['user_id'],puzzle_attempts:['user_id'],puzzle_codes:['claimed_by'],puzzles:['creator_id'],quota_usage:['key'],reactions:['user_id'],road_comments:['user_id'],road_items:['user_id'],road_votes:['user_id'],sessions:['user_id'],short_replies:['user_id'],uploads:['user_id'],user_badges:['user_id'],user_limits:['user_id','by_id'],user_official_titles:['user_id','granted_by'],user_unlocks:['user_id'],users:['id','invited_by'],view_days:['user_id'],views:['user_id'],
}
let sql=`-- 0025：仅封锁已合并账号ID，不修改旧用户/历史引用，不删除对象存储。
-- node scripts/account-retirement-migration.mjs --check 验证固定生成结果。
CREATE TABLE account_retirements (
 source_id INTEGER PRIMARY KEY CHECK(source_id<>0),
 target_id INTEGER NOT NULL CHECK(target_id<>0 AND target_id<>source_id),
 retired_at INTEGER NOT NULL
);
CREATE TRIGGER trg_retirement_claim BEFORE INSERT ON account_retirements
WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.source_id)
 OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.source_id AND disabled=2 AND kind='user')
 OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.target_id AND disabled=0 AND kind='user')
BEGIN SELECT RAISE(ABORT,'retirement_invalid'); END;
CREATE TRIGGER trg_retirement_update BEFORE UPDATE ON account_retirements
BEGIN SELECT RAISE(ABORT,'retirement_immutable'); END;
CREATE TRIGGER trg_retirement_delete BEFORE DELETE ON account_retirements
BEGIN SELECT RAISE(ABORT,'retirement_immutable'); END;
`
for(const [table,columns] of Object.entries(references)){
 const check=columns.map(column=>`EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.${column})`).join(' OR ')
 // key=0是全站统计；tok:*的key是API令牌id，不是用户id。
 const gate=table==='quota_usage'?`NEW.key<>0 AND NEW.scope NOT GLOB 'tok:*' AND (${check})`:`(${check})`
 for(const [suffix,event] of [['ins','INSERT'],['upd',`UPDATE OF ${[...columns,...(table==='quota_usage'?['scope']:[])].join(',')}`]])sql+=`\nCREATE TRIGGER trg_retired_${table}_${suffix} BEFORE ${event} ON ${table}\nWHEN ${gate}\nBEGIN SELECT RAISE(ABORT,'account_retired'); END;\n`
}
const file='migrations/0025_account_retirements.sql'
if(process.argv.includes('--check'))assert.equal(readFileSync(file,'utf8').replaceAll('\r\n','\n'),sql)
else writeFileSync(file,sql)
console.log(JSON.stringify({migration:25,tables:Object.keys(references).length,triggers:Object.keys(references).length*2+3}))
