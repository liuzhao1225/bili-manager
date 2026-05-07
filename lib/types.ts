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
