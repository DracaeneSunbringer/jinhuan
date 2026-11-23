"""把 linux.do 帖子导出（xlsx）转成 D1 种子数据 seed.sql。

表格列：topic_title, post_raw, post_cooked, like_count, reply_count, url, post_id, created_at
一楼 = 一张梗图（多图楼层合成图集）。图片只记录 linux.do CDN 链接，不下载、不落自有存储。

用法：
  python scripts/import_xlsx.py ../往事已成风雨.xlsx --inspect
  python scripts/import_xlsx.py ../往事已成风雨.xlsx --author 你的linuxdo用户名
  npm run db:seed
"""
import argparse
import datetime as dt
import html
import json
import re
import sys
from collections import Counter
from pathlib import Path

import openpyxl

sys.stdout.reconfigure(encoding="utf-8")

LIGHTBOX_RE = re.compile(r'<a class="lightbox" href="([^"]+)"[^>]*>\s*<img ([^>]*)>', re.S)
IMG_RE = re.compile(r"<img ([^>]*)>")
ATTR_RE = re.compile(r'([\w-]+)="([^"]*)"')
TOPIC_RE = re.compile(r"(https://linux\.do/t/[^/]+/\d+)")


def attrs(tag: str) -> dict:
    return {k: html.unescape(v) for k, v in ATTR_RE.findall(tag)}


def extract_images(cooked: str):
    """从 cooked HTML 取出 [{u: 原图, t: 缩略图, w, h}]，跳过表情和头像。"""
    out, seen = [], set()
    for href, img in LIGHTBOX_RE.findall(cooked):
        a = attrs(img)
        out.append({"u": html.unescape(href), "t": a.get("src") or html.unescape(href),
                    "w": int(a["width"]) if a.get("width", "").isdigit() else None,
                    "h": int(a["height"]) if a.get("height", "").isdigit() else None})
        seen.add(a.get("src"))
    for img in IMG_RE.findall(cooked):
        a = attrs(img)
        src = a.get("src", "")
        if src in seen or "emoji" in a.get("class", "") or "avatar" in a.get("class", "") or "/images/emoji/" in src:
            continue
        if "/original/" not in src and "/optimized/" not in src and "/uploads/" not in src:
            continue
        seen.add(src)
        out.append({"u": src, "t": src,
                    "w": int(a["width"]) if a.get("width", "").isdigit() else None,
                    "h": int(a["height"]) if a.get("height", "").isdigit() else None})
    # 去重（同一张图 original/optimized 只留一份）
    uniq, keys = [], set()
    for x in out:
        if x["u"] not in keys:
            keys.add(x["u"])
            uniq.append(x)
    return uniq


