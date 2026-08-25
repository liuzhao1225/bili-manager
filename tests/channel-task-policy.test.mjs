import assert from 'node:assert/strict'
import test from 'node:test'

import { decideChannelTask } from '../lib/channel-task-policy.ts'
import { parseViewCount } from '../lib/youtube-channel.ts'

test('new tasks use the requested priority', () => {
  assert.deepEqual(decideChannelTask(undefined, 2, false), { write: true, priority: 2 })
})

test('queued tasks keep a higher existing priority', () => {
  assert.deepEqual(decideChannelTask({ status: 'queued', priority: 4 }, 1, false), {
    write: true,
    priority: 4,
  })
})

test('processing and paused tasks are skipped', () => {
  assert.deepEqual(decideChannelTask({ status: 'processing', priority: 1 }, 3, true), {
    write: false,
    reason: 'processing',
  })
  assert.deepEqual(decideChannelTask({ status: 'paused', priority: 1 }, 3, true), {
    write: false,
    reason: 'paused',
  })
})

test('terminal tasks require explicit requeue', () => {
  assert.deepEqual(decideChannelTask({ status: 'succeeded', priority: 1 }, 2, false), {
    write: false,
    reason: 'terminal',
  })
  assert.deepEqual(decideChannelTask({ status: 'failed', priority: 3 }, 1, true), {
    write: true,
    priority: 3,
  })
})

test('YouTube abbreviated view counts are parsed', () => {
  assert.equal(parseViewCount('89K views'), 89_000)
  assert.equal(parseViewCount('1.27M views'), 1_270_000)
  assert.equal(parseViewCount('12,345 views'), 12_345)
})
