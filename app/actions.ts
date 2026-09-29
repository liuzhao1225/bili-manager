'use server'

import { supabase } from '@/lib/supabase'
import { parseNetscapeCookies, validateCookies } from '@/lib/cookie-parser'
import { decideChannelTask } from '@/lib/channel-task-policy'
import { scanYoutubeChannel, type ChannelVideo } from '@/lib/youtube-channel'
import { extractYoutubeUrls, parseYoutubeUrl } from '@/lib/youtube-url'
import { revalidatePath } from 'next/cache'
import {
  BiliAccountSummary,
  ChannelRequestSummary,
  TaskPriorityCountsResult,
  YoudubPriorityStatusRow,
  YoudubTaskStatus,
} from '@/lib/types'

type AccountActionState = {
  message: string
  success: boolean
}

type TaskActionState = {
  message: string
  success: boolean
}

type ChannelActionState = {
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

type ExistingTaskRow = {
  task_key: string
  status: string
  priority: number | null
}

const TASK_PRIORITY_BUCKETS: Array<
  Pick<YoudubPriorityStatusRow, 'key' | 'label'> & { priority?: number; minPriority?: number }
> = [
  { key: 'low', label: 'Low', priority: 1 },
  { key: 'medium', label: 'Medium', priority: 2 },
  { key: 'high', label: 'High', priority: 3 },
  { key: 'force', label: 'Force+', minPriority: 4 },
]

const TASK_STATUS_BUCKETS: Array<{ key: YoudubTaskStatus; label: string }> = [
  { key: 'queued', label: 'Queued' },
  { key: 'processing', label: 'Processing' },
  { key: 'failed', label: 'Failed' },
  { key: 'succeeded', label: 'Succeeded' },
  { key: 'paused', label: 'Paused' },
]

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

function parseYoutubeChannel(value: string) {
  const input = value.trim().split(/\s+/, 1)[0]
  if (!input) throw new Error('频道不能为空')

  let handle = input
  if (input.startsWith('http://') || input.startsWith('https://')) {
    const url = new URL(input)
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '')
    if (!['youtube.com', 'm.youtube.com'].includes(hostname)) {
      throw new Error('只支持 YouTube 频道链接')
    }
    const segment = url.pathname.split('/').filter(Boolean)[0] || ''
    if (!segment.startsWith('@')) {
      throw new Error('请使用 youtube.com/@频道名 格式')
    }
    handle = decodeURIComponent(segment)
  }

  handle = handle.replace(/^@/, '').trim()
  if (!handle || handle.length > 100 || /[/?#\s]/.test(handle)) {
    throw new Error('无效的 YouTube 频道名')
  }

  return {
    handle: `@${handle}`,
    channelUrl: `https://www.youtube.com/@${handle}`,
    taskKey: `channel:${handle.toLowerCase()}`,
  }
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

function extractTaskUrls(formData: FormData) {
  const text = getFormString(formData, 'urls') || getFormString(formData, 'url')
  return extractYoutubeUrls(text)
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

export async function getTaskPriorityCounts(): Promise<TaskPriorityCountsResult> {
  try {
    const rows = await Promise.all(
      TASK_PRIORITY_BUCKETS.map(async (bucket) => {
        const counts = await Promise.all(
          TASK_STATUS_BUCKETS.map(async (status) => {
            let query = supabase
              .from('youdub_task')
              .select('task_key', { count: 'exact', head: true })
              .eq('status', status.key)
              .or('source.is.null,source.neq.channel_request')

            if (bucket.minPriority !== undefined) {
              query = query.gte('priority', bucket.minPriority)
            } else {
              query = query.eq('priority', bucket.priority)
            }

            const { count, error } = await query
            if (error) throw error

            return {
              key: status.key,
              label: status.label,
              count: count ?? 0,
            }
          })
        )

        return {
          key: bucket.key,
          label: bucket.label,
          counts,
        }
      })
    )

    return {
      rows,
      statuses: TASK_STATUS_BUCKETS,
      fetched_at: new Date().toISOString(),
    }
  } catch (error: unknown) {
    return {
      rows: TASK_PRIORITY_BUCKETS.map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        counts: TASK_STATUS_BUCKETS.map((status) => ({
          key: status.key,
          label: status.label,
          count: 0,
        })),
      })),
      statuses: TASK_STATUS_BUCKETS,
      fetched_at: null,
      error: getErrorMessage(error),
    }
  }
}

export async function getChannelRequests(): Promise<ChannelRequestSummary[]> {
  const { data, error } = await supabase
    .from('youdub_task')
    .select('task_key, url, priority, status, phase, failure_detail, metadata, created_at, started_at, finished_at')
    .eq('source', 'channel_request')
    .order('created_at', { ascending: false })
    .limit(12)

  if (error) throw error
  return (data || []) as ChannelRequestSummary[]
}

