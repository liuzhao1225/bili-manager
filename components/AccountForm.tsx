'use client'

import { useState, useEffect, useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { createAccount, updateAccount } from '@/app/actions'
import { BiliAccountSummary } from '@/lib/types'
import { Upload, Save, ExternalLink } from 'lucide-react'
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending ? '保存中...' : <><Save className="mr-2 h-4 w-4" /> {label}</>}
    </Button>
  )
}

interface AccountFormProps {
  account?: BiliAccountSummary
  onCancel: () => void
  onSuccess: () => void
}

export function AccountForm({ account, onCancel, onSuccess }: AccountFormProps) {
  const [state, formAction] = useActionState(account ? updateAccount : createAccount, { message: '', success: false })
  const [fileName, setFileName] = useState<string>('')

  // 生成脱敏的 Server Chan Key 显示
  const maskedServerChanKey = account?.has_server_chan_key && account.server_chan_key_suffix
    ? `••••${account.server_chan_key_suffix}`
    : undefined

  useEffect(() => {
    if (state.message) {
      if (state.success) {
        toast.success(state.message)
        onSuccess()
      } else {
        toast.error(state.message)
      }
    }
  }, [state, onSuccess])

  return (
    <form action={formAction} className="space-y-6">
      {account && (
        <input type="hidden" name="dede_user_id" value={account.dede_user_id} />
      )}

      <div className="space-y-2">
        <Label htmlFor="username">用户名</Label>
        <Input
          id="username"
          type="text"
          name="username"
          defaultValue={account?.username}
          required
          placeholder="例如：我的B站大号"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="serverChanKey" className="flex items-center gap-2">
          Server 酱推送密钥 <span className="text-muted-foreground font-normal">(可选)</span>
        </Label>
        {account && maskedServerChanKey ? (
          <div className="space-y-2">
            <div className="px-3 py-2 bg-muted rounded-md text-sm text-muted-foreground font-mono">
              当前密钥: {maskedServerChanKey}
            </div>
            <Input
              id="serverChanKey"
              type="text"
              name="serverChanKey"
              placeholder="留空保持不变，或输入新密钥以替换"
            />
          </div>
        ) : (
          <Input
            id="serverChanKey"
            type="text"
            name="serverChanKey"
            placeholder="SCU..."
          />
        )}
        <p className="text-xs text-muted-foreground">
          💡 如何获取：访问 <a href="https://sct.ftqq.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">
            sct.ftqq.com
            <ExternalLink className="h-3 w-3" />
          </a>，微信扫码登录后，进入 <a href="https://sct.ftqq.com/sendkey" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">
            SendKey 页面
            <ExternalLink className="h-3 w-3" />
          </a> 复制密钥
        </p>
      </div>

      <div className="space-y-2">
        <Label>
          Cookies {account && <span className="text-muted-foreground font-normal ml-2">(可选 - 粘贴或上传以更新)</span>}
        </Label>
        <Textarea
          name="cookieText"
          rows={8}
          placeholder={`# Netscape HTTP Cookie File
.bilibili.com\tTRUE\t/\tFALSE\t1793695705\tDedeUserID\t1263732318
.bilibili.com\tTRUE\t/\tTRUE\t1793695705\tSESSDATA\t...`}
          className="font-mono text-xs"
        />
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          <span>或上传 cookies.txt</span>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="relative border-2 border-dashed border-input hover:bg-accent/50 transition-colors rounded-lg p-6 text-center cursor-pointer">
          <Input
            type="file"
            name="cookieFile"
            accept=".txt"
            className="absolute inset-0 h-full opacity-0 cursor-pointer"
            onChange={(event) => setFileName(event.target.files?.[0]?.name || '')}
          />
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Upload className="h-8 w-8" />
            <span className="text-sm font-medium">
              {fileName || '点击或拖拽上传 cookies.txt 文件'}
            </span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          💡 如何导出：
          <br />
          1. 在 Chrome 浏览器安装 <a 
            href="https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-primary hover:underline inline-flex items-center gap-0.5"
          >
            Get cookies.txt LOCALLY 插件
            <ExternalLink className="h-3 w-3" />
          </a>
          <br />
          2. 访问 <a href="https://www.bilibili.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">bilibili.com</a> 并登录您的账号
          <br />
          3. 点击插件图标，选择 Export 导出 cookies.txt 文件
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" type="button" onClick={onCancel}>
          取消
        </Button>
        <SubmitButton label={account ? '更新' : '创建'} />
      </div>
    </form>
  )
}