def clean_text(raw: str) -> str:
    """保留文字、[details] 折叠和文字 [spoiler]，去掉图片、投票、排版标签。"""
    s = raw or ""
    s = re.sub(r"\[poll[^\]]*\].*?\[/poll\]", "", s, flags=re.S)
    s = re.sub(r"\[quote[^\]]*\].*?\[/quote\]", "", s, flags=re.S)
    s = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", s)
    s = re.sub(r"\[/?grid\]", "", s)
    s = re.sub(r"\[spoiler\]\s*\[/spoiler\]", "", s)           # 只包了图片的 spoiler
    s = re.sub(r"\[details=\"[^\"]*\"\]\s*\[/details\]", "", s)  # 只包了图片的 details
    s = re.sub(r"<[^>]+>", "", s)
    s = re.sub(r"[ \t]+\n", "\n", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def split_title(text: str):
    """单行短文字当标题；否则标题留空、全部当正文。"""
    plain = re.sub(r"\[details=\"[^\"]*\"\].*?\[/details\]", "", text, flags=re.S).strip()
    if plain and "\n" not in plain and len(plain) <= 40 and "[" not in plain:
        rest = text.replace(plain, "", 1).strip()
        return plain, rest
    return "", text


def series_tag(topic: str) -> str:
    m = re.match(r"【([^】]+)】", topic or "")
    label = m.group(1) if m else (topic or "")[:8]
    return {"梗图": "梗图合集"}.get(label, label)[:12]


def to_ts(v) -> int:
    if isinstance(v, dt.datetime):
        return int(v.replace(tzinfo=v.tzinfo or dt.timezone.utc).timestamp())
    return int(dt.datetime.fromisoformat(str(v).replace("Z", "+00:00")).timestamp())


def q(v):
    if v is None:
        return "NULL"
    if isinstance(v, (int, float)):
        return str(int(v))
    return "'" + str(v).replace("'", "''") + "'"


def load(path):
    wb = openpyxl.load_workbook(path, read_only=True)
    rows = wb.active.iter_rows(values_only=True)
    header = [str(h or "").strip() for h in next(rows)]
    need = ["topic_title", "post_raw", "post_cooked", "like_count", "url", "post_id", "created_at"]
    missing = [k for k in need if k not in header]
    if missing:
        sys.exit(f"表头缺少列：{missing}，实际表头：{header}")
    idx = {k: header.index(k) for k in header}
    for r in rows:
        if r and any(r):
            yield {k: r[i] if i < len(r) else None for k, i in idx.items()}


def build(path):
    items, skipped = [], Counter()
    for r in load(path):
        cooked = r.get("post_cooked") or ""
        images = extract_images(cooked)
        if not images:
            skipped["纯文字楼层"] += 1
            continue
        text = clean_text(r.get("post_raw") or "")
        title, content = split_title(text)
        url = r.get("url") or ""
        m = TOPIC_RE.match(url)
        items.append({
            "post_id": int(r["post_id"]),
            "title": title[:80],
            "content": content[:2000],
            "images": images,
            "spoiler": 1 if 'class="spoiler' in cooked else 0,
            "series": (r.get("topic_title") or "").strip(),
            "tag": series_tag(r.get("topic_title") or ""),
            "source": url,
            "topic": m.group(1) if m else None,
            "likes": int(r.get("like_count") or 0),
            "created": to_ts(r["created_at"]),
        })
    return items, skipped


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xlsx")
    ap.add_argument("-o", "--out", default=str(Path(__file__).resolve().parent.parent / "seed.sql"))
    ap.add_argument("--inspect", action="store_true", help="只打印统计和样例")
    ap.add_argument("--author", help="这些帖子作者的 linux.do 用户名")
    args = ap.parse_args()

    items, skipped = build(args.xlsx)
    if args.inspect:
        print(f"可导入 {len(items)} 楼，共 {sum(len(x['images']) for x in items)} 张图；跳过 {dict(skipped)}")
        print("图集楼层", sum(1 for x in items if len(x["images"]) > 1), "· 慎点楼层", sum(x["spoiler"] for x in items),
              "· 有标题", sum(1 for x in items if x["title"]), "· 有正文", sum(1 for x in items if x["content"]))
        print("标签", Counter(x["tag"] for x in items).most_common())
        for x in items[:6]:
            print(" →", json.dumps({**x, "images": x["images"][:1]}, ensure_ascii=False)[:400])
        return

    lines = ["-- 由 scripts/import_xlsx.py 生成，可重复执行"]
    for x in items:
        cover = x["images"][0]
        gallery = json.dumps(x["images"], ensure_ascii=False, separators=(",", ":")) if len(x["images"]) > 1 else None
        lines.append(
            "INSERT INTO memes (ld_post_id, title, content, image_url, thumb_url, width, height, gallery, spoiler, series, "
            "source_url, ld_likes, author_name, created_at) VALUES ("
            + ", ".join(q(v) for v in [x["post_id"], x["title"], x["content"], cover["u"], cover["t"], cover["w"], cover["h"],
                                        gallery, x["spoiler"], x["series"], x["source"], x["likes"], args.author, x["created"]])
            + ") ON CONFLICT(ld_post_id) DO UPDATE SET title = excluded.title, content = excluded.content, "
              "image_url = excluded.image_url, thumb_url = excluded.thumb_url, width = excluded.width, height = excluded.height, "
              "gallery = excluded.gallery, spoiler = excluded.spoiler, series = excluded.series, source_url = excluded.source_url, "
              "ld_likes = excluded.ld_likes, author_name = COALESCE(excluded.author_name, memes.author_name);"
        )
        lines.append(f"INSERT OR IGNORE INTO meme_tags SELECT id, {q(x['tag'])} FROM memes WHERE ld_post_id = {x['post_id']};")
    if args.author:
        lines.append(f"UPDATE memes SET author_id = (SELECT id FROM users WHERE username = {q(args.author)} COLLATE NOCASE) "
                     f"WHERE author_id IS NULL AND author_name = {q(args.author)};")
    Path(args.out).write_text("\n".join(lines) + "\n", encoding="utf-8")
    size = Path(args.out).stat().st_size / 1024 / 1024
    print(f"已生成 {args.out}：{len(items)} 条梗图，{size:.1f} MB")
    if not args.author:
        print("提示：没有指定 --author，这些图会显示为「佚名」，也没人能给它们挂谜题（管理员除外）")


if __name__ == "__main__":
    main()
