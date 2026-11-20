# 开发说明

## 开发与发布

1. 在社区个人资料的应用页创建应用，填写名称、说明和图标；复制应用 ID，填入 manifest。
2. 使用 [示例项目](../demos/README.md) 或 SDK 开发，只申请实际需要的权限。
3. 在沙箱页签上传 `dist/package/app.zip` 并保存，等待构建处理完成。
4. 沙箱页签列出每个构建，固定有效期 7 天，也可手动过期（不可恢复）。在正式页新建发布，选择版本与构建，填写更新说明和审核备注；提审中可以撤回。
5. 在 `/apps-sandbox/<app-id>/<version>-<8-char-sha>` 检查实际运行。作者需有开发者资格，管理员可预览审核。
6. 正式审核和处理完成后收到系统私信，再手动上线。新发布版本必须高于已发布的最高版本；历史正式版可重新上线回滚。材料与处罚规则见 [提审说明](submission-review.md)。

## 项目和运行 ZIP

使用 Bun 1.4.3+。保留示例对 `../../sdk` 的引用：

```sh
cd demos/brick-breaker
bun install --frozen-lockfile
bun run dev
MINI_APP_ID=应用ID MINI_APP_VERSION=1.0.0 bun run build
```

Vite 输出单个 IIFE `app.js` 和 `app.css`，用 SDK `pack` 生成 ZIP。只上传运行 ZIP，不上传开发项目目录或旁边的 `package.json`。五个基础文件在根目录；其他文件必须在 manifest 的 `assets` 或 `media` 中声明：

```text
manifest.json
index.html
app.js
app.css
strings.json
data/…        可选，列入 assets
images/…      可选，列入 assets
media/…       可选，列入 media
```

示例中把普通资源放入 `public/`，例如 `public/data/settings.json`，并在 manifest 的 `assets` 中列出 `data/settings.json`；构建会将它打入 ZIP。

`index.html` 是正文片段，不带脚本入口、内联样式或事件属性。用 `addEventListener`、`textContent` 和 CSS 类编写界面；目前不支持动态分包、外部脚本和字体加载。包内图片经 SDK 读取后以 Blob 加载。未声明文件、目录项、链接、重复或越界路径不接受，请使用 SDK 打包。

版本只使用 `1.2.3` 这样的三段数字，最长 64 字符；不同构建由构建标识区分。

## Manifest

```json
{
  "format": 1,
  "id": "019a2a58-0000-7000-8000-000000000001",
  "version": "1.0.0",
  "entry": "index.html",
  "script": "app.js",
  "style": "app.css",
  "permissions": ["user.read", "theme.read"],
  "assets": ["data/settings.json", "images/logo.png"]
}
```

- `id` 使用应用页面分配的值，原样复制，不要自行生成；示例 ID 要替换成自己的 ID。
- `version` 使用 `x.x.x` 三段数字，如 `1.2.0`，不带前导零或后缀，最长 64 字符。同一版本可上传多个沙箱构建；新建正式发布时必须高于历史最高正式版本。
- `entry/script/style` 固定如上；`permissions` 是申请列表，以实际批准结果为准。
- 可选 `assets` 是包内普通资源的路径数组。五个基础文件无需重复列入，`media` 已声明的文件也不要再列入；读取自带文件无需额外权限，见 [文件读取](../sdk/README.md#包内文件)。
- 网络通过可选 `endpoints/websockets` 声明，见 [HTTP/WS](sdk-network.md)。
- 可选 `media` 使用 `assetId: { path, kind, mime }`，例如 `"chime": { "path": "media/chime.wav", "kind": "audio", "mime": "audio/wav" }`。路径为 `media/[A-Za-z0-9_-]+\.[a-z0-9]+`；支持 `audio/wav`、`audio/mpeg`、`audio/ogg`、`video/mp4`、`video/webm`，仅播放。

| 项目              | 限额                                |
| ----------------- | ----------------------------------- |
| 上传 ZIP          | 以上传页面显示的大小限制为准        |
| 解压总量 / 单文件 | 32 MiB / 8 MiB                      |
| 文件 / 媒体数     | 128 / 16                            |
| 文件路径          | 160 字节 ASCII，无空段、`.` 或 `..` |
| manifest JSON     | 64 KiB，最多 32 层                  |

打包器还会检查首屏内容大小；较大的数据文件放到 `assets`，用 SDK 文件 API 读取。

## 调试

1. `bun run dev` 调界面和业务逻辑；本地预览不模拟用户或平台 SDK。
2. 需要真实 SDK 时，构建新版本调试包并上传 sandbox：

   ```sh
   MINI_APP_ID=应用ID MINI_APP_VERSION=1.0.1 bun run build:debug
   ```

3. 打开对应 sandbox 页面，在 DevTools 的 Console/Sources 中选择运行小程序的 frame，查看日志、源码和断点；在 Network 查看开发者服务请求与响应。
4. 确认功能后提交正式候选版。sandbox 保留 source map，正式发布移除 source map；不要在业务代码中读取它。

SDK 权限与用法见 [API 文档](../sdk/README.md)。先等 `sdk.ready`，首次渲染或显示错误后调用 `lifecycle.ready()`。处理拒绝、取消、超时和卸载，不能访问父 DOM、论坛 Cookie 或其他应用。支持窄屏、触摸、键盘、深浅主题与减少动效；离开时取消订阅，游戏在页面隐藏时暂停。
