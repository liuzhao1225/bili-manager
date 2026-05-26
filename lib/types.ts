export type BiliAccount = {
  dede_user_id: string
  username: string
  buvid3: string
  sessdata: string
  bili_jct: string
  server_chan_key?: string
  created_at?: string
}

export type BiliAccountSummary = {
  dede_user_id: string
  username: string
  has_server_chan_key: boolean
  server_chan_key_suffix?: string
  bili_jct_prefix: string
  created_at?: string
}

export type BiliCookies = {
  buvid3: string
  sessdata: string
  bili_jct: string
  dedeuserid: string
}

export type YoudubTaskStatus = 'queued' | 'processing' | 'succeeded' | 'failed' | 'paused'

export type YoudubTaskSummary = {
  task_key: string
  youtube_id: string
  source_type: 'video' | 'short'
  url: string
  priority: number
  effective_priority: number
  status: YoudubTaskStatus
  skip_prechecks: boolean
  source?: string | null
  phase?: string | null
  attempt_count: number
  locked_by?: string | null
  locked_until?: string | null
  failure_reason?: string | null
  failure_detail?: string | null
  zh_bvid?: string | null
  en_bvid?: string | null
  created_at?: string
  updated_at?: string
  started_at?: string | null
  finished_at?: string | null
}
