#!/usr/bin/env bash
# 本地端到端测试：造两个测试账号，走一遍回应 / 评论 / 出题 / 解密 / 码池 / 权限
# 用法：先 npm run dev，再另开终端执行 bash scripts/e2e_local.sh
set -u
cd "$(dirname "$0")/.."
B=http://127.0.0.1:8787
H1=$(printf 'sid-52d' | sha256sum | cut -d' ' -f1)
H2=$(printf 'sid-tester' | sha256sum | cut -d' ' -f1)
T=$(date +%s)

# 注意：Windows 上 npx 走 .cmd，多行参数会在换行处被截断，SQL 必须写成一行
sql() { npx wrangler d1 execute meme-hall --local --command "$1" >/dev/null 2>&1 || echo "  !! SQL 执行失败：$1"; }
sql "INSERT OR REPLACE INTO users VALUES (1001,'52D','52D',NULL,2,0,1,$T,$T),(1002,'tester','测试佬',NULL,1,0,0,$T,$T); INSERT OR REPLACE INTO sessions VALUES ('$H1',1001,$((T+86400))),('$H2',1002,$((T+86400))); UPDATE memes SET author_id=1001 WHERE author_name='52D'; DELETE FROM puzzles WHERE meme_id IN (1,2); DELETE FROM puzzle_attempts; DELETE FROM puzzle_codes;"

A() { curl -s --noproxy '*' -b 'sid=sid-52d' -H 'content-type: application/json' "$@"; }
U() { curl -s --noproxy '*' -b 'sid=sid-tester' -H 'content-type: application/json' "$@"; }
N() { curl -s --noproxy '*' -H 'content-type: application/json' "$@"; }
# Windows 下命令行参数会按 GBK 传，中文请求体一律经 UTF-8 文件发送
body() { printf "%s" "$1" > /tmp/e2e_body.json; echo @/tmp/e2e_body.json; }
pass=0; failn=0
check() { if echo "$2" | grep -q -- "$3"; then echo "  ✓ $1"; pass=$((pass+1)); else echo "  ✗ $1 → $2"; failn=$((failn+1)); fi; }
ok() { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ $1 → $2"; failn=$((failn+1)); }

echo "== 登录态"
check "52D 已登录且是管理员" "$(A $B/api/me)" '"is_admin":true'
check "未登录" "$(N $B/api/me)" '"user":null'

echo "== 表情"
check "未登录回应被拒" "$(N -X POST $B/api/memes/1/reactions --data-binary "$(body '{"emoji":"😂"}')")" '请先登录'
check "tester 回应 😂" "$(U -X POST $B/api/memes/1/reactions --data-binary "$(body '{"emoji":"😂"}')")" '"emoji":"😂","count":1,"mine":true'
R=$(U -X POST $B/api/memes/1/reactions --data-binary "$(body '{"emoji":"😂"}')")
if echo "$R" | grep -q '"reactions":\[' && ! echo "$R" | grep -q '"emoji":"😂"'; then ok "再点一次取消"; else bad "再点一次取消" "$R"; fi
U -X POST $B/api/memes/1/reactions --data-binary "$(body '{"emoji":"🔥"}')" >/dev/null
check "平台表情可用" "$(U -X POST $B/api/memes/1/reactions --data-binary "$(body '{"emoji":"tieba:antic"}')")" '"emoji":"tieba:antic","count":1,"mine":true'
check "扩充的表情可用" "$(U -X POST $B/api/memes/1/reactions --data-binary "$(body '{"emoji":"bm:doge"}')")" '"emoji":"bm:doge","count":1,"mine":true'
check "非法表情被拒" "$(U -X POST $B/api/memes/1/reactions --data-binary "$(body '{"emoji":"好"}')")" '不支持'
check "伪造平台表情被拒" "$(U -X POST $B/api/memes/1/reactions --data-binary "$(body '{"emoji":"bm:nope_xx"}')")" '不支持'
for e in 😭 👍 🤔; do U -X POST $B/api/memes/1/reactions --data-binary "$(body "{\"emoji\":\"$e\"}")" >/dev/null; done
check "每图最多 5 个表情" "$(U -X POST $B/api/memes/1/reactions --data-binary "$(body '{"emoji":"👀"}')")" '最多点 5 个'
check "详情里有我的回应" "$(U $B/api/memes/1)" '"emoji":"🔥","count":1,"mine":true'

echo "== 喜欢"
check "喜欢" "$(U -X POST $B/api/memes/1/like)" '"liked":true'
check "列表里带喜欢数" "$(U "$B/api/memes?sort=old")" '"like_count":1'
check "取消喜欢" "$(U -X POST $B/api/memes/1/like)" '"liked":false'
U -X POST $B/api/memes/1/like >/dev/null

echo "== 一句回应"
check "超过 12 字被拒" "$(U -X PUT $B/api/memes/1/reply --data-binary "$(body '{"text":"一二三四五六七八九十一二三"}')")" '最多 12'
check "带链接被拒" "$(U -X PUT $B/api/memes/1/reply --data-binary "$(body '{"text":"看 x.com"}')")" '不能带链接'
check "tester 回应（表情算 1 字）" "$(U -X PUT $B/api/memes/1/reply --data-binary "$(body '{"text":"这就是现在的我[bb:doge]"}')")" '"my_reply":"这就是现在的我\[bb:doge\]"'
check "2 秒内再改被限" "$(U -X PUT $B/api/memes/1/reply --data-binary "$(body '{"text":"改一下"}')")" '手速太快'
check "52D 同感后合并计数" "$(A -X PUT $B/api/memes/1/reply --data-binary "$(body '{"text":"这就是现在的我[bb:doge]"}')")" '"count":2,"mine":true'
check "列表带回应种类数" "$(N "$B/api/memes?sort=old")" '"reply_kinds":1'
sleep 2
check "撤回回应" "$(A -X DELETE $B/api/memes/1/reply)" '"my_reply":null'
check "非作者不能删别人的话" "$(U -X DELETE "$B/api/memes/2/replies?text=x")" '没有权限'

echo "== 收藏"
check "默认收藏夹" "$(U $B/api/folders)" '稍后再看'
F2=$(U $B/api/folders | grep -o '"id":[0-9]*,"name":"表情备用"' | grep -o '[0-9]*' | head -1)
check "一键收藏进第一个" "$(U -X POST $B/api/memes/1/fav)" '"fav_folders":\['
check "再收进另一个" "$(U -X POST $B/api/memes/1/fav --data-binary "{\"folder_id\":$F2}")" ",$F2\]"
check "新建收藏夹" "$(U -X POST $B/api/folders --data-binary "$(body '{"name":"猫猫"}')")" '猫猫'
check "重名被拒" "$(U -X POST $B/api/folders --data-binary "$(body '{"name":"猫猫"}')")" '同名'
check "别人的收藏夹不能用" "$(A -X POST $B/api/memes/2/fav --data-binary "{\"folder_id\":$F2}")" '收藏夹不存在'

