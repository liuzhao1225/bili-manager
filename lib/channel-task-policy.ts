export type ExistingChannelTask = {
  status: string
  priority: number
} | undefined

export type ChannelTaskDecision =
  | { write: true; priority: number }
  | { write: false; reason: 'processing' | 'paused' | 'terminal' }

export function decideChannelTask(
  existing: ExistingChannelTask,
  requestedPriority: number,
  requeueExisting: boolean,
): ChannelTaskDecision {
  if (existing?.status === 'processing') return { write: false, reason: 'processing' }
  if (existing?.status === 'paused') return { write: false, reason: 'paused' }
  if (!requeueExisting && (existing?.status === 'succeeded' || existing?.status === 'failed')) {
    return { write: false, reason: 'terminal' }
  }
  return { write: true, priority: Math.max(requestedPriority, existing?.priority || 1) }
}
