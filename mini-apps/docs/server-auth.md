# 开发者服务端鉴权

受保护 HTTP 和所有 WSS 接口都要验证平台 JWT。使用 `@discourse-mini-app/sdk/server`，不要只解码 payload。HTTP 从 `Authorization: Bearer …` 读取，WSS 在 upgrade 前验证 `mini_app_token` query。

固定配置社区地址、服务 HTTPS origin、平台分配的应用 ID、环境和社区提供的 JWT 验证公钥；不要按未验证请求里的地址选择公钥。此入口只用于 Node/Bun 服务端。

```ts
import type { IncomingMessage } from "node:http";
import { readFile } from "node:fs/promises";
import {
  PlatformAuthError,
  verifyPlatformRequest,
  verifyPlatformWebSocketRequest,
} from "@discourse-mini-app/sdk/server";

const trust = {
  issuer: "https://community.example.com/forum",
  audience: "https://api.example.com",
  appId: "019a2a58-0000-7000-8000-000000000001",
  channel: "production" as const,
  publicKey: await readFile("/etc/my-app/community-jwt-public.pem", "utf8"),
};

function externalUrl(request: IncomingMessage) {
  if (!request.url?.startsWith("/")) throw new PlatformAuthError();
  return `${trust.audience}${request.url}`;
}

export function authenticateHttp(request: IncomingMessage) {
  return verifyPlatformRequest({
    ...trust,
    authorization: request.headers.authorization ?? "",
    scope: "network.request",
    method: request.method ?? "",
    url: externalUrl(request),
  });
}

export function authenticateUpgrade(request: IncomingMessage) {
  if (request.headers.origin !== new URL(trust.issuer).origin) {
    throw new PlatformAuthError();
  }
  return verifyPlatformWebSocketRequest({
    ...trust,
    url: externalUrl(request),
  });
}
```

替换上面的配置。URL 使用固定外部 origin 和原始 request target；反向代理改写路径时按部署配置恢复，不信任任意 Host/转发头，也不排序或重新编码 query。

- 验证失败返回 401、拒绝 WS upgrade；业务权限不足返回 403。身份使用返回结果的 `(iss, sub)`，正文中的 `user_id` 不可信。
- JWT 可复用 15 分钟，不按一次性凭据消费；仍需验证每次业务参数、资源归属和幂等。sandbox 要显式允许并与正式数据分开。
- 忽略 Cookie 鉴权，JWT 缺失/无效不能回退登录态。HTTP 需允许论坛 origin 的 CORS、OPTIONS、Authorization、Content-Type；错误响应也要有 CORS，OPTIONS 不要求 JWT。
- WS 服务逐条验证业务消息，连接最多存活 `min(300 秒, token 剩余有效期)`，到期关闭并重新认证。
- 隐藏日志中的 Authorization 和 `mini_app_token`，不向小程序回显 token。旧 JWT 可用到到期，业务封禁仍由服务端处理。

客户端声明、调用与限额见 [HTTP/WS](sdk-network.md)。
