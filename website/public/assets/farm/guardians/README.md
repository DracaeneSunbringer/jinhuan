# 四角色守护兽显示资源

版本2026-10-23。包含 DeepSeek、GPT、Claude、Gemini 四张透明 WebP 及 `manifest.json`，供守护选择和场景巡逻共用。

原图保存在 `assets/generated/prototypes/farm-voxel-20261020/characters/`，未覆盖。运行 `node scripts/prepare-farm-guardians.mjs`，使用已有 Sharp 按256×320边界等比例最近邻缩小、无损WebP编码；清单保存来源、原尺寸及字节数。四张合计333,956字节。

用途是降低现有角色的解码与传输开销，支持后续统一动作素材的替换。当前为整张角色移动与轻微摆动，不是多帧行走、攻击、施法素材；不得将当前资源标记为完整动作集。原参考角色的发布授权仍须逐项确认。本地资源加载与场景使用已核验，正式移动设备长期内存未验收。
