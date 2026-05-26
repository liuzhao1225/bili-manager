'use server'

import { supabase } from '@/lib/supabase'
import { parseNetscapeCookies, validateCookies } from '@/lib/cookie-parser'
import { revalidatePath } from 'next/cache'
import { BiliAccountSummary } from '@/lib/types'

type AccountActionState = {
  message: string
  success: boolean
}

type TaskActionState = {
  message: string
  success: boolean
}

type AccountUpdateData = {
  username: string
  server_chan_key?: string
  buvid3?: string
  sessdata?: string
  bili_jct?: string
}

type ImportAccountInput = {
  cookieText: string
  username?: string
  serverChanKey?: string
}

function getFormString(formData: FormData, name: string) {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

async function readCookieContent(formData: FormData) {
  const pastedCookies = getFormString(formData, 'cookieText')
  if (pastedCookies) return pastedCookies

  const file = formData.get('cookieFile')
  if (file instanceof File && file.size > 0) {
    return file.text()
  }

  return ''
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function parseYoutubeUrl(url: string) {
  const cleanUrl = url.trim().split(/\s+/, 1)[0].split('&', 1)[0]
  const patterns: Array<['video' | 'short', RegExp]> = [
    ['short', /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/],
    ['video', /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/],
    ['video', /(?:https?:\/\/)?youtu\.be\/([A-Za-z0-9_-]{11})/],
  ]

  for (const [sourceType, pattern] of patterns) {
    const match = cleanUrl.match(pattern)
    if (!match) continue

    const youtubeId = match[1]
    return {
      sourceType,
      youtubeId,
      url: sourceType === 'short'
        ? `https://www.youtube.com/shorts/${youtubeId}`
        : `https://www.youtube.com/watch?v=${youtubeId}`,
      taskKey: `${sourceType}:${youtubeId}`,
    }
  }

  throw new Error('无效的 YouTube URL')
}

function getFormInt(formData: FormData, name: string, fallback: number) {
  const parsed = Number.parseInt(getFormString(formData, name), 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function getTaskPriority(formData: FormData, fallback = 1) {
  const value = getFormString(formData, 'priority').toLowerCase()
  const named: Record<string, number> = {
    low: 1,
    medium: 2,
    high: 3,
    force: 4,
  }
  if (value in named) return named[value]
  return getFormInt(formData, 'priority', fallback)
}

function splitTaskUrls(formData: FormData) {
  const text = getFormString(formData, 'urls') || getFormString(formData, 'url')
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function buildTaskPayload(url: string, priority: number, source: string) {
  const parsed = parseYoutubeUrl(url)

  return {
    task_key: parsed.taskKey,
    youtube_id: parsed.youtubeId,
    source_type: parsed.sourceType,
    url: parsed.url,
    priority,
    status: 'queued',
    skip_prechecks: priority >= 4,
    source,
    phase: null,
    locked_by: null,
    locked_until: null,
    failure_reason: null,
    failure_detail: null,
    started_at: null,
    finished_at: null,
  }
}

function parseAccountInput(input: ImportAccountInput) {
  const username = input.username?.trim()
  const serverChanKey = input.serverChanKey?.trim()
  const cookies = parseNetscapeCookies(input.cookieText)
  const validation = validateCookies(cookies)

  if (!validation.valid) {
    return {
      error: `缺少必要的 Cookie 字段: ${validation.missing.join(', ')}`,
      account: null,
    }
  }

  return {
    error: null,
    account: {
      dede_user_id: cookies.dedeuserid!,
      username: username || cookies.dedeuserid!,
      buvid3: cookies.buvid3!,
      sessdata: cookies.sessdata!,
      bili_jct: cookies.bili_jct!,
      server_chan_key: serverChanKey || null,
    },
  }
}

export async function importAccount(input: ImportAccountInput) {
  const parsed = parseAccountInput(input)
  if (parsed.error) {
    return { message: parsed.error, success: false }
  }

  const { error } = await supabase
    .from('bili_account')
    .upsert(parsed.account)

  if (error) {
    console.error('Supabase error:', error)
    return { message: `数据库错误: ${error.message}`, success: false }
  }

  revalidatePath('/')
  return { message: '账号保存成功', success: true }
}

function toAccountSummary(account: {
  dede_user_id: string
  username: string
  bili_jct: string
  server_chan_key: string | null
  created_at?: string
}): BiliAccountSummary {
  return {
    dede_user_id: account.dede_user_id,
    username: account.username,
    has_server_chan_key: Boolean(account.server_chan_key),
    server_chan_key_suffix: account.server_chan_key?.slice(-4),
    bili_jct_prefix: account.bili_jct.slice(0, 6),
    created_at: account.created_at,
  }
}

export async function createAccount(_prevState: AccountActionState, formData: FormData) {
  try {
    const username = getFormString(formData, 'username')
    const serverChanKey = getFormString(formData, 'serverChanKey')
    const cookieContent = await readCookieContent(formData)

    if (!username || !cookieContent) {
      return { message: '缺少 Cookies 或用户名', success: false }
    }

    return importAccount({
      cookieText: cookieContent,
      username,
      serverChanKey,
    })
  } catch (error: unknown) {
    console.error('Unexpected error:', error)
    return { message: `错误: ${getErrorMessage(error)}`, success: false }
  }
}

export async function updateAccount(_prevState: AccountActionState, formData: FormData) {
  try {
    const dede_user_id = getFormString(formData, 'dede_user_id')
    const username = getFormString(formData, 'username')
    const serverChanKey = getFormString(formData, 'serverChanKey')

    if (!dede_user_id || !username) {
      return { message: '缺少 ID 或用户名', success: false }
    }

    const cookieContent = await readCookieContent(formData)
    const updateData: AccountUpdateData = {
      username,
    }

    // 只在用户输入了新密钥时才更新 server_chan_key
    // 如果留空，保持原值不变
    if (serverChanKey && serverChanKey.trim()) {
      updateData.server_chan_key = serverChanKey
    }

    if (cookieContent) {
      const cookies = parseNetscapeCookies(cookieContent)
      const validation = validateCookies(cookies)

      if (!validation.valid) {
        return { 
          message: `缺少必要的 Cookie 字段: ${validation.missing.join(', ')}`, 
          success: false 
        }
      }

      if (cookies.dedeuserid !== dede_user_id) {
        return {
          message: '错误：上传的 Cookies 属于不同的用户 ID，无法更改账号 ID',
          success: false
        }
      }

      updateData.buvid3 = cookies.buvid3
      updateData.sessdata = cookies.sessdata
      updateData.bili_jct = cookies.bili_jct
    }

    const { error } = await supabase
      .from('bili_account')
      .update(updateData)
      .eq('dede_user_id', dede_user_id)

    if (error) {
      return { message: `数据库错误: ${error.message}`, success: false }
    }

    revalidatePath('/')
    return { message: '账号更新成功', success: true }
  } catch (error: unknown) {
    return { message: `错误: ${getErrorMessage(error)}`, success: false }
  }
}

export async function deleteAccount(id: string) {
  const { error } = await supabase
    .from('bili_account')
    .delete()
    .eq('dede_user_id', id)
  
  if (error) throw error
  revalidatePath('/')
}

export async function getAccounts() {
  const { data, error } = await supabase
    .from('bili_account')
    .select('dede_user_id, username, bili_jct, server_chan_key, created_at')
    .order('created_at', { ascending: false })
  
  if (error) throw error
  return data.map(toAccountSummary)
}

export async function createTask(_prevState: TaskActionState, formData: FormData) {
  try {
    const priority = getTaskPriority(formData, 2)
    const source = priority >= 4 ? 'force' : 'manual'
    const urls = splitTaskUrls(formData)

    if (urls.length === 0) {
      return { message: '缺少 YouTube URL', success: false }
    }

    const invalidUrls: string[] = []
    const payloadsByKey = new Map<string, ReturnType<typeof buildTaskPayload>>()
    for (const url of urls) {
      try {
        const payload = buildTaskPayload(url, priority, source)
        payloadsByKey.set(payload.task_key, payload)
      } catch {
        invalidUrls.push(url)
      }
    }

    const payloads = Array.from(payloadsByKey.values())
    const duplicateCount = urls.length - invalidUrls.length - payloads.length
    if (payloads.length === 0) {
      return { message: `没有有效 URL，错误 ${invalidUrls.length} 条`, success: false }
    }

    const { data: existingRows, error: selectError } = await supabase
      .from('youdub_task')
      .select('task_key, status')
      .in('task_key', payloads.map((payload) => payload.task_key))

    if (selectError) {
      return { message: `数据库错误: ${selectError.message}`, success: false }
    }

    const existingStatus = new Map(
      (existingRows || []).map((row) => [row.task_key as string, row.status as string])
    )
    let processingSkipped = 0
    let terminalSkipped = 0
    const writablePayloads = payloads.filter((payload) => {
      const status = existingStatus.get(payload.task_key)
      if (status === 'processing') {
        processingSkipped += 1
        return false
      }
      if (status && ['succeeded', 'failed'].includes(status) && priority < 4) {
        terminalSkipped += 1
        return false
      }
      return true
    })

    if (writablePayloads.length === 0) {
      return {
        message: `没有写入任务；处理中跳过 ${processingSkipped} 条，终态跳过 ${terminalSkipped} 条，无效 ${invalidUrls.length} 条`,
        success: false,
      }
    }

    const { error } = await supabase
      .from('youdub_task')
      .upsert(writablePayloads, { onConflict: 'task_key' })

    if (error) {
      return { message: `数据库错误: ${error.message}`, success: false }
    }

    revalidatePath('/')
    return {
      message: `任务已写入 ${writablePayloads.length} 条，重复 ${duplicateCount} 条，处理中跳过 ${processingSkipped} 条，终态跳过 ${terminalSkipped} 条，无效 ${invalidUrls.length} 条`,
      success: true,
    }
  } catch (error: unknown) {
    return { message: `错误: ${getErrorMessage(error)}`, success: false }
  }
}
