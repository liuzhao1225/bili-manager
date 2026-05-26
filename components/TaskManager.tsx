'use client'

import { useActionState, useEffect, useMemo, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { createTask, pauseTask, requeueTask, updateTaskPriority } from '@/app/actions'
import { YoudubTaskStatus, YoudubTaskSummary } from '@/lib/types'
import { AlertCircle, ExternalLink, PauseCircle, PlusCircle, RotateCcw, Save } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

const STATUS_FILTERS: Array<YoudubTaskStatus | 'all'> = [
  'all',
  'queued',
  'processing',
  'failed',
  'succeeded',
  'paused',
]

const SOURCE_OPTIONS = ['force', 'manual', 'subscribed', 'bili_monitor', 'channel_script', 'import']

function statusVariant(status: YoudubTaskStatus) {
  if (status === 'failed') return 'destructive'
  if (status === 'succeeded') return 'secondary'
  return 'outline'
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      <PlusCircle className="mr-2 h-4 w-4" />
      {pending ? '写入中...' : '添加任务'}
    </Button>
  )
}

function TaskStats({ tasks }: { tasks: YoudubTaskSummary[] }) {
  const counts = useMemo(() => {
    return tasks.reduce<Record<string, number>>((acc, task) => {
      acc[task.status] = (acc[task.status] || 0) + 1
      return acc
    }, {})
  }, [tasks])

  return (
    <div className="flex flex-wrap gap-2 text-sm">
      {STATUS_FILTERS.filter((status) => status !== 'all').map((status) => (
        <Badge key={status} variant="secondary" className="font-normal">
          {status}: {counts[status] || 0}
        </Badge>
      ))}
    </div>
  )
}

function TaskRow({ task }: { task: YoudubTaskSummary }) {
  const canPause = task.status === 'queued'

  return (
    <tr className="border-b last:border-0">
      <td className="w-[120px] px-3 py-3 align-top">
        <div className="space-y-2">
          <Badge variant={statusVariant(task.status)}>{task.status}</Badge>
          <div className="text-xs text-muted-foreground">eff {task.effective_priority}</div>
        </div>
      </td>
      <td className="min-w-[260px] px-3 py-3 align-top">
        <div className="space-y-1">
          <a
            href={task.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex max-w-[320px] items-center gap-1 truncate font-mono text-sm text-primary hover:underline"
            title={task.url}
          >
            {task.task_key}
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>{task.source || 'unknown'}</span>
            <span>{task.source_type}</span>
            {task.skip_prechecks && <span>skip prechecks</span>}
            <span>attempt {task.attempt_count}</span>
          </div>
        </div>
      </td>
      <td className="min-w-[170px] px-3 py-3 align-top text-sm">
        <div className="space-y-1">
          <div className="font-medium">{task.phase || '-'}</div>
          <div className="text-xs text-muted-foreground">
            {task.locked_by ? `lock ${task.locked_by}` : 'no lock'}
          </div>
        </div>
      </td>
      <td className="min-w-[260px] px-3 py-3 align-top text-sm">
        {task.failure_reason ? (
          <div className="flex gap-2 text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="max-w-[360px] space-y-1">
              <div className="break-words">{task.failure_reason}</div>
              {task.failure_detail && (
                <div className="line-clamp-2 break-words text-xs text-muted-foreground">
                  {task.failure_detail}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-muted-foreground">-</div>
        )}
      </td>
      <td className="min-w-[210px] px-3 py-3 align-top">
        <form action={updateTaskPriority} className="flex items-center gap-2">
          <input type="hidden" name="task_key" value={task.task_key} />
          <Input
            name="priority"
            type="number"
            min="-1"
            defaultValue={task.priority}
            className="h-8 w-20"
          />
          <Button type="submit" variant="outline" size="icon" className="h-8 w-8">
            <Save className="h-4 w-4" />
            <span className="sr-only">保存优先级</span>
          </Button>
        </form>
        <div className="mt-2 flex gap-2">
          <form action={requeueTask}>
            <input type="hidden" name="task_key" value={task.task_key} />
            <input type="hidden" name="priority" value={task.priority} />
            <Button type="submit" variant="outline" size="sm">
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              重排
            </Button>
          </form>
          {canPause && (
            <form action={pauseTask}>
              <input type="hidden" name="task_key" value={task.task_key} />
              <Button type="submit" variant="outline" size="sm">
                <PauseCircle className="mr-1.5 h-3.5 w-3.5" />
                暂停
              </Button>
            </form>
          )}
        </div>
      </td>
    </tr>
  )
}

export function TaskManager({ tasks }: { tasks: YoudubTaskSummary[] }) {
  const [state, formAction] = useActionState(createTask, { message: '', success: false })
  const [filter, setFilter] = useState<YoudubTaskStatus | 'all'>('all')

  useEffect(() => {
    if (!state.message) return
    if (state.success) {
      toast.success(state.message)
      return
    }
    toast.error(state.message)
  }, [state])

  const visibleTasks = useMemo(() => {
    if (filter === 'all') return tasks
    return tasks.filter((task) => task.status === filter)
  }, [filter, tasks])

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold tracking-tight">YouDub 任务队列</h2>
          <TaskStats tasks={tasks} />
        </div>

        <form action={formAction} className="grid gap-3 rounded-md border p-3 lg:grid-cols-[minmax(280px,420px)_96px_150px_auto_auto] lg:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="task-url">YouTube URL</Label>
            <Input id="task-url" name="url" placeholder="https://www.youtube.com/watch?v=..." required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-priority">Priority</Label>
            <Input id="task-priority" name="priority" type="number" defaultValue={4} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-source">Source</Label>
            <select
              id="task-source"
              name="source"
              defaultValue="force"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {SOURCE_OPTIONS.map((source) => (
                <option key={source} value={source}>{source}</option>
              ))}
            </select>
          </div>
          <label className="flex h-9 items-center gap-2 text-sm">
            <input name="skip_prechecks" type="checkbox" defaultChecked className="h-4 w-4" />
            跳过前置检查
          </label>
          <SubmitButton />
        </form>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((status) => (
          <Button
            key={status}
            type="button"
            variant={filter === status ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(status)}
          >
            {status}
          </Button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-left">
          <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Task</th>
              <th className="px-3 py-2 font-medium">Phase</th>
              <th className="px-3 py-2 font-medium">Failure</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleTasks.length > 0 ? (
              visibleTasks.map((task) => <TaskRow key={task.task_key} task={task} />)
            ) : (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  暂无任务
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
