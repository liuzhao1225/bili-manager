'use server'

import { supabase } from '@/lib/supabase'
import { parseNetscapeCookies, validateCookies } from '@/lib/cookie-parser'
import { revalidatePath } from 'next/cache'
import { BiliAccountSummary, YoudubTaskSummary } from '@/lib/types'

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
  const patterns: Array<[YoudubTaskSummary['source_type'], RegExp]> = [
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

function buildTaskPayload(formData: FormData) {
  const url = getFormString(formData, 'url')
  const priority = getFormInt(formData, 'priority', 1)
  const parsed = parseYoutubeUrl(url)
  const requestedSource = getFormString(formData, 'source')
  const source = requestedSource || (priority >= 4 ? 'force' : 'manual')
  const skipPrechecks = formData.get('skip_prechecks') === 'on' || priority >= 4

  return {
    task_key: parsed.taskKey,
    youtube_id: parsed.youtubeId,
    source_type: parsed.sourceType,
    url: parsed.url,
    priority,
    status: 'queued',
    skip_prechecks: skipPrechecks,
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

function toTaskSummary(task: YoudubTaskSummary): YoudubTaskSummary {
  return {
    ...task,
    priority: Number(task.priority || 1),
    effective_priority: Number(task.effective_priority ?? task.priority ?? 1),
    attempt_count: Number(task.attempt_count || 0),
  }
}

export async function getTasks() {
  const { data, error } = await supabase
    .from('youdub_task')
    .select('task_key, youtube_id, source_type, url, priority, effective_priority, status, skip_prechecks, source, phase, attempt_count, locked_by, locked_until, failure_reason, failure_detail, zh_bvid, en_bvid, created_at, updated_at, started_at, finished_at')
    .order('effective_priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(200)

  if (error) {
    if ('code' in error && error.code !== 'PGRST205') {
      console.error('Task query error:', error)
    }
    return []
  }

  return (data || []).map((task) => toTaskSummary(task as YoudubTaskSummary))
}

export async function createTask(_prevState: TaskActionState, formData: FormData) {
  try {
    const payload = buildTaskPayload(formData)

    const { data: existing, error: selectError } = await supabase
      .from('youdub_task')
      .select('task_key, status')
      .eq('task_key', payload.task_key)
      .maybeSingle()

    if (selectError) {
      return { message: `数据库错误: ${selectError.message}`, success: false }
    }

    if (existing?.status === 'processing') {
      return { message: '任务正在处理中，未覆盖当前锁定任务', success: false }
    }

    if (
      existing?.status &&
      ['succeeded', 'failed'].includes(existing.status) &&
      payload.priority < 4
    ) {
      return { message: '任务已有终态记录；请使用重新排队，或用 priority>=4 强制发布', success: false }
    }

    const { error } = await supabase
      .from('youdub_task')
      .upsert(payload, { onConflict: 'task_key' })

    if (error) {
      return { message: `数据库错误: ${error.message}`, success: false }
    }

    revalidatePath('/')
    return { message: `任务已写入: ${payload.task_key}`, success: true }
  } catch (error: unknown) {
    return { message: `错误: ${getErrorMessage(error)}`, success: false }
  }
}

export async function updateTaskPriority(formData: FormData) {
  const taskKey = getFormString(formData, 'task_key')
  const priority = getFormInt(formData, 'priority', 1)
  const { error } = await supabase
    .from('youdub_task')
    .update({
      priority,
      skip_prechecks: priority >= 4,
    })
    .eq('task_key', taskKey)

  if (error) throw error
  revalidatePath('/')
}

export async function requeueTask(formData: FormData) {
  const taskKey = getFormString(formData, 'task_key')
  const priority = getFormInt(formData, 'priority', 1)
  const { error } = await supabase
    .from('youdub_task')
    .update({
      priority,
      status: 'queued',
      skip_prechecks: priority >= 4,
      phase: null,
      locked_by: null,
      locked_until: null,
      failure_reason: null,
      failure_detail: null,
      started_at: null,
      finished_at: null,
    })
    .eq('task_key', taskKey)

  if (error) throw error
  revalidatePath('/')
}

export async function pauseTask(formData: FormData) {
  const taskKey = getFormString(formData, 'task_key')
  const { error } = await supabase
    .from('youdub_task')
    .update({
      status: 'paused',
      locked_by: null,
      locked_until: null,
    })
    .eq('task_key', taskKey)

  if (error) throw error
  revalidatePath('/')
}
