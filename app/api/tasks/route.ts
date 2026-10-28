import { createTask } from '@/app/actions'
import { parseYoutubeUrl } from '@/lib/youtube-url'

// Same task access policy as the existing form. Origin checking prevents
// unrelated browser pages from posting; it is not an authentication mechanism.
const EXTRACTOR_ORIGIN = 'chrome-extension://nfebljdpfbnlbcjhlenpkhaapnfkhkee'

export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  if (origin !== EXTRACTOR_ORIGIN && origin !== new URL(request.url).origin) {
    return Response.json({ success: false, message: '不允许的请求来源' }, { status: 403 })
  }
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return Response.json({ success: false, message: '请提交 JSON' }, { status: 415 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ success: false, message: 'JSON 格式错误' }, { status: 400 })
  }
  if (!body || !['medium', 'high'].includes(body.priority) || !Array.isArray(body.urls) || !body.urls.length) {
    return Response.json({ success: false, message: '需要视频链接和 medium / high 优先级' }, { status: 400 })
  }
  try {
    for (const url of body.urls) {
      if (typeof url !== 'string') throw new Error('链接必须为字符串')
      parseYoutubeUrl(url)
    }
  } catch (error) {
    return Response.json({ success: false, message: error instanceof Error ? error.message : String(error) }, { status: 400 })
  }

  const formData = new FormData()
  formData.set('urls', body.urls.join('\n'))
  formData.set('priority', body.priority)
  const result = await createTask({ success: false, message: '' }, formData)
  return Response.json(result)
}