echo "== 看过 & 我的"
check "未看数" "$(U "$B/api/memes")" '"unseen_total":6907'
curl -s --noproxy '*' -b 'sid=sid-tester' -H 'content-type: text/plain' -X POST $B/api/views --data-binary '{"ids":[1,2,3]}' >/dev/null
check "上报看过后未看数减少" "$(U "$B/api/memes")" '"unseen_total":6904'
check "只看未看过滤" "$(U "$B/api/memes?sort=old&unseen=1" | grep -o '"id":[0-9]*' | head -1)" '"id":4'
check "游客未看数为空" "$(N "$B/api/memes")" '"unseen_total":null'
check "我的统计" "$(U $B/api/me/stats)" '"fav":1,"like":1,"reply":6,"comment":0,"post":0,"seen":3'
check "我的收藏" "$(U "$B/api/me/items?tab=fav")" '"kind":"fav"'
check "我的回应含短句和表情" "$(U "$B/api/me/items?tab=reply")" '"kind":"reply","val":"这就是现在的我'
check "按收藏夹筛选" "$(U "$B/api/me/items?tab=fav&folder=$F2")" '"total":1'
check "删收藏夹后计数重算" "$(U -X DELETE $B/api/folders/$F2)" '"folders"'
check "图集" "$(N $B/api/series)" '"covers":\[{"src"'