function buildChannelTaskPayload(video: ChannelVideo, priority: number, channelUrl: string) {
  return {
    task_key: `${video.sourceType}:${video.id}`,
    youtube_id: video.id,
    source_type: video.sourceType,
    url: video.url,
    priority,
    status: 'queued',
    phase: 'queued',
    skip_prechecks: false,
    source: 'channel_script',
    locked_by: null,
    locked_until: null,
    failure_reason: null,
    failure_detail: null,
    started_at: null,
    finished_at: null,
    zh_bvid: null,
    en_bvid: null,
    metadata: {
      channel_url: channelUrl,
      title: video.title,
      view_count: video.viewCount,
    },
  }
}

async function getExistingTasks(taskKeys: string[]) {
  const tasks = new Map<string, { status: string; priority: number }>()
  for (let start = 0; start < taskKeys.length; start += 500) {
    const { data, error } = await supabase
      .from('youdub_task')
      .select('task_key, status, priority')
      .in('task_key', taskKeys.slice(start, start + 500))
    if (error) throw error
    for (const row of data || []) {
      tasks.set(row.task_key, {
        status: row.status,
        priority: Number(row.priority || 1),
      })
    }
  }
  return tasks
}

async function upsertChannelTasks(
  videos: ChannelVideo[],
  priority: number,
  channelUrl: string,
  requeueExisting: boolean,
) {
  if (!videos.length) return { written: 0, processingSkipped: 0, pausedSkipped: 0, terminalSkipped: 0 }
  const existing = await getExistingTasks(videos.map((video) => `${video.sourceType}:${video.id}`))
  let processingSkipped = 0
  let pausedSkipped = 0
  let terminalSkipped = 0
  const payloads = videos.flatMap((video) => {
    const task = existing.get(`${video.sourceType}:${video.id}`)
    const decision = decideChannelTask(task, priority, requeueExisting)
    if (!decision.write && decision.reason === 'processing') {
      processingSkipped += 1
      return []
    }
    if (!decision.write && decision.reason === 'paused') {
      pausedSkipped += 1
      return []
    }
    if (!decision.write && decision.reason === 'terminal') {
      terminalSkipped += 1
      return []
    }
    if (!decision.write) return []
    return [buildChannelTaskPayload(video, decision.priority, channelUrl)]
  })

  for (let start = 0; start < payloads.length; start += 500) {
    const { error } = await supabase
      .from('youdub_task')
      .upsert(payloads.slice(start, start + 500), { onConflict: 'task_key' })
    if (error) throw error
  }
  return { written: payloads.length, processingSkipped, pausedSkipped, terminalSkipped }
}

