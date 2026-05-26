'use client'

import { useActionState, useEffect } from 'react'
import { useFormStatus } from 'react-dom'
import { createTask } from '@/app/actions'
import { PlusCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'

const PRIORITY_OPTIONS = [
  { value: 'force', label: 'Force' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

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
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {PRIORITY_OPTIONS.map((option) => (
        <label key={option.value} className="cursor-pointer">
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
      ))}
    </div>
  )
}

export function TaskManager() {
  const [state, formAction] = useActionState(createTask, { message: '', success: false })

  useEffect(() => {
    if (!state.message) return
    if (state.success) {
      toast.success(state.message)
      return
    }
    toast.error(state.message)
  }, [state])

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
    </section>
  )
}
