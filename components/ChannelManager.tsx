'use client'

import { useActionState, useCallback, useEffect, useState, useTransition } from 'react'
import { useFormStatus } from 'react-dom'
import { ArrowRight, Clapperboard, PlusCircle, RefreshCw, Youtube } from 'lucide-react'
import { createChannelRequest, getChannelRequests } from '@/app/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ChannelRequestSummary } from '@/lib/types'
import { toast } from 'sonner'

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      <PlusCircle className="mr-2 h-4 w-4" />
      {pending ? '加入中...' : '添加频道'}
    </Button>
  )
}

function statusLabel(request: ChannelRequestSummary) {
  if (request.status === 'succeeded') return '已完成'
  if (request.status === 'failed') return '失败'
  if (request.phase === 'channel_processing') return '扫描中'
  return '排队中'
}

function statusClass(request: ChannelRequestSummary) {
  if (request.status === 'succeeded') return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
  if (request.status === 'failed') return 'bg-destructive/10 text-destructive'
  if (request.phase === 'channel_processing') return 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
  return 'bg-muted text-muted-foreground'
}

function formatTime(value?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function ChannelManager({ initialRequests }: { initialRequests: ChannelRequestSummary[] }) {
  const [state, formAction] = useActionState(createChannelRequest, { message: '', success: false })
  const [requests, setRequests] = useState(initialRequests)
  const [isRefreshing, startRefresh] = useTransition()

  const refresh = useCallback(() => {
    startRefresh(() => {
      void getChannelRequests()
        .then(setRequests)
        .catch((error: unknown) => toast.error(`刷新频道状态失败：${String(error)}`))
    })
  }, [])

  useEffect(() => {
    if (!state.message) return
    if (state.success) {
      toast.success(state.message)
      refresh()
      return
    }
    toast.error(state.message)
  }, [state, refresh])

  useEffect(() => {
    const hasActiveRequest = requests.some((request) => request.status === 'paused')
    if (!hasActiveRequest) return
    const timer = window.setInterval(refresh, 10_000)
    return () => window.clearInterval(timer)
  }, [requests, refresh])

  return (
    <section className="max-w-3xl space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Add YouTube Channel</h2>
        <p className="text-sm text-muted-foreground">
          扫描频道的 Videos 和 Shorts，把达到播放量门槛的视频加入 YouDub 队列。
        </p>
      </div>

      <div className="overflow-hidden rounded-md border">
        <div className="flex flex-wrap items-center gap-3 border-b bg-muted/40 px-4 py-3 text-sm">
          <span className="inline-flex items-center gap-2 rounded-full bg-background px-3 py-1 font-mono shadow-sm ring-1 ring-border">
            <Youtube className="h-4 w-4 text-red-500" />
            @channel
          </span>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <span className="inline-flex items-center gap-2 font-medium">
            <Clapperboard className="h-4 w-4" />
            Videos + Shorts
          </span>
        </div>

        <form action={formAction} className="space-y-5 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="channel-url">频道链接或 @handle</Label>
            <Input
              id="channel-url"
              name="channel"
              required
              placeholder="https://www.youtube.com/@Mr.Death.Official"
              className="font-mono"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
            <div className="space-y-1.5">
              <Label>普通候选优先级</Label>
              <div className="grid grid-cols-3 gap-2">
                {PRIORITIES.map((option) => (
                  <label key={option.value} className="cursor-pointer">
                    <input
                      type="radio"
                      name="priority"
                      value={option.value}
                      defaultChecked={option.value === 'low'}
                      className="peer sr-only"
                    />
                    <span className="flex h-9 items-center justify-center rounded-full border px-3 text-sm font-medium text-muted-foreground transition-[color,background,border-color,box-shadow] peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-ring/50 peer-focus-visible:ring-[3px]">
                      {option.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="min-view-count">最低播放量</Label>
              <Input
                id="min-view-count"
                name="min_view_count"
                type="number"
                min="0"
                step="10000"
                defaultValue="500000"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <input name="requeue_existing" type="checkbox" className="h-4 w-4 rounded border" />
              重新加入已完成或失败的视频
            </label>
            <SubmitButton />
          </div>

          <p className="text-xs text-muted-foreground">
            Shorts 门槛为普通视频的 10 倍；最高播放量候选使用 High。Processing、Paused 和终态任务默认跳过。
          </p>
        </form>
      </div>

      <div className="rounded-md border">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold">最近添加的频道</h3>
            <p className="text-xs text-muted-foreground">排队和扫描状态每 10 秒自动刷新</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={isRefreshing}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {isRefreshing ? '刷新中...' : '刷新'}
          </Button>
        </div>

        {requests.length ? (
          <div className="divide-y">
            {requests.map((request) => {
              const result = request.metadata?.import_result
              const regularWritten = Number(result?.regular ?? result?.low ?? 0)
              return (
                <div key={request.task_key} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 space-y-1">
                    <a
                      href={request.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate font-mono text-sm font-medium hover:underline"
                    >
                      {request.metadata?.channel_handle || request.url}
                    </a>
                    <div className="text-xs text-muted-foreground">
                      {formatTime(request.created_at)}
                      {result ? ` · 写入 ${regularWritten + Number(result.high || 0)} 条` : ''}
                      {result ? ` · 跳过 ${Number(result.processing_skipped || 0) + Number(result.paused_skipped || 0) + Number(result.terminal_skipped || 0)} 条` : ''}
                    </div>
                    {request.status === 'failed' && request.failure_detail ? (
                      <p className="max-w-xl text-xs text-destructive">{request.failure_detail}</p>
                    ) : null}
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(request)}`}>
                    {statusLabel(request)}
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">还没有添加频道</p>
        )}
      </div>
    </section>
  )
}
