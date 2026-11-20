export function validateSiteUpdates(value) {
  const keys = (input, names) => input && typeof input === 'object' && !Array.isArray(input)
    && Object.keys(input).sort().join(',') === names
  const text = (input, max) => typeof input === 'string' && input === input.trim()
    && [...input].length > 0 && [...input].length <= max
    && !/[<>&@\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]|(?:https?:|www\.|\b(?:\d[ -]?){9,}\b)/iu.test(input)
  if (!keys(value, 'updates,version') || value.version !== 1 || !Array.isArray(value.updates) || value.updates.length > 100) {
    throw Error('更新清单格式无效')
  }
  const issues = new Set()
  for (const item of value.updates) {
    if (!keys(item, 'body,issue,title') || !Number.isSafeInteger(item.issue) || item.issue < 1 || issues.has(item.issue)
      || !text(item.title, 40) || !text(item.body, 220)) throw Error('更新条目无效')
    issues.add(item.issue)
  }
  return value
}
