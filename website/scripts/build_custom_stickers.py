"""自建表情包（奶龙这类热梗）：把图片放进 stickers-src/<包名>/，跑一下就进表情面板。
用法：python scripts/build_custom_stickers.py
- 包名就是文件夹名，只能用小写字母（例如 nailong），不能和已有的 bb/bm/tieba/weibo/qq/alu/ld 重名
- 文件夹里放一个 _label.txt 写显示名（例如「奶龙」），没有就用文件夹名
- 支持 png / gif / webp（动图照样动）；文件名会整理成 包名_001 这样的编号，按文件名排序
- 跑完重新部署即可；再跑一次会按文件夹现状整包重建（删掉的图也会从清单里去掉）
注意：图片版权归原作者，仅作站内表情使用。"""
import json, re, shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'stickers-src'
OUT = ROOT / 'public' / 'stickers'
BUILTIN = {'bb', 'bm', 'tieba', 'weibo', 'qq', 'alu', 'ld', 'nga'}

manifest = [p for p in json.loads((OUT / 'packs.json').read_text(encoding='utf-8')) if not p.get('custom')]
custom = []
for d in sorted(p for p in SRC.iterdir() if p.is_dir()) if SRC.exists() else []:
    key = d.name
    if not re.fullmatch(r'[a-z]+', key) or key in BUILTIN:
        print('跳过（包名只能小写字母、不能和内置包重名）:', key)
        continue
    files = sorted(f for f in d.iterdir() if f.suffix.lower() in ('.png', '.gif', '.webp'))
    if not files:
        continue
    label_f = d / '_label.txt'
    label = label_f.read_text(encoding='utf-8').strip() if label_f.exists() else key
    if key == 'muscle':
        label = '💗'
    dst = OUT / key
    if dst.exists():
        shutil.rmtree(dst)
    dst.mkdir(parents=True)
    items = []
    for i, f in enumerate(files, 1):
        name = f'{key}_{i:03d}'
        shutil.copyfile(f, dst / (name + f.suffix.lower()))
        items.append(name)
    format_counts = {ext: sum(f.suffix.lower() == ext for f in files) for ext in ('.png', '.gif', '.webp')}
    # ext 是这一包的主格式；混着放时前端加载失败会自动换另一种后缀再试
    ext = max(format_counts, key=format_counts.get)[1:]
    custom.append({'key': key, 'label': label, 'ext': ext, 'custom': True, 'items': items})
    print(f'{label}（{key}）：{len(items)} 个')

# 自建包排在 L站几页后面、平台包前面
n_ld = sum(1 for p in manifest if p['key'] == 'ld')
manifest = manifest[:n_ld] + custom + manifest[n_ld:]
(OUT / 'packs.json').write_text(json.dumps(manifest, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
tokens = sorted({f"{p['key']}:{n}" for p in manifest for n in p['items']})
(ROOT / 'src' / 'stickers.ts').write_text(
    '// 由 scripts/build_stickers.py / build_custom_stickers.py 生成，勿手改\n'
    f"export const STICKER_EXT: Record<string, string> = {json.dumps({p['key']: p['ext'] for p in manifest})}\n"
    f"export const STICKERS = new Set<string>({json.dumps(tokens)})\n", encoding='utf-8', newline='\n')
print('完成，共', len(custom), '个自建包')
