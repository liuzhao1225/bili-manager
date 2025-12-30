import { BiliCookies } from './types'

export function parseNetscapeCookies(content: string): Partial<BiliCookies> {
  const cookies: Record<string, string> = {}
  const lines = content.split('\n')

  for (const line of lines) {
    if (line.startsWith('#') || !line.trim()) continue
    
    const parts = line.split('\t')
    if (parts.length >= 7) {
      const key = parts[5]
      const value = parts[6]
      cookies[key] = value.trim()
    }
  }

  return {
    buvid3: cookies['buvid3'],
    sessdata: cookies['SESSDATA'],
    bili_jct: cookies['bili_jct'],
    dedeuserid: cookies['DedeUserID'],
  }
}

export function validateCookies(cookies: Partial<BiliCookies>): { valid: boolean; missing: string[] } {
  const missing: string[] = []
  if (!cookies.buvid3) missing.push('buvid3')
  if (!cookies.sessdata) missing.push('SESSDATA')
  if (!cookies.bili_jct) missing.push('bili_jct')
  if (!cookies.dedeuserid) missing.push('DedeUserID')

  return {
    valid: missing.length === 0,
    missing
  }
}

