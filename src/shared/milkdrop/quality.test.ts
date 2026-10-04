import test from 'node:test'
import assert from 'node:assert/strict'
import { qualityScale, sanitizeFpsCap, sanitizeQuality } from './quality.ts'

test('qualityScale', () => {
  assert.equal(qualityScale('low', 2), 0.5)
  assert.equal(qualityScale('medium', 2), 1)
  assert.equal(qualityScale('high', 2), 2)
  assert.equal(qualityScale('high', 3), 2)
  assert.equal(qualityScale('high', 0.5), 1)
})

test('sanitizers fall back to defaults', () => {
  assert.equal(sanitizeQuality('low'), 'low')
  assert.equal(sanitizeQuality('ultra'), 'medium')
  assert.equal(sanitizeQuality(undefined), 'medium')
  assert.equal(sanitizeFpsCap(30), 30)
  assert.equal(sanitizeFpsCap('30'), 60)
})
