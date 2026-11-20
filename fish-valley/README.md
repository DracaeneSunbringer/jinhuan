# 鱼鱼谷

网页版随尽欢主站运行。按照 [主站说明](../website/README.md) 初始化本地实例后，登录并打开 `/valley`。当前代码包含种植、牧场、钓鱼和矿洞的基础玩法。网页版和小程序复用 `website/public/pet-isle*.js` 的场景与 `website/src/shared/pet-world.ts` 的规则。

## 小程序构建

使用 Node.js 24。在 `website/` 安装锁定依赖后，回到仓库根目录，设置 `MINI_SDK_DIR` 为自己取得的兼容平台 SDK 目录，其中应包含 `index.mjs` 和 `pack.mjs`。运行：

```sh
node fish-valley/build.mjs
```

构建输出位于 `fish-valley/dist/web`。实际打包时同时设置平台分配的 `MINI_APP_ID` 和自己的 HTTPS 服务地址 `MINI_APP_ORIGIN`，再次运行同一命令，ZIP 生成在 `fish-valley/dist/package`。当前留有沙箱只读和写入两个端点。ZIP 使用显式素材清单，只包含当前游戏资源及许可。

## 沙箱接入

[`server/bridge.mjs`](server/bridge.mjs) 导出 `createMiniAppHandler`。接入时提供平台 SDK 的签名验证器、可信签发方和公钥、自己的应用 ID、沙箱账号解析函数和游戏路由分发函数，使用单独的 `MINIAPP_SANDBOX_DB`，以 [主站空库结构](../website/schema.sql) 初始化。将传入的已验证沙箱用户放入路由上下文，使用桥接器提供的绑定分发到主站的 `petWorld` 路由。桥接器只开放游戏会话和山谷相关操作。仓库中的打包验证使用合成应用 ID，目标平台沙箱仍须由部署者验证。
