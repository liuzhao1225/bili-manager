import assert from 'node:assert/strict'
import test from 'node:test'

import { extractYoutubeUrls, parseYoutubeUrl } from '../lib/youtube-url.ts'

test('extracts all four videos from a recommendation with headings and Markdown', () => {
  const text = `有。结合你现在管理**个人资料、公司事务、项目和自考**的需求，我推荐这 4 个。
### 1. 资料怎么整理：Tiago Forte 的 PARA 方法
[Organize Your ENTIRE Digital Life in Seconds — The PARA Method](https://www.youtube.com/watch?v=T6Mfl1OywM8)
作者亲自介绍如何按 **项目、持续责任、参考资源、归档**组织数字资料。
### 2. 手头事情太多：给项目设边界
[Too Many Projects? The 10-to-15 Rule Will Save You! — Tiago Forte](https://www.youtube.com/watch?v=anexySaCsgU)
### 3. 总觉得有事没做：GTD 作者的演讲
[Getting in Control and Creating Space — David Allen / TEDxAmsterdam](https://www.youtube.com/watch?v=kOSFxKaqOm4)
### 4. 整理以后怎么持续运转：每周计划
[Master Your Week: The PARA Method for Ultimate Productivity — Tiago Forte](https://www.youtube.com/watch?v=MyWmGDnWhjE)
我的建议：先看 **1 → 4**，然后拿“自考毕业”做一次小规模实践。`
  assert.deepEqual(extractYoutubeUrls(text).map((url) => parseYoutubeUrl(url).youtubeId), [
    'T6Mfl1OywM8', 'anexySaCsgU', 'kOSFxKaqOm4', 'MyWmGDnWhjE',
  ])
})

test('extracts multiple links per line with Chinese and English punctuation', () => {
  const text = '先看：https://youtu.be/T6Mfl1OywM8，再看（https://www.youtube.com/watch?v=MyWmGDnWhjE）。 See https://youtu.be/kOSFxKaqOm4.'
  assert.deepEqual(extractYoutubeUrls(text).map((url) => parseYoutubeUrl(url).youtubeId), [
    'T6Mfl1OywM8', 'MyWmGDnWhjE', 'kOSFxKaqOm4',
  ])
})

test('keeps existing line-based input and Shorts task identity', () => {
  const urls = extractYoutubeUrls('youtube.com/watch?v=T6Mfl1OywM8\r\nhttps://www.youtube.com/shorts/MyWmGDnWhjE?si=shared\n')
  assert.deepEqual(urls.map((url) => parseYoutubeUrl(url).taskKey), [
    'video:T6Mfl1OywM8', 'short:MyWmGDnWhjE',
  ])
})

test('accepts formatted links and Chinese prose immediately after a URL', () => {
  const text = '**https://youtu.be/T6Mfl1OywM8** 和 <https://youtu.be/MyWmGDnWhjE>，看 https://youtu.be/kOSFxKaqOm4的视频'
  assert.deepEqual(extractYoutubeUrls(text).map((url) => parseYoutubeUrl(url).youtubeId), [
    'T6Mfl1OywM8', 'MyWmGDnWhjE', 'kOSFxKaqOm4',
  ])
})

test('normalizes tracking parameters, mobile links and repeated video formats', () => {
  const text = 'https://m.youtube.com/watch?feature=shared&v=T6Mfl1OywM8&t=30 https://youtu.be/T6Mfl1OywM8?si=shared https://www.youtube.com/watch?v=T6Mfl1OywM8'
  const videos = extractYoutubeUrls(text).map(parseYoutubeUrl)
  assert.equal(videos.length, 3)
  assert.equal(new Set(videos.map((video) => video.taskKey)).size, 1)
  assert.ok(videos.every((video) => video.url === 'https://www.youtube.com/watch?v=T6Mfl1OywM8'))
})

test('ignores unrelated text and lookalike domains', () => {
  assert.deepEqual(extractYoutubeUrls('没有视频 https://example.com https://notyoutube.com/watch?v=T6Mfl1OywM8 https://youtube.com.evil.example/watch?v=T6Mfl1OywM8 https://example.com/youtube.com/watch?v=T6Mfl1OywM8'), [])
})

test('malformed IDs and unsupported YouTube pages still report invalid links', () => {
  for (const url of ['https://youtu.be/short', 'https://youtu.be/T6Mfl1OywM8extra', 'https://youtube.com/@channel', 'https://youtube.com/watch?list=playlist']) {
    assert.equal(extractYoutubeUrls(url).length, 1)
    assert.throws(() => parseYoutubeUrl(url), /无效的 YouTube URL/)
  }
})
