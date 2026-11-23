# 本地演示数据：造一批假用户，给最新的梗图灌喜欢 / 表情 / 一句回应 / 评论，看互动多了之后的浏览效果
# 用法：python scripts/seed_demo.py > .build/demo.sql && npx wrangler d1 execute meme-hall --local --file .build/demo.sql
# 清理：python scripts/seed_demo.py --clean > .build/demo.sql，再执行同一条 wrangler 命令
# 假用户 ID 从 900001 开始，只用于本地，不要在线上库执行
import random
import sys
import time

BASE = 900001
N_USERS = 60
N_MEMES = 40
FIRST_MEME = 6907  # 最新一张的 id，往前取 N_MEMES 张

NAMES = ['阿白', '摸鱼王', '秃头程序员', '今天不加班', '佬友甲', '咸鱼翻身', '吃瓜群众', '夜猫子', '赛博打工人', '无情搬砖机',
         '猫猫教主', '抽象大师', '周五快乐', '奶茶续命', '键盘侠客', '早八人', '头发还剩三根', '芝士雪豹', '电子榨菜', '赶ddl中',
         'bug制造者', '潜水员', '点赞机器', '深夜emo', '退堂鼓一级', '干饭人', '打工魂', '梗百科', '今天也很困', '云养猫',
         '接盘侠', '反向摸鱼', '路过的', '老六', '显眼包', '松弛感', '人间清醒', '卷不动了', '精神状态良好', '互联网嘴替',
         '周一综合征', '显卡在燃烧', '404', '沉默是金', '开摆', '蹲一个', '好家伙', '绷不住了', '急急急', '小丑竟是我',
         '冲浪达人', '啊对对对', '学不动了', '尊嘟假嘟', '栓Q', '破防了', '我不理解', '笑不活了', '已读乱回', '上班如上坟']

REPLIES = ['这就是现在的我', '笑死[bb:doge]', '太真实了', '绷不住了', '哈哈哈哈哈哈', '[tieba:antic]', '说的就是我',
           '已转发给同事', '有被冒犯到', '救命好好笑', '懂的都懂', '典', '蚌埠住了', '周一的我', '我直接笑出声[weibo:doge]',
           '好家伙', '存了存了', '经典永流传', '看一次笑一次', '这图有毒', '老板别看', '真实得可怕', '笑出鹅叫',
           '[qq:working][qq:working]', '破防了家人们', '懂了但没完全懂', '下班路上看到笑死', '6', '妙啊', '我悟了']

EMOJIS = ['😂', '🤣', 'tieba:antic', 'weibo:doge', 'bb:tiaokan', '😭', 'tieba:huge_sweat', 'qq:working',
          'qq:hair_loss', '👍', '🔥', '🤔', '👀', '🤝']

COMMENTS = ['这张我能笑一年', '出处在哪，想看原图', '收藏了，明天发群里', '哈哈哈哈楼主太懂了 [bb:doge]',
            '第一反应是我同事', '每次看到都绷不住', '求更多这个系列的', '我妈问我为什么半夜笑出声']

uids = list(range(BASE, BASE + N_USERS))
ids = list(range(FIRST_MEME, FIRST_MEME - N_MEMES, -1))
lo = f'{BASE} AND {BASE + N_USERS - 1}'
where_ids = ','.join(map(str, ids))

out = []
out.append(f'DELETE FROM likes WHERE user_id BETWEEN {lo};')
out.append(f'DELETE FROM reactions WHERE user_id BETWEEN {lo};')
out.append(f'DELETE FROM short_replies WHERE user_id BETWEEN {lo};')
out.append(f'DELETE FROM comments WHERE user_id BETWEEN {lo};')
out.append(f'DELETE FROM users WHERE id BETWEEN {lo};')

if '--clean' not in sys.argv:
    random.seed(52)
    now = int(time.time())
    q = lambda s: "'" + s.replace("'", "''") + "'"
    for i, uid in enumerate(uids):
        out.append(f"INSERT INTO users VALUES ({uid},'demo{i + 1}',{q(NAMES[i % len(NAMES)])},NULL,{random.randint(0, 3)},0,0,{now},{now});")

    rows = {'likes': [], 'reactions': [], 'short_replies': [], 'comments': []}
    for rank, mid in enumerate(ids):
        # 热度分层：前几张爆款，中间一般，少数冷门
        heat = 1.0 if rank < 4 else 0.5 if rank < 15 else 0.2 if rank < 32 else 0.0
        if heat == 0:
            continue
        crowd = random.sample(uids, int(N_USERS * heat))
        # 回应用偏态分布，保证有几句被很多人同感
        weights = [1 / (k + 1) ** 0.9 for k in range(len(REPLIES))]
        pool = random.sample(REPLIES, len(REPLIES))
        for uid in crowd:
            t = now - random.randint(60, 86400 * 3)
            if random.random() < 0.7:
                rows['likes'].append(f'({uid},{mid},{t})')
            for e in random.sample(EMOJIS, random.choice([0, 1, 1, 2, 3])):
                rows['reactions'].append(f'({mid},{uid},{q(e)},{t})')
            if random.random() < 0.85:
                rows['short_replies'].append(f'({mid},{uid},{q(random.choices(pool, weights)[0])},{t})')
            if random.random() < 0.12:
                rows['comments'].append(f'({mid},{uid},{q(random.choice(COMMENTS))},0,{t})')

    cols = {'likes': '(user_id,meme_id,created_at)', 'reactions': '(meme_id,user_id,emoji,created_at)',
            'short_replies': '(meme_id,user_id,text,created_at)', 'comments': '(meme_id,user_id,body,deleted,created_at)'}
    for table, vals in rows.items():
        for k in range(0, len(vals), 200):
            out.append(f'INSERT OR IGNORE INTO {table} {cols[table]} VALUES {",".join(vals[k:k + 200])};')

out.append(
    'UPDATE memes SET '
    'like_count = (SELECT COUNT(*) FROM likes WHERE meme_id = memes.id), '
    'reaction_count = (SELECT COUNT(*) FROM reactions WHERE meme_id = memes.id), '
    'reply_count = (SELECT COUNT(*) FROM short_replies WHERE meme_id = memes.id), '
    'comment_count = (SELECT COUNT(*) FROM comments WHERE meme_id = memes.id AND deleted = 0) '
    f'WHERE id IN ({where_ids});')

sys.stdout.reconfigure(encoding='utf-8')
print('\n'.join(out))
