# @discourse-mini-app/sdk

通过 `getSDK()` 获取 SDK，等待 `sdk.ready` 后调用 API。完成首次渲染或显示错误后，调用 `lifecycle.ready()`。

```ts
import { getSDK } from "@discourse-mini-app/sdk";

const sdk = getSDK();
await sdk.ready;
try {
  const user = sdk.permissions.has("user.read")
    ? await sdk.user.getCurrent()
    : null;
  const player = document.getElementById("player");
  if (player) player.textContent = user?.name ?? "访客";
} finally {
  await sdk.lifecycle.ready();
}
```

## 权限与 API

| 权限                                 | 方法                                                              |
| ------------------------------------ | ----------------------------------------------------------------- |
| `user.read`                          | `user.getCurrent()`                                               |
| `user.lookup`                        | `user.getById(userId)`                                            |
| `launch.read`                        | `launch.getParameters()`                                          |
| `theme.read`                         | `theme.get()`、`theme.onChange(callback)`                         |
| `storage.read` / `storage.write`     | `localStorage.getItem/setItem/removeItem/clear`                   |
| `cookies.read` / `cookies.write`     | `cookies.get/set/remove`                                          |
| `clipboard.read` / `clipboard.write` | `clipboard.readText/writeText`                                    |
| `fullscreen`                         | `fullscreen.request/exit`                                         |
| `audio.play` / `video.play`          | `audio.play(assetId)`、`video.play(assetId)`、对应 `stop(handle)` |
| `network.request`                    | `http.request(endpointName, options)`                             |
| `network.websocket`                  | `webSocket.connect(endpointName, options)`                        |

先检查 `sdk.permissions.has()`，并处理 Promise 拒绝。匿名模式的用户为 `null`，不能查询其他用户、使用剪贴板或网络。

- 用户资料包含 `id/username/name/initials`。使用 `id` 关联用户数据和判断身份，用户名只用于展示。
- 主题包含颜色、明暗、语言、容器尺寸和减少动效偏好；`onChange` 返回取消订阅函数。
- 启动参数返回 `{ query: Record<string, string[]>, hash }` 快照；重复 query 保留，hash 不含 `#`。总量最多 8 KiB，不能作为身份凭据。
- 媒体只播放 manifest 声明的包内资源。剪贴板文字最多 4 KiB；剪贴板、全屏和播放按页面提示确认。
- 一般调用最多 16 并发、60 次/分钟。处理 `PERMISSION_DENIED`、`USER_CANCELLED`、`TIMEOUT`、`MESSAGE_LIMIT` 和离开后的 `APP_UNLOADED`。

获取当前论坛界面语言需 `theme.read`，语言代码沿用 Discourse，例如 `zh_CN`、`zh_TW`、`en`：

```ts
const { locale } = await sdk.theme.get();
const unsubscribe = sdk.theme.onChange(({ locale }) => updateLanguage(locale));
```

## 包内文件

读取只限当前包的基础文件和声明资源，不需要额外权限。三个方法均为异步：

| 方法                               | 返回内容                                                    |
| ---------------------------------- | ----------------------------------------------------------- |
| `await sdk.assets.readText(path)`  | UTF-8 文字                                                  |
| `await sdk.assets.readJson(path)`  | JSON 数据，例如 `await sdk.assets.readJson("strings.json")` |
| `await sdk.assets.readBytes(path)` | 文件字节；基础文本按 UTF-8 返回                             |

普通资源在 manifest 的 `assets` 路径数组中声明；`media` 已声明的文件不要重复列入。包内图片使用 Blob，例如：

```ts
const bytes = await sdk.assets.readBytes("images/logo.png");
const url = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
const logo = new Image();
logo.src = url;
document.body.append(logo);
// 图片不再使用时：URL.revokeObjectURL(url)
```

图片只支持包内 Blob；音视频仍在 `media` 声明后使用 `sdk.audio/video.play()`。目前不支持远程图片和音视频资源。单文件最多 8 MiB，整个 ZIP 的文件数和大小限制见 [开发说明](../docs/developer-guide.md#项目和运行-zip)。

## 浏览器存储

存储仅保存在当前浏览器，按应用及正式/沙盒隔离；`clear()` 只清当前应用范围。用户级 key 由应用组织，数据不跨设备同步。

```ts
await sdk.localStorage.setItem("progress", JSON.stringify({ level: 2 }));
const raw = await sdk.localStorage.getItem("progress");
const progress = raw === null ? null : JSON.parse(raw);
```

key 长度 1–80 字符，单值最多 4 KiB，每个应用环境最多 64 个键、64 KiB。

`cookies` 同样按应用及正式/沙盒隔离。key 限字母、数字、点、下划线或连字符；`maxAge` 为秒，默认一天、最长 30 天，0 表示删除。当前范围最多 32 项、总量 4 KiB。

浏览器拒绝存储时返回 `STORAGE_UNAVAILABLE`，应用应处理保存失败。切换账号不会自动切换此应用的数据。

## 网络与打包

HTTP 返回 `{ status, headers, body }`，WS 返回可 `send/close/on` 的连接；目标由 manifest 固定。使用方法见 [HTTP/WS](../docs/sdk-network.md)，开发者服务认证见 [服务端鉴权](../docs/server-auth.md)。

使用 `@discourse-mini-app/sdk/pack` 构建原始 ZIP。下例只包含基础文件；声明的 `assets/media` 文件也应按相同路径加入 `files`：

```ts
import { readFile } from "node:fs/promises";
import { pack } from "@discourse-mini-app/sdk/pack";

await pack({
  outputDirectory: "dist/package",
  manifest: JSON.parse(await readFile("manifest.json", "utf8")),
  files: {
    "index.html": await readFile("dist/web/index.html"),
    "app.js": await readFile("dist/web/app.js"),
    "app.css": await readFile("dist/web/app.css"),
    "strings.json": await readFile("dist/web/strings.json"),
  },
});
```

Vite 的单 IIFE/CSS 构建配置和媒体打包见 [完整示例](../demos/README.md)。运行 ZIP 只含编译产物，格式与调试步骤见 [开发说明](../docs/developer-guide.md)。
