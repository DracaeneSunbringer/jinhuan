// Local review only. Heuristic masking reduces accidental exposure; it does not
// make private group messages suitable for public release.
export function redactPersonalHistory(value) {
  return String(value ?? '')
    .replace(/\b(?:sk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{12,}/g, '[疑似凭据遮蔽]')
    .replace(/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[令牌遮蔽]')
    .replace(/\b(?:authorization|cookie|set-cookie)\s*:[^\r\n]+/gi, '[认证信息遮蔽]')
    .replace(/(?:api[ _-]?key|access[ _-]?token|secret|password|密码|密钥|令牌)\s*[:=：]\s*[^\s,，;；]+/gi, '[凭据字段遮蔽]')
    .replace(/https?:\/\/[^\s<>]+/gi, '[链接]')
    .replace(/\b[A-Za-z0-9_+/=-]{32,}\b/g, '[长串标识遮蔽]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[邮箱遮蔽]')
    .replace(/(?:口令|验证码)\s*[:：]?\s*\d{4,}/g, '[口令遮蔽]')
}
