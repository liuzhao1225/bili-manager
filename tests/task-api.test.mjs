import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { parseYoutubeUrl } from '../lib/youtube-url.ts'
const source = fs.readFileSync(new URL('../app/api/tasks/route.ts', import.meta.url), 'utf8')
const origin = 'chrome-extension://nfebljdpfbnlbcjhlenpkhaapnfkhkee'
const urls = ['https://www.youtube.com/watch?v=abcdefghijk']
function setup(result = { success: true, message: '任务已写入 1 条' }) {
  const calls = []
  const context = { exports: {}, Response, Request, FormData, URL, Error, require: (id) => {
    if (id === '@/lib/youtube-url') return { parseYoutubeUrl }
    if (id === '@/app/actions') return { createTask: async (_prev, form) => { calls.push(Object.fromEntries(form)); return result } }
    throw new Error(id)
  } }
  vm.runInNewContext(ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }), context)
  const request = (body, requestOrigin = origin) => new Request('https://bili-manager.vercel.app/api/tasks', { method: 'POST', headers: { origin: requestOrigin, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { post: context.exports.POST, request, calls }
}
for (const priority of ['medium', 'high']) test(`${priority} reuses existing task action`, async () => {
  const s = setup(); const response = await s.post(s.request({ urls, priority }))
  assert.equal((await response.json()).success, true)
  assert.deepEqual(s.calls, [{ urls: urls[0], priority }])
})
test('force, bad URLs and empty lists cannot reach the action', async () => {
  const s = setup()
  for (const body of [{ urls, priority: 'force' }, { urls: ['https://evil.example/watch?v=abcdefghijk'], priority: 'high' }, { urls: [], priority: 'medium' }]) {
    assert.equal((await s.post(s.request(body))).status, 400)
  }
  assert.equal(s.calls.length, 0)
})
test('unrelated browser origin is refused before writes', async () => {
  const s = setup()
  assert.equal((await s.post(s.request({ urls, priority: 'high' }, 'https://evil.example'))).status, 403)
  assert.equal(s.calls.length, 0)
})
test('database errors retain the original task-action result', async () => {
  const result = { success: false, message: '数据库错误: connection refused' }
  const s = setup(result)
  assert.deepEqual(await (await s.post(s.request({ urls, priority: 'medium' }))).json(), result)
})
