# 需求与社区更新

用 [GitHub Issues](https://github.com/kourou25/jinhuan/issues/new/choose) 提交功能、缺陷和改进建议。实现或整理好内容后提交 PR。

站点「社区更新」支持自动发布。仅修改 contributions/site-updates.json，在 updates 末尾添加一条记录，其中 issue 是本项目的需求编号，title 是 40 字以内的纯文本标题，body 是 220 字以内的正文。既有条目需要保留。通过检查后，GitHub Actions 自动合并，站点随后读取 main 中的新清单。

以下字段可选，填了会在页面上显示分类、日期和投稿人：

| 字段 | 说明 |
| --- | --- |
| kind | 分类，取 `feature`（新功能）、`fix`（修复）、`polish`（体验优化）、`art`（美术）、`community`（社区）之一 |
| date | 上线日期，格式 `YYYY-MM-DD` |
| author | 你的 GitHub 用户名，必须和提交 PR 的账号一致 |

```json
{ "issue": 12, "title": "群聊支持拖拽调整列表宽度", "body": "桌面端群聊左侧的群列表可以拖动边缘调整宽度。", "kind": "polish", "date": "2026-11-22", "author": "your-name" }
```

功能源码 PR 使用仓库正常的贡献入口。
