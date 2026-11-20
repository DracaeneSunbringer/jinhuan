import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { validateSiteUpdates } from './validate-updates.mjs'
const valid = { issue: 1, title: '更新标题', body: '公开的站点更新。' }
test('accepts plain updates', () => assert.deepEqual(validateSiteUpdates({ version: 1, updates: [valid] }).updates, [valid]))
test('rejects markup, contact details and duplicates', () => {
  for (const updates of [[valid, valid], [{ ...valid, body: '<img>' }], [{ ...valid, body: 'name@example.com' }], [{ ...valid, url: 'https://example.com' }]]) {
    assert.throws(() => validateSiteUpdates({ version: 1, updates }))
  }
})
