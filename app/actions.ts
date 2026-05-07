'use server'

import { supabase } from '@/lib/supabase'
import { parseNetscapeCookies, validateCookies } from '@/lib/cookie-parser'
import { revalidatePath } from 'next/cache'
import { BiliAccountSummary } from '@/lib/types'

type AccountActionState = {
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
