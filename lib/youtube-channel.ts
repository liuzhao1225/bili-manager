import { Innertube, YT, YTNodes } from 'youtubei.js'

const BLOCKED_KEYWORDS = ['taiwan', 'china', 'chinese', 'hongkong', 'jinping']
const MAX_TAB_PAGES = 50

type ChannelFeed = YT.Channel | YT.ChannelListContinuation

export type ChannelVideo = {
  id: string
  title: string
  url: string
  viewCount: number
  sourceType: 'video' | 'short'
}

export type ChannelScanResult = {
  channelId: string
  videos: ChannelVideo[]
  scannedVideos: number
  scannedShorts: number
}

export function parseViewCount(value: string) {
  const normalized = value.trim().toLowerCase().replaceAll(',', '')
  const match = normalized.match(/([\d.]+)\s*([kmb])?/)
  if (!match) return 0

  const multipliers: Record<string, number> = {
    k: 1_000,
    m: 1_000_000,
    b: 1_000_000_000,
  }
  return Math.round(Number.parseFloat(match[1]) * (multipliers[match[2] || ''] || 1))
}

function isSensitiveTitle(title: string) {
  const normalized = title.toLowerCase()
  return BLOCKED_KEYWORDS.some((keyword) => normalized.includes(keyword))
}

function videoViewText(item: YTNodes.LockupView) {
  return item.metadata?.metadata?.metadata_rows
    ?.flatMap((row) => row.metadata_parts || [])
    .map((part) => part.text?.toString() || '')
    .find((text) => /views?/i.test(text)) || ''
}

async function collectVideos(initialFeed: ChannelFeed) {
  const videos: ChannelVideo[] = []
  let feed = initialFeed

  for (let page = 1; page <= MAX_TAB_PAGES; page += 1) {
    for (const item of feed.memo.getType(YTNodes.LockupView)) {
      if (item.content_type !== 'VIDEO' || !item.content_id) continue
      const title = item.metadata?.title?.toString() || ''
      videos.push({
        id: item.content_id,
        title,
        url: `https://www.youtube.com/watch?v=${item.content_id}`,
        viewCount: parseViewCount(videoViewText(item)),
        sourceType: 'video',
      })
    }

    // Some channel responses still use the older Video node.
    for (const item of feed.memo.getType(YTNodes.Video)) {
      if (!item.id) continue
      videos.push({
        id: item.id,
        title: item.title?.toString() || '',
        url: `https://www.youtube.com/watch?v=${item.id}`,
        viewCount: parseViewCount(item.view_count?.text || item.short_view_count?.text || ''),
        sourceType: 'video',
      })
    }

    if (!feed.has_continuation) return videos
    if (page === MAX_TAB_PAGES) {
      throw new Error(`Videos 超过 ${MAX_TAB_PAGES} 页，已停止扫描`)
    }
    feed = await feed.getContinuation()
  }

  return videos
}

async function collectShorts(initialFeed: ChannelFeed) {
  const shorts: ChannelVideo[] = []
  let feed = initialFeed

  for (let page = 1; page <= MAX_TAB_PAGES; page += 1) {
    for (const item of feed.memo.getType(YTNodes.ShortsLockupView)) {
      const id = item.on_tap_endpoint?.payload?.videoId
      if (!id) continue
      shorts.push({
        id,
        title: item.overlay_metadata?.primary_text?.toString() || '',
        url: `https://www.youtube.com/shorts/${id}`,
        viewCount: parseViewCount(item.overlay_metadata?.secondary_text?.toString() || ''),
        sourceType: 'short',
      })
    }

    if (!feed.has_continuation) return shorts
    if (page === MAX_TAB_PAGES) {
      throw new Error(`Shorts 超过 ${MAX_TAB_PAGES} 页，已停止扫描`)
    }
    feed = await feed.getContinuation()
  }

  return shorts
}

export async function scanYoutubeChannel(channelUrl: string, minViewCount: number): Promise<ChannelScanResult> {
  const youtube = await Innertube.create({
    lang: 'en',
    location: 'US',
    generate_session_locally: true,
    retrieve_player: false,
  })
  const endpoint = await youtube.resolveURL(channelUrl)
  const channelId = endpoint.payload?.browseId
  if (typeof channelId !== 'string' || !channelId.startsWith('UC')) {
    throw new Error('无法解析 YouTube 频道 ID')
  }

  const channel = await youtube.getChannel(channelId)
  if (!channel.has_videos && !channel.has_shorts) {
    throw new Error('频道没有 Videos 或 Shorts')
  }

  const [videos, shorts] = await Promise.all([
    channel.has_videos ? channel.getVideos().then(collectVideos) : Promise.resolve([]),
    channel.has_shorts ? channel.getShorts().then(collectShorts) : Promise.resolve([]),
  ])
  const deduped = new Map<string, ChannelVideo>()
  for (const video of [...videos, ...shorts]) {
    const threshold = video.sourceType === 'short' ? minViewCount * 10 : minViewCount
    if (video.viewCount <= threshold || isSensitiveTitle(video.title)) continue
    deduped.set(video.id, video)
  }

  return {
    channelId,
    videos: [...deduped.values()],
    scannedVideos: videos.length,
    scannedShorts: shorts.length,
  }
}