echo "== 评论"
C=$(U -X POST $B/api/memes/1/comments --data-binary "$(body '{"body":"哈哈哈 :sob: https://linux.do"}')")
check "tester 发评论" "$C" '"can_delete":true'
CID=$(echo "$C" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
check "5 秒内连发被限流" "$(U -X POST $B/api/memes/1/comments --data-binary "$(body '{"body":"再来"}')")" '慢一点'
check "评论列表" "$(N $B/api/memes/1/comments)" '哈哈哈'
check "跨站请求被拒" "$(U -X POST -H 'origin: https://evil.com' $B/api/memes/1/comments --data-binary "$(body '{"body":"x"}')")" '非法来源'
check "管理员可删他人评论" "$(A -X DELETE $B/api/comments/$CID)" '"ok":true'

echo "== 解密：文字口令"
check "非作者不能出题" "$(U -X POST $B/api/memes/1/puzzle --data-binary "$(body '{"answer":"x","reward_kind":"secret","reward_type":"text","reward_text":"y"}')")" '只有发图者'
P=$(A -X POST $B/api/memes/1/puzzle --data-binary "$(body '{"answer":"老 资 历","hint":"看的懂的都是？","reward_kind":"credit","reward_type":"text","reward_text":"红包口令：佬友万岁","max_attempts":3,"min_trust_level":1}')")
check "52D 出题" "$P" '"id"'
PID=$(echo "$P" | grep -o '[0-9]*')
check "重复出题被拒" "$(A -X POST $B/api/memes/1/puzzle --data-binary "$(body '{"answer":"x","reward_kind":"secret","reward_type":"text","reward_text":"y"}')")" '已经有谜题'
check "未解时看不到奖励" "$(U $B/api/memes/1)" '"reward":null'
check "出题人能看到奖励" "$(A $B/api/memes/1)" '佬友万岁'
check "出题人不能自己解" "$(A -X POST $B/api/puzzles/$PID/solve --data-binary "$(body '{"answer":"老资历"}')")" '不能解自己'
check "答错" "$(U -X POST $B/api/puzzles/$PID/solve --data-binary "$(body '{"answer":"新人"}')")" '"attempts_left":2'
check "答对（忽略大小写空格全角）" "$(U -X POST $B/api/puzzles/$PID/solve --data-binary "$(body '{"answer":"老资历"}')")" '佬友万岁'
check "解开后详情可见奖励" "$(U $B/api/memes/1)" '"solved":true'
check "解密大厅列出" "$(N $B/api/puzzles)" '"reward_kind":"credit"'

echo "== 解密：码池 + 信任等级"
P2=$(A -X POST $B/api/memes/2/puzzle --data-binary "$(body '{"answer":"abc","reward_kind":"cdk","reward_type":"codes","codes":"CODE-1\nCODE-2","min_trust_level":2,"max_attempts":2}')")
PID2=$(echo "$P2" | grep -o '[0-9]*')
check "码池出题" "$P2" '"id"'
check "TL 不够被拒" "$(U -X POST $B/api/puzzles/$PID2/solve --data-binary "$(body '{"answer":"abc"}')")" '信任等级'
sql "UPDATE users SET trust_level=2 WHERE id=1002"
check "TL 够了，答对领到一个码" "$(U -X POST $B/api/puzzles/$PID2/solve --data-binary "$(body '{"answer":"ABC"}')")" '"reward":"CODE-1"'
check "重复提交不会再领" "$(U -X POST $B/api/puzzles/$PID2/solve --data-binary "$(body '{"answer":"abc"}')")" '"reward":"CODE-1"'
check "剩余码数" "$(U $B/api/memes/2)" '"codes_left":1'

echo "== 按天 & 锚点"
DAYS=$(A "$B/api/days")
check "日期目录" "$DAYS" '"day":"20'
D1=$(echo "$DAYS" | grep -o '"day":"[0-9-]*"' | head -1 | cut -d'"' -f4)
check "按天取图" "$(A "$B/api/memes?day=$D1&limit=3")" '"offset":0'
check "跨天定位 focus" "$(A "$B/api/memes?focus=1&sort=old&limit=2")" '"id":1,'
check "未登录不能放锚点" "$(N -X PUT $B/api/anchors/1 --data-binary "$(body '{"note":"x"}')")" '请先登录'
check "放锚点" "$(U -X PUT $B/api/anchors/1 --data-binary "$(body '{"note":"测试锚"}')")" '"note":"测试锚"'
check "锚点列表" "$(U $B/api/anchors)" '"id":1,'
check "删锚点" "$(U -X DELETE $B/api/anchors/1)" '"anchors":\[\]'
check "敏感标记字段" "$(A "$B/api/memes?limit=1")" '"sensitive":'

echo "== 发图"
printf '\x89PNG\r\n\x1a\n0000000000000000' > /tmp/t.png
M=$(curl -s --noproxy '*' -b 'sid=sid-tester' -F file=@/tmp/t.png -F title=测试图 -F tags='测试 本地' -F spoiler=1 $B/api/memes)
check "tester 上传图片" "$M" '"id"'
MID=$(echo "$M" | grep -o '[0-9]*')
check "新图可读" "$(N $B/api/memes/$MID)" '"image":"/img/m/'
IMG=$(N $B/api/memes/$MID | grep -o '/img/m/[^"]*')
check "R2 图片可取" "$(curl -s --noproxy '*' -o /dev/null -w '%{http_code} %{content_type}' $B$IMG)" '200 image/png'
printf 'not an image' > /tmp/t.txt
check "非图片被拒" "$(curl -s --noproxy '*' -b 'sid=sid-tester' -F file=@/tmp/t.txt $B/api/memes)" '只支持'
check "他人不能删" "$(U -X DELETE $B/api/memes/1)" '没有权限'
check "作者可删" "$(U -X DELETE $B/api/memes/$MID)" '"ok":true'
check "删后 404" "$(N $B/api/memes/$MID)" '不存在'

echo "== 性能字段"
check "热门排序走 hot 列" "$(N "$B/api/memes?sort=hot&limit=1")" '"id"'
check "只看 NSFW" "$(N "$B/api/memes?nsfw=only&limit=1")" '"sensitive":true'
check "隐藏 NSFW 后日期目录变少" "$(N "$B/api/days?nsfw=0" | grep -o '"n":[0-9]*' | cut -d: -f2 | awk '{s+=$1} END {print s}')" '^6[0-9][0-9][0-9]$'

echo "== 群聊"
check "游客没有群" "$(N $B/api/chat/groups)" '"groups":\[\]'
check "tester 自动在迷友群" "$(U $B/api/chat/groups)" '"name":"迷友","is_default":true'
check "游客不能看消息" "$(N $B/api/chat/groups/1/messages)" '请先登录'
CM=$(U -X POST $B/api/chat/groups/1/messages --data-binary "$(body '{"body":"群里第一句"}')")
check "tester 发消息" "$CM" '"body":"群里第一句"'
CMID=$(echo "$CM" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
check "1 秒内连发被限" "$(U -X POST $B/api/chat/groups/1/messages --data-binary "$(body '{"body":"再来"}')")" '慢一点'
check "52D 回复并带引用" "$(A -X POST $B/api/chat/groups/1/messages --data-binary "$(body "{\"body\":\"收到\",\"reply_to\":$CMID}")")" "\"reply_to\":{\"id\":$CMID"
check "表情回应" "$(A -X POST $B/api/chat/messages/$CMID/reactions --data-binary "$(body '{"emoji":"👍"}')")" '"emoji":"👍","count":1,"mine":true'
check "轮询拿到表情变化" "$(U "$B/api/chat/groups/1/messages?after=$CMID&since=$((T-5))")" '"changed":\[{"id":'"$CMID"
check "普通人不能建群" "$(U -X POST $B/api/chat/groups --data-binary "$(body '{"name":"私群"}')")" '只有管理员'
G=$(A -X POST $B/api/chat/groups --data-binary "$(body '{"name":"测试小群","members":["nobody_xx"]}')")
check "管理员建群（没找到的人会列出）" "$G" '"missing":\["nobody_xx"\]'
GID=$(echo "$G" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
check "不在群里不能看" "$(U $B/api/chat/groups/$GID/messages)" '不在这个群'
check "普通人不能拉人" "$(U -X POST $B/api/chat/groups/$GID/members --data-binary "$(body '{"usernames":["tester"]}')")" '只有管理员'
check "管理员拉人" "$(A -X POST $B/api/chat/groups/$GID/members --data-binary "$(body '{"usernames":["tester"]}')")" '"added":1'
check "拉进来后能发言" "$(U -X POST $B/api/chat/groups/$GID/messages --data-binary "$(body '{"body":"进来了"}')")" '"floor":1'
printf '\x89PNG\r\n\x1a\n0000000000000000' > /tmp/c.png
check "群里发图" "$(curl -s --noproxy '*' -b 'sid=sid-52d' -F file=@/tmp/c.png -F body=看图 $B/api/chat/groups/$GID/messages)" '"image":"/img/c/'
check "默认群不能解散" "$(A -X DELETE $B/api/chat/groups/1)" '不能解散'
check "别人不能撤回我的消息" "$(U -X DELETE $B/api/chat/messages/$((CMID+1)))" '没有权限'
check "撤回自己的消息" "$(U -X DELETE $B/api/chat/messages/$CMID)" '"ok":true'
check "撤回后显示已撤回" "$(U "$B/api/chat/groups/1/messages")" '"deleted":true,"body":""'
check "解散群" "$(A -X DELETE $B/api/chat/groups/$GID)" '"ok":true'

# 清理测试数据
sql "DELETE FROM chat_reactions; DELETE FROM chat_messages WHERE user_id IN (1001,1002); DELETE FROM chat_members WHERE user_id IN (1001,1002); DELETE FROM chat_groups WHERE is_default = 0;"
sql "DELETE FROM puzzles; DELETE FROM puzzle_attempts; DELETE FROM puzzle_codes; DELETE FROM reactions; DELETE FROM comments; DELETE FROM likes; DELETE FROM short_replies; DELETE FROM favorites; DELETE FROM fav_folders; DELETE FROM views; DELETE FROM view_days; DELETE FROM stats_cache; DELETE FROM anchors; UPDATE memes SET like_count=0, reaction_count=0, reply_count=0, comment_count=0, fav_count=0, author_id=NULL; DELETE FROM meme_tags WHERE meme_id IN (SELECT id FROM memes WHERE image_key IS NOT NULL); DELETE FROM memes WHERE image_key IS NOT NULL; DELETE FROM sessions; DELETE FROM users;"
echo "== 通过 $pass，失败 $failn"
