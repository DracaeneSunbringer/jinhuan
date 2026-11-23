"""把 wallpapers-src/ 里的图片压成站内壁纸库（public/wallpapers）。

  python scripts/build_wallpapers.py

- 支持 jpg / png / webp；文件名就是面板里显示的名字（「芙莉莲-雪原.jpg」→「芙莉莲-雪原」）
- 每张生成长边 2560 的 webp 和一张 360 宽的缩略图，原图不动、不会发布
- 删掉源图后重新运行，对应壁纸也会从库里消失
"""
import hashlib
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'wallpapers-src'
OUT = ROOT / 'public' / 'wallpapers'
SRC.mkdir(exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)

items, keep = [], {'index.json'}
for f in sorted(p for p in SRC.iterdir() if p.suffix.lower() in {'.jpg', '.jpeg', '.png', '.webp'}):
    key = hashlib.sha1(f.read_bytes()).hexdigest()[:12]  # 按内容命名，中文文件名也没问题，图没变就不重压
    full, thumb = OUT / f'{key}.webp', OUT / f'{key}_t.webp'
    im = Image.open(f).convert('RGB')
    if not full.exists():
        big = im.copy()
        big.thumbnail((2560, 2560))
        big.save(full, 'WEBP', quality=82, method=6)
    if not thumb.exists():
        sm = im.copy()
        sm.thumbnail((360, 360))
        sm.save(thumb, 'WEBP', quality=78)
    keep |= {full.name, thumb.name}
    items.append({'name': f.stem, 'src': f'/wallpapers/{full.name}', 'thumb': f'/wallpapers/{thumb.name}', 'w': im.width, 'h': im.height})

for old in OUT.iterdir():
    if old.name not in keep:
        old.unlink()
(OUT / 'index.json').write_text(json.dumps({'items': items}, ensure_ascii=False, indent=1), encoding='utf-8')
print(f'壁纸 {len(items)} 张 → public/wallpapers/index.json')