export async function createChannelRequest(_prevState: ChannelActionState, formData: FormData) {
  let parsed: ReturnType<typeof parseYoutubeChannel> | null = null
  let startedAt: string | null = null
  let options: { min_view_count: number; requeue_existing: boolean } | null = null
  try {
    parsed = parseYoutubeChannel(getFormString(formData, 'channel'))
    const priority = Math.min(3, Math.max(1, getTaskPriority(formData, 1)))
    const minViewCount = Math.max(0, getFormInt(formData, 'min_view_count', 500_000))
    const requeueExisting = formData.get('requeue_existing') === 'on'
    options = { min_view_count: minViewCount, requeue_existing: requeueExisting }

    const { data: existing, error: selectError } = await supabase
      .from('youdub_task')
      .select('status, phase, locked_until')
      .eq('task_key', parsed.taskKey)
      .maybeSingle()

    if (selectError) {
      return { message: `数据库错误: ${selectError.message}`, success: false }
    }
    if (existing?.status === 'paused' && existing.phase === 'channel_processing') {
      return { message: `${parsed.handle} 正在扫描`, success: false }
    }

    startedAt = new Date().toISOString()
    const processingPayload = {
      task_key: parsed.taskKey,
      youtube_id: parsed.handle.slice(1),
      source_type: 'video',
      url: parsed.channelUrl,
      priority,
      status: 'paused',
      skip_prechecks: false,
      source: 'channel_request',
      phase: 'channel_processing',
      locked_by: null,
      locked_until: null,
      failure_reason: null,
      failure_detail: null,
      zh_bvid: null,
      en_bvid: null,
      metadata: { channel_handle: parsed.handle, ...options },
      created_at: startedAt,
      started_at: startedAt,
      finished_at: null,
    }

    const { error: processingError } = await supabase
      .from('youdub_task')
      .upsert(processingPayload, { onConflict: 'task_key' })

    if (processingError) throw processingError

    const scan = await scanYoutubeChannel(parsed.channelUrl, minViewCount)
    const ordered = scan.videos.toSorted((a, b) => b.viewCount - a.viewCount)
    const topVideo = ordered[0]
    const regularVideos = topVideo ? ordered.slice(1) : []
    const [regularResult, highResult] = await Promise.all([
      upsertChannelTasks(regularVideos, priority, parsed.channelUrl, requeueExisting),
      upsertChannelTasks(topVideo ? [topVideo] : [], 3, parsed.channelUrl, requeueExisting),
    ])

    const importResult = {
      regular: regularResult.written,
      regular_priority: priority,
      high: highResult.written,
      matched: scan.videos.length,
      scanned_videos: scan.scannedVideos,
      scanned_shorts: scan.scannedShorts,
      processing_skipped: regularResult.processingSkipped + highResult.processingSkipped,
      paused_skipped: regularResult.pausedSkipped + highResult.pausedSkipped,
      terminal_skipped: regularResult.terminalSkipped + highResult.terminalSkipped,
    }
    const finishedAt = new Date().toISOString()
    const { error: completeError } = await supabase
      .from('youdub_task')
      .update({
        status: 'succeeded',
        phase: 'channel_completed',
        failure_reason: null,
        failure_detail: null,
        finished_at: finishedAt,
        metadata: {
          channel_handle: parsed.handle,
          channel_id: scan.channelId,
          ...options,
          import_result: importResult,
        },
      })
      .eq('task_key', parsed.taskKey)
    if (completeError) throw completeError

    revalidatePath('/')
    const written = regularResult.written + highResult.written
    const skipped = importResult.processing_skipped + importResult.paused_skipped + importResult.terminal_skipped
    return {
      message: `${parsed.handle} 扫描完成：${scan.scannedVideos} Videos + ${scan.scannedShorts} Shorts，写入 ${written} 条，跳过 ${skipped} 条`,
      success: true,
    }
  } catch (error: unknown) {
    const detail = getErrorMessage(error)
    if (parsed && startedAt && options) {
      const { error: failureError } = await supabase
        .from('youdub_task')
        .update({
          status: 'failed',
          phase: 'channel_failed',
          failure_reason: 'channel_import_failed',
          failure_detail: detail.slice(0, 4000),
          finished_at: new Date().toISOString(),
        })
        .eq('task_key', parsed.taskKey)
      if (failureError) {
        return { message: `频道扫描失败：${detail}；状态写入失败：${failureError.message}`, success: false }
      }
    }
    return { message: `频道扫描失败：${detail}`, success: false }
  }
}

export async function createTask(_prevState: TaskActionState, formData: FormData) {
  try {
    const priority = getTaskPriority(formData, 2)
    const source = priority >= 4 ? 'force' : 'manual'
    const urls = extractTaskUrls(formData)

    if (urls.length === 0) {
      return { message: '未找到 YouTube 链接，请粘贴包含视频链接的文本', success: false }
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
      .select('task_key, status, priority')
      .in('task_key', payloads.map((payload) => payload.task_key))

    if (selectError) {
      return { message: `数据库错误: ${selectError.message}`, success: false }
    }

    const existingTasks = new Map(
      ((existingRows || []) as ExistingTaskRow[]).map((row) => [
        row.task_key,
        {
          status: row.status,
          priority: Number(row.priority ?? 1),
        },
      ])
    )
    let processingSkipped = 0
    let terminalSkipped = 0
    let lowerPrioritySkipped = 0
    const writablePayloads = payloads.filter((payload) => {
      const existing = existingTasks.get(payload.task_key)
      if (!existing) return true

      if (existing.status === 'processing') {
        processingSkipped += 1
        return false
      }
      if (existing.priority > payload.priority) {
        lowerPrioritySkipped += 1
        return false
      }
      if (['succeeded', 'failed'].includes(existing.status) && payload.priority < 4) {
        terminalSkipped += 1
        return false
      }
      return true
    })

    if (writablePayloads.length === 0) {
      return {
        message: `没有写入任务；处理中跳过 ${processingSkipped} 条，终态跳过 ${terminalSkipped} 条，优先级较低跳过 ${lowerPrioritySkipped} 条，无效 ${invalidUrls.length} 条`,
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
      message: `任务已写入 ${writablePayloads.length} 条，重复 ${duplicateCount} 条，处理中跳过 ${processingSkipped} 条，终态跳过 ${terminalSkipped} 条，优先级较低跳过 ${lowerPrioritySkipped} 条，无效 ${invalidUrls.length} 条`,
      success: true,
    }
  } catch (error: unknown) {
    return { message: `错误: ${getErrorMessage(error)}`, success: false }
  }
}
