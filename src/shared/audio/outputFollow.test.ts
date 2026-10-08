import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultRouteChanged, followsSystemDefault, isDeviceSelected, shouldRebindToDefault } from './outputFollow.ts'

test('followsSystemDefault', () => {
  assert.equal(followsSystemDefault(''), true)
  assert.equal(followsSystemDefault(' default '), true)
  assert.equal(followsSystemDefault('abc123'), false)
})

test('defaultRouteChanged only when both ids are known and differ', () => {
  assert.equal(defaultRouteChanged('speakers', 'airpods'), true)
  assert.equal(defaultRouteChanged('speakers', 'speakers'), false)
  assert.equal(defaultRouteChanged(null, 'airpods'), false)
  assert.equal(defaultRouteChanged('speakers', null), false)
})

test('shouldRebindToDefault respects a pinned device', () => {
  assert.equal(shouldRebindToDefault('', 'speakers', 'airpods'), true)
  assert.equal(shouldRebindToDefault('default', 'airpods', 'speakers'), true)
  assert.equal(shouldRebindToDefault('usb-dac', 'speakers', 'airpods'), false)
  assert.equal(shouldRebindToDefault('', 'speakers', 'speakers'), false)
})

test('isDeviceSelected marks the default alias when following default', () => {
  const alias = { deviceId: 'default', isDefaultAlias: true }
  const airpods = { deviceId: 'ap1', isDefaultAlias: false }
  assert.equal(isDeviceSelected(alias, ''), true)
  assert.equal(isDeviceSelected(airpods, ''), false)
  assert.equal(isDeviceSelected(airpods, 'ap1'), true)
  assert.equal(isDeviceSelected(alias, 'ap1'), false)
})
