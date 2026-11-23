# 尽欢

尽欢是基于 Linux.DO 账号的梗图交流站，包含图廊、群聊、社区装扮与鱼鱼谷。本仓库是线上站点的完整源码（2026-11-23 起），以及新实例使用的空库结构。

| 目录 | 内容 |
| --- | --- |
| [website](website/) | 主站完整源码：Worker、图廊与聊天前端、账号系统、红包与猜词、鱼鱼谷网页版 |
| [skins](skins/) | 气泡样式、通用饰件、预览页、投稿格式和校验器 |
| [fish-valley](fish-valley/) | 鱼鱼谷的小程序客户端与沙箱接入适配（重做中，暂不可构建） |
| [contributions](contributions/) | 社区更新投稿的格式与自动合并 |

新实例的用户、会话、群聊、私信和图廊数据为空。生产配置（数据库、应用 ID、站长账号）已换成占位值，部署方法见 [website/README.md](website/README.md)。自有代码采用 [MIT 许可证](LICENSE)，第三方依赖与素材遵循 [各自的许可](THIRD_PARTY_NOTICES.md)。

## 参与贡献

通过 [Issues 提需求](https://github.com/kourou25/jinhuan/issues/new/choose)。[社区更新投稿](contributions/README.md)通过格式检查后会自动合并并同步到线上。

发现安全问题请通过 GitHub 私下报告（Security → Report a vulnerability），不要公开 Issue。
