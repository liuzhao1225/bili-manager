'use client'

import { useActionState, useCallback, useEffect, useState, useTransition } from 'react'
import { useFormStatus } from 'react-dom'
import { createTask, getTaskPriorityCounts } from '@/app/actions'
import { PlusCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { TaskPriorityCountsResult, YoudubPriorityCount } from '@/lib/types'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { toast } from 'sonner'

const PRIORITY_OPTIONS = [
  { value: 'force', label: 'Force', description: '强制发布。跳过时长、敏感性、屏蔽频道和已发布检查，适合明确要重新跑完整流程并重新上传的任务。' },
  { value: 'high', label: 'High', description: '高优先级。适合订阅频道或明确高价值来源，会优先于普通任务处理。' },
  { value: 'medium', label: 'Medium', description: '中优先级。默认选择，适合手动批量添加或 B 站监控发现的候选视频。' },
  { value: 'low', label: 'Low', description: '低优先级。适合普通候选、补充素材或不急于处理的视频。' },
]

const AUTO_REFRESH_MS = 30 * 60 * 1000
const NUMBER_FORMATTER = new Intl.NumberFormat('zh-CN')

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      <PlusCircle className="mr-2 h-4 w-4" />
      {pending ? '写入中...' : '添加任务'}
    </Button>
  )
}

function PriorityCapsules() {
  return (
    <TooltipProvider>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PRIORITY_OPTIONS.map((option) => (
          <Tooltip key={option.value}>
            <TooltipTrigger asChild>
              <label className="cursor-pointer">
                <input
                  type="radio"
                  name="priority"
                  value={option.value}
                  defaultChecked={option.value === 'medium'}
                  className="peer sr-only"
                />
                <span className="flex h-9 items-center justify-center rounded-full border px-3 text-sm font-medium text-muted-foreground transition-[color,background,border-color,box-shadow] peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-ring/50 peer-focus-visible:ring-[3px]">
                  {option.label}
                </span>
              </label>
            </TooltipTrigger>
            <TooltipContent>{option.description}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  )
}

function formatFetchedAt(value: string | null) {
  if (!value) return '未刷新'
  return new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function PriorityCountTile({ item }: { item: YoudubPriorityCount }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="text-xs font-medium text-muted-foreground">{item.label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">
        {NUMBER_FORMATTER.format(item.count)}
      </div>
    </div>
  )
}

function PriorityCountsPanel({
  result,
  isRefreshing,
  onRefresh,
}: {
  result: TaskPriorityCountsResult | null
  isRefreshing: boolean
  onRefresh: () => void
}) {
  const counts = result?.counts ?? []

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Priority Tasks</h3>
          <div className="text-xs text-muted-foreground">
            Updated {formatFetchedAt(result?.fetched_at ?? null)}
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing}>
          <RefreshCw className="mr-2 h-4 w-4" />
          {isRefreshing ? '刷新中...' : '刷新'}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {counts.length > 0 ? (
          counts.map((item) => <PriorityCountTile key={item.key} item={item} />)
        ) : (
          PRIORITY_OPTIONS.map((option) => (
            <PriorityCountTile key={option.value} item={{ key: option.value as YoudubPriorityCount['key'], label: option.label, count: 0 }} />
          ))
        )}
      </div>

      {result?.error ? (
        <div className="text-xs text-destructive">刷新失败：{result.error}</div>
      ) : null}
    </div>
  )
}

export function TaskManager() {
  const [state, formAction] = useActionState(createTask, { message: '', success: false })
  const [countsResult, setCountsResult] = useState<TaskPriorityCountsResult | null>(null)
  const [isRefreshing, startRefreshTransition] = useTransition()

  const refreshCounts = useCallback(() => {
    startRefreshTransition(() => {
      void getTaskPriorityCounts().then((result) => {
        setCountsResult(result)
        if (result.error) {
          toast.error(`刷新 priority 统计失败：${result.error}`)
        }
      })
    })
  }, [])

  useEffect(() => {
    refreshCounts()
    const timer = window.setInterval(refreshCounts, AUTO_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [refreshCounts])

  useEffect(() => {
    if (!state.message) return
    if (state.success) {
      toast.success(state.message)
      refreshCounts()
      return
    }
    toast.error(state.message)
  }, [state, refreshCounts])

  return (
    <section className="max-w-3xl space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Add YouDub Tasks</h2>
      </div>

      <form action={formAction} className="space-y-4 rounded-md border p-4">
        <div className="space-y-1.5">
          <Label htmlFor="task-urls">YouTube URLs</Label>
          <Textarea
            id="task-urls"
            name="urls"
            rows={10}
            required
            className="min-h-64 font-mono text-xs"
            placeholder={[
              'https://www.youtube.com/watch?v=XBu54nfzxAQ',
              'https://www.youtube.com/watch?v=rbu7Zu5X1zI',
              'https://www.youtube.com/watch?v=zjkBMFhNj_g',
              'https://www.youtube.com/watch?v=kYkIdXwW2AE',
            ].join('\n')}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Priority</Label>
          <PriorityCapsules />
        </div>

        <div className="flex justify-end">
          <SubmitButton />
        </div>
      </form>

      <PriorityCountsPanel
        result={countsResult}
        isRefreshing={isRefreshing}
        onRefresh={refreshCounts}
      />
    </section>
  )
}
