import { strict as assert } from 'node:assert'
import { readFile } from 'node:fs/promises'
import { validateSiteUpdates } from './validate-updates.mjs'

const repo = process.env.GITHUB_REPOSITORY
const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'))
const number = Number(event.pull_request?.number ?? event.inputs?.pull_request)
assert.match(repo || '', /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)
assert(Number.isSafeInteger(number) && number > 0)
const file = 'contributions/site-updates.json'
async function api(path, request = {}) {
  const response = await fetch('https://api.github.com' + path, {
    ...request, redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { Authorization: 'Bearer ' + process.env.GH_TOKEN, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
  })
  if (!response.ok) throw Error('GitHub API 请求失败 (' + response.status + ')')
  return response.json()
}
async function snapshot(repository, sha) {
  assert.match(repository, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)
  assert.match(sha, /^[a-f0-9]{40}$/)
  const data = await api('/repos/' + repository + '/contents/' + file + '?ref=' + sha)
  assert(data.type === 'file' && data.encoding === 'base64' && data.size <= 48000)
  const json = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(data.content, 'base64'))
  return validateSiteUpdates(JSON.parse(json))
}
async function run() {
  const prPath = '/repos/' + repo + '/pulls/' + number
  const pr = await api(prPath)
  if (pr.state !== 'open' || pr.draft || pr.base.ref !== 'main' || pr.base.repo.full_name !== repo || pr.changed_files !== 1 || !pr.head.repo) return
  const files = await api(prPath + '/files?per_page=2')
  if (files.length !== 1 || files[0].filename !== file || files[0].status !== 'modified') return
  const base = await api('/repos/' + repo + '/branches/main')
  const [before, next] = await Promise.all([snapshot(repo, base.commit.sha), snapshot(pr.head.repo.full_name, pr.head.sha)])
  assert.equal(next.updates.length, before.updates.length + 1, '每次只能添加一条更新')
  assert.deepEqual(next.updates.slice(0, -1), before.updates, '既有更新内容需要保留')
  const added = next.updates.at(-1)
  if (added.author) assert.equal(added.author.toLowerCase(), pr.user.login.toLowerCase(), 'author 需要填写 PR 作者本人的 GitHub 用户名')
  const issue = await api('/repos/' + repo + '/issues/' + added.issue)
  assert(!issue.pull_request, '请关联需求 Issue')
  const finalBase = await api('/repos/' + repo + '/branches/main')
  assert.equal(finalBase.commit.sha, base.commit.sha, '主分支已更新，请重试工作流')
  const result = await api(prPath + '/merge', { method: 'PUT', body: JSON.stringify({
    sha: pr.head.sha, merge_method: 'squash', commit_title: '发布社区更新 #' + number,
  }) })
  assert(result.merged, '自动合并未完成')
  console.log('已合并社区更新 PR #' + number)
}
await run()
