import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { validateSiteUpdates } from './validate-updates.mjs'
const valid = { issue: 1, title: '更新标题', body: '公开的站点更新。' }
const rich = { ...valid, issue: 2, kind: 'feature', date: '2026-11-22', author: 'kourou25' }
test('accepts plain updates', () => assert.deepEqual(validateSiteUpdates({ version: 1, updates: [valid] }).updates, [valid]))
test('accepts optional kind, date and author', () => assert.deepEqual(validateSiteUpdates({ version: 1, updates: [valid, rich] }).updates, [valid, rich]))
test('rejects markup, contact details and duplicates', () => {
  for (const updates of [[valid, valid], [{ ...valid, body: '<img>' }], [{ ...valid, body: 'name@example.com' }], [{ ...valid, url: 'https://example.com' }]]) {
    assert.throws(() => validateSiteUpdates({ version: 1, updates }))
  }
})
test('rejects bad optional fields', () => {
  for (const extra of [{ kind: 'news' }, { date: '2026-02-30' }, { date: '2026/11/22' }, { author: '-bad' }, { author: 'a--b' }, { author: 'x'.repeat(40) }]) {
    assert.throws(() => validateSiteUpdates({ version: 1, updates: [{ ...valid, ...extra }] }))
  }
})
