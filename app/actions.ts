'use server'

import { supabase } from '@/lib/supabase'
import { parseNetscapeCookies, validateCookies } from '@/lib/cookie-parser'
import { revalidatePath } from 'next/cache'

export async function createAccount(prevState: any, formData: FormData) {
  try {
    const file = formData.get('cookieFile') as File
    const username = formData.get('username') as string
    const serverChanKey = formData.get('serverChanKey') as string

    if (!file || !username) {
      return { message: '缺少文件或用户名', success: false }
    }

    const text = await file.text()
    const cookies = parseNetscapeCookies(text)
    const validation = validateCookies(cookies)

    if (!validation.valid) {
      return { 
        message: `缺少必要的 Cookie 字段: ${validation.missing.join(', ')}`, 
        success: false 
      }
    }

    const { error } = await supabase
      .from('bili_account')
      .upsert({
        dede_user_id: cookies.dedeuserid!,
        username,
        buvid3: cookies.buvid3!,
        sessdata: cookies.sessdata!,
        bili_jct: cookies.bili_jct!,
        server_chan_key: serverChanKey || null,
      })

    if (error) {
      console.error('Supabase error:', error)
      return { message: `数据库错误: ${error.message}`, success: false }
    }

    revalidatePath('/')
    return { message: '账号保存成功', success: true }
  } catch (e: any) {
    console.error('Unexpected error:', e)
    return { message: `错误: ${e.message}`, success: false }
  }
}

export async function updateAccount(prevState: any, formData: FormData) {
  try {
    const dede_user_id = formData.get('dede_user_id') as string
    const username = formData.get('username') as string
    const serverChanKey = formData.get('serverChanKey') as string

    if (!dede_user_id || !username) {
      return { message: '缺少 ID 或用户名', success: false }
    }

    const file = formData.get('cookieFile') as File | null
    
    const updateData: any = {
      username,
    }

    // 只在用户输入了新密钥时才更新 server_chan_key
    // 如果留空，保持原值不变
    if (serverChanKey && serverChanKey.trim()) {
      updateData.server_chan_key = serverChanKey
    }

    // Process cookies if file is uploaded
    if (file && file.size > 0) {
      const text = await file.text()
      const cookies = parseNetscapeCookies(text)
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
  } catch (e: any) {
    return { message: `错误: ${e.message}`, success: false }
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
    .select('*')
    .order('created_at', { ascending: false })
  
  if (error) throw error
  return data
}

