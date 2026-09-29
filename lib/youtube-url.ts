export function extractYoutubeUrls(text: string) {
  // Stop at prose/Markdown punctuation while retaining URL query parameters.
  const pattern = /(?<![A-Za-z0-9_./:@-])(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\/[A-Za-z0-9_~:/?#@!$&+=%.-]+/gi
  return Array.from(text.matchAll(pattern), (match) => match[0].replace(/[.!?;:]+$/, ''))
}

export function parseYoutubeUrl(value: string) {
  const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
  const hostname = url.hostname.toLowerCase().replace(/^(www|m)\./, '')
  let sourceType: 'video' | 'short' = 'video'
  let youtubeId: string | null = null

  if (hostname === 'youtu.be') {
    youtubeId = url.pathname.slice(1)
  } else if (hostname === 'youtube.com') {
    if (url.pathname === '/watch') {
      youtubeId = url.searchParams.get('v')
    } else if (url.pathname.startsWith('/shorts/')) {
      sourceType = 'short'
      youtubeId = url.pathname.slice('/shorts/'.length)
    }
  }

  if (!youtubeId || !/^[A-Za-z0-9_-]{11}$/.test(youtubeId)) {
    throw new Error('无效的 YouTube URL')
  }

  return {
    sourceType,
    youtubeId,
    url: sourceType === 'short'
      ? `https://www.youtube.com/shorts/${youtubeId}`
      : `https://www.youtube.com/watch?v=${youtubeId}`,
    taskKey: `${sourceType}:${youtubeId}`,
  }
}
