// 社区更新清单校验：站点读取、自动合并都走这里。
// 必填 issue / title / body；可选 kind（分类）、date（YYYY-MM-DD）、author（GitHub 用户名）。
export const UPDATE_KINDS = ['feature', 'fix', 'polish', 'art', 'community']
const REQUIRED = ['body', 'issue', 'title']
const OPTIONAL = ['author', 'date', 'kind']

const isObject = (input) => input && typeof input === 'object' && !Array.isArray(input)
const text = (input, max) => typeof input === 'string' && input === input.trim()
  && [...input].length > 0 && [...input].length <= max
  && !/[<>&@\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]|(?:https?:|www\.|\b(?:\d[ -]?){9,}\b)/iu.test(input)
const isDate = (input) => typeof input === 'string' && /^20\d\d-\d\d-\d\d$/.test(input)
  && new Date(input + 'T00:00:00Z').toISOString().slice(0, 10) === input
const isLogin = (input) => typeof input === 'string' && /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(input)

export function validateSiteUpdates(value) {
  if (!isObject(value) || Object.keys(value).sort().join(',') !== 'updates,version' || value.version !== 1
    || !Array.isArray(value.updates) || value.updates.length > 100) {
    throw Error('更新清单格式无效')
  }
  const issues = new Set()
  for (const item of value.updates) {
    if (!isObject(item)) throw Error('更新条目无效')
    const keys = Object.keys(item)
    if (!REQUIRED.every((k) => keys.includes(k)) || !keys.every((k) => REQUIRED.includes(k) || OPTIONAL.includes(k))
      || !Number.isSafeInteger(item.issue) || item.issue < 1 || issues.has(item.issue)
      || !text(item.title, 40) || !text(item.body, 220)
      || ('kind' in item && !UPDATE_KINDS.includes(item.kind))
      || ('date' in item && !isDate(item.date))
      || ('author' in item && !isLogin(item.author))) throw Error('更新条目无效')
    issues.add(item.issue)
  }
  return value
}
