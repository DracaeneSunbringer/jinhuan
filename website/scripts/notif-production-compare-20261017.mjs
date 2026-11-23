// Read-only, bounded production comparison; output never contains user IDs or notification bodies.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { queries, notificationPage } from '../tests/cases/d1-read-queries-20261015.mjs'

const run = sql => {
  assert.match(sql, /^SELECT /)
  const raw = execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'meme-hall', '--remote', '--command', sql, '--json'], {
    encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, WRANGLER_WRITE_LOGS: 'false', WRANGLER_LOG_SANITIZE: 'true' },
  })
  const value = JSON.parse(raw.slice(raw.search(/^[\[{]/m)))[0]
  assert.equal(value.meta.rows_written, 0)
  return value
}
const q = queries()
const recent = { ...q, parts: { ...q.parts } }
for (const [kind, table, alias, index] of [
  ['like', 'likes', 'l', 'idx_likes_recent'],
  ['emoji', 'reactions', 'r', 'idx_reactions_recent'],
  ['reply', 'short_replies', 's', 'idx_replies_recent'],
  ['comment', 'comments', 'c', 'idx_comments_recent'],
]) recent.parts[kind] = q.parts[kind].replace(`FROM ${table} ${alias}`, `FROM ${table} ${alias} INDEXED BY ${index}`)
const authorSelection = run('SELECT m.author_id AS uid, COUNT(*) AS posts, COALESCE(u.notif_read,0) AS read_at FROM memes m JOIN users u ON u.id=m.author_id GROUP BY m.author_id ORDER BY posts DESC LIMIT 2')
const authors = authorSelection.results
assert.equal(authors.length, 2)
const now = Math.floor(Date.now() / 1000), since = now - 30 * 86400
const bind = (sql, uid, readAt) => sql.replace(/\?([123])/g, (_, n) => String([uid, since, readAt][Number(n) - 1]))
const fingerprint = rows => createHash('sha256').update(JSON.stringify(rows)).digest('hex')
const comparisons = []
for (const [position, author] of authors.entries()) {
  const old = run(bind(notificationPage(q), author.uid, author.read_at))
  const next = run(bind(notificationPage(recent), author.uid, author.read_at))
  assert.equal(fingerprint(old.results), fingerprint(next.results), `author ${position + 1} notification results changed`)
  comparisons.push({ rank: position + 1, posts: author.posts, rowsReturned: old.results.length, originalRowsRead: old.meta.rows_read, recentRowsRead: next.meta.rows_read, sameResults: true, rowsWritten: 0 })
}
console.log(JSON.stringify({ at: new Date().toISOString(), scope: 'same-user default notification list, no per-user preferences', authorSelectionRowsRead: authorSelection.meta.rows_read, comparisons }, null, 2))
