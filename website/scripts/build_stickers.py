"""把 @waline/emojis 里的平台表情整理到 public/stickers，并生成前后端清单。
用法：npm pack @waline/emojis@1.2.0 && tar xzf waline-emojis-1.2.0.tgz
      python scripts/build_stickers.py <解压出的 package 目录> [贴吧客户端表情目录]
第二个参数可选：百度贴吧客户端表情 image_emoticon{n}.png 所在目录，缺的会从贴吧官方 CDN 下载，
      用来补充贴吧表情（waline 只收了 54 个）
注意：表情图片版权归各平台所有，仅作站内表情使用。"""
import json, shutil, sys
from pathlib import Path

SRC = Path(sys.argv[1])
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'stickers'
# 本站前缀 -> (waline 目录, 显示名)
PACKS = {'bb': ('bilibili', 'B站'), 'bm': ('bmoji', 'B站小黄脸'), 'tieba': ('tieba', '贴吧'), 'weibo': ('weibo', '微博'),
         'qq': ('qq', 'QQ'), 'alu': ('alus', '阿鲁')}

# 贴吧客户端表情（编号），和 waline 已有的礼物/蛋糕/沙发这类物件重复的不收
TIEBA_CDN = 'https://tb2.bdstatic.com/tb/editor/images/client/image_emoticon{}.png'
TIEBA_SKIP = {34, 37, 38, 43, 44, 77, 78, 79, 80, 81, 82}
TIEBA_NUMS = [n for n in [*range(1, 51), *range(61, 102), *range(125, 138)] if n not in TIEBA_SKIP]
TIEBA_EXTRA = Path(sys.argv[2]) if len(sys.argv) > 2 else None


def tieba_extra():
    """返回 [(本站名, 文件)]；目录里没有的从 CDN 补下载"""
    if not TIEBA_EXTRA:
        return []
    import urllib.request
    TIEBA_EXTRA.mkdir(parents=True, exist_ok=True)
    out = []
    for n in TIEBA_NUMS:
        f = TIEBA_EXTRA / f'image_emoticon{n}.png'
        if not f.exists():
            try:
                with urllib.request.urlopen(TIEBA_CDN.format(n), timeout=15) as r:
                    f.write_bytes(r.read())
            except Exception as e:  # 个别编号下线了就跳过
                print('skip tieba', n, e)
                continue
        out.append((f'c{n}', f))
    return out


manifest = []
for key, (d, label) in PACKS.items():
    info = json.loads((SRC / d / 'info.json').read_text(encoding='utf-8'))
    dst = OUT / key
    dst.mkdir(parents=True, exist_ok=True)
    items = []
    for name in info['items']:
        f = SRC / d / f"{info['prefix']}{name}.{info['type']}"
        if not f.exists():
            continue
        shutil.copyfile(f, dst / f"{name}.{info['type']}")
        items.append(name)
    if key == 'tieba':
        for name, f in tieba_extra():
            shutil.copyfile(f, dst / f"{name}.png")
            items.append(name)
    manifest.append({'key': key, 'label': label, 'ext': info['type'], 'items': items})

# L站（linux.do）自定义表情：清单在 scripts/ld_catalog.json，图片缺的从 linux.do 的 CDN 补下载，放 public/stickers/ld
# 按前缀分成几个标签页，排在最前面；distorted_face 是回应用的瞪眼脸，只进白名单不单独成页
LD_TABS = [('bili', 'L站·B站'), ('tieba', 'L站·贴吧'), ('lark', 'L站·飞书'), ('xhs', 'L站·小红书')]
LD = OUT / 'ld'
LD.mkdir(parents=True, exist_ok=True)
ld_cat = [e for g in json.loads((ROOT / 'scripts' / 'ld_catalog.json').read_text(encoding='utf-8')).values()
          for e in g if '/images/emoji/' not in e['url']]
import urllib.request
for e in ld_cat:
    f = LD / f"{e['name']}.png"
    if not f.exists():
        try:
            with urllib.request.urlopen(e['url'], timeout=15) as r:
                f.write_bytes(r.read())
        except Exception as err:
            print('skip ld', e['name'], err)
have = {f.stem for f in LD.glob('*.png')}
ld_packs = [{'key': 'ld', 'tab': 'ld-' + p, 'label': label, 'ext': 'png',
             'items': [e['name'] for e in ld_cat if e['name'].startswith(p + '_') and e['name'] in have]} for p, label in LD_TABS]
ld_packs.append({'key': 'ld', 'tab': 'ld-misc', 'hidden': True, 'label': 'L站', 'ext': 'png', 'items': sorted({'distorted_face'} & have)})
manifest = ld_packs + manifest

(OUT / 'packs.json').write_text(json.dumps(manifest, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
tokens = sorted({f"{p['key']}:{n}" for p in manifest for n in p['items']})
(ROOT / 'src' / 'stickers.ts').write_text(
    '// 由 scripts/build_stickers.py 生成，勿手改\n'
    f"export const STICKER_EXT: Record<string, string> = {json.dumps({p['key']: p['ext'] for p in manifest})}\n"
    f"export const STICKERS = new Set<string>({json.dumps(tokens)})\n", encoding='utf-8', newline='\n')
print({p.get('tab', p['key']): len(p['items']) for p in manifest})
