import type { Run, RunCheckpoint, RunStep } from '../types.ts'

export function initialCheckpoint(limit: number): RunCheckpoint {
  return { version: 1, idx: 0, count: 0, limit, rounds: {}, feedback: {}, history: {}, lastOwn: {}, lastMedia: {} }
}

/** Exact for checkpointed runs; conservative reconstruction for older records. */
export function restoreCheckpoint(run: Run): RunCheckpoint {
  if (run.checkpoint?.version === 1) return structuredClone(run.checkpoint)
  const cp = initialCheckpoint(run.snapshot.maxSteps)
  cp.legacy = true
  const stages = run.snapshot.stages
  for (const step of run.steps) {
    const at = stages.findIndex(s => s.id === step.stageId)
    if (at < 0) continue
    cp.rounds[step.stageId + ':in'] = Math.max(cp.rounds[step.stageId + ':in'] ?? 0, step.round)
    if (step.status !== 'done' && !(step.kind === 'action' && step.note?.startsWith('Continuing:'))) {
      cp.idx = at
      cp.pendingStepId = step.id
      continue
    }
    cp.pendingStepId = undefined
    cp.idx = at + 1
    if (step.kind !== 'review') {
      cp.prevId = step.status === 'done' ? step.id : cp.prevId
      if (step.status === 'done') {
        cp.lastOwn[step.stageId] = step.content
        if (step.media?.length) cp.lastMedia[step.stageId] = step.media
        cp.feedback[step.stageId] = undefined
        cp.reviewNote = undefined
      }
    }
    const back = step.review?.decision?.choice === 'back' ? step.review.decision.to : step.next?.startsWith('Sent back to') ? stages[at].loop?.to : undefined
    const target = stages.findIndex(s => s.id === back)
    if (target >= 0) {
      const round = cp.rounds[step.stageId] = (cp.rounds[step.stageId] ?? 0) + 1
      const prev = run.steps.find(s => s.id === cp.prevId)
      cp.feedback[stages[target].id] = {
        from: step.stageName, model: step.kind === 'review' ? 'a person' : step.modelLabel,
        text: step.content || 'Please revise and improve this.', round,
        stepId: step.kind === 'review' && prev && prev.stageId === back ? prev.id : step.id,
      }
      cp.idx = target
      cp.reviewNote = undefined
    } else if (step.kind === 'review' && step.content) {
      cp.reviewNote = [cp.reviewNote, step.content].filter(Boolean).join('\n\n')
    }
  }
  return cp
}

export function resumeStage(run: Run) {
  return run.snapshot.stages[(run.checkpoint ?? restoreCheckpoint(run)).idx]
}

export function isResumable(run: Run): boolean {
  return (['budget', 'stopped', 'limit', 'error'].includes(run.status) || (run.status === 'done' && !!run.error)) && !!resumeStage(run)
}

export function retryRisk(run: Run): boolean {
  const cp = run.checkpoint ?? restoreCheckpoint(run)
  const stage = run.snapshot.stages[cp.idx]
  const step = run.steps.find(s => s.id === cp.pendingStepId)
  if (!stage || !step || step.status === 'done') return false
  return stage.kind === 'action' || !!stage.appTools?.length || !!stage.mcpIds.length || !!step.tools.length
}

export interface ResumeOptions {
  extraTokens: number
  maxSteps: number
  stageBudget: number
  acknowledgeRetry?: boolean
  /** Send a finished stage round again with a note, instead of carrying on. */
  rerun?: RerunRequest
}

/** A comment a person leaves on a finished step, to improve what it produced. */
export interface RerunRequest {
  stepId: string
  comment: string
}

/**
 * A step worth commenting on: one that finished and whose stage reads
 * feedback. Model, media and decision stages all do; an app action has no
 * prompt to put a note in, and a review step is the person's own words.
 */
export function canRerunStep(step: RunStep): boolean {
  return step.status === 'done' && step.kind !== 'review' && step.kind !== 'action' && !!(step.content || step.media?.length)
}

export function isRerunnable(run: Run): boolean {
  return run.status !== 'running' && run.steps.some(canRerunStep)
}

/**
 * Re-enters the commented step's stage with the note in the same slot a
 * reviewer's comment uses, so the model also sees its own previous version.
 * Later steps stay in the timeline as history, exactly as a loop round leaves
 * them; the stage's next step is numbered one round higher.
 */
function applyRerun(cp: RunCheckpoint, run: Run, rerun: RerunRequest): void {
  const comment = rerun.comment.trim()
  if (!comment) throw new Error('Write what should change before rerunning.')
  const step = run.steps.find(s => s.id === rerun.stepId)
  if (!step) throw new Error('That step is no longer part of this run.')
  if (!canRerunStep(step)) throw new Error('Only a finished model, media or decision step can be rerun with a comment.')
  const at = run.snapshot.stages.findIndex(s => s.id === step.stageId)
  if (at < 0) throw new Error('That step’s stage is no longer part of this circuit.')
  // An interrupted attempt elsewhere must not leak into this one.
  cp.pendingStepId = undefined
  cp.request = undefined
  cp.mediaProgress = undefined
  cp.reviewNote = undefined
  cp.idx = at
  cp.feedback[step.stageId] = {
    from: 'You',
    model: 'a person',
    text: comment,
    round: (cp.rounds[step.stageId + ':in'] ?? step.round) + 1,
    stepId: step.id,
  }
  // What the stage read last time: the newest finished output before it.
  const earlier = run.steps.slice(0, run.steps.indexOf(step)).filter(s => s.status === 'done' && s.kind !== 'review' && !!s.content)
  cp.prevId = earlier[earlier.length - 1]?.id
  if (step.content) cp.lastOwn[step.stageId] = step.content
  if (step.media?.length) cp.lastMedia[step.stageId] = step.media
}

export function prepareResume(run: Run, options: ResumeOptions): Run {
  if (options.rerun) {
    // A rerun also works on a run that finished cleanly: that is the point.
    if (run.status === 'running') throw new Error('Wait for this run to stop before rerunning a stage.')
  } else {
    if (!isResumable(run)) throw new Error('This run has no unfinished stage to resume.')
    if (retryRisk(run) && !options.acknowledgeRetry) throw new Error('Confirm that retrying the interrupted action or tools is safe before resuming.')
  }
  for (const [name, value] of [['Extra tokens', options.extraTokens], ['Stage stop-loss', options.stageBudget], ['Step allowance', options.maxSteps]] as const) {
    if (!Number.isSafeInteger(value) || value < (name === 'Step allowance' ? 1 : 0)) throw new Error(`${name} must be a ${name === 'Step allowance' ? 'positive' : 'non-negative'} whole number.`)
  }
  const cp = restoreCheckpoint(run)
  cp.count = 0
  cp.limit = options.maxSteps
  if (options.rerun) applyRerun(cp, run, options.rerun)
  const budget = run.budget > 0 ? run.budget + options.extraTokens : 0
  if (!Number.isSafeInteger(budget)) throw new Error('The new stop-loss is too large.')
  return {
    ...run, status: 'running', error: undefined, endedAt: undefined, final: undefined, budget, checkpoint: cp,
    // Keep interrupted attempts and their usage: retries are not free.
    steps: run.steps.map(s => ['queued', 'waiting', 'thinking', 'generating', 'tool', 'review'].includes(s.status) ? { ...s, status: 'stopped' as const } : s),
    snapshot: { ...run.snapshot, stages: run.snapshot.stages.map((s, i) => i === cp.idx ? { ...s, budget: options.stageBudget } : s) },
  }
}

/** Retain partial work as input when restarting an interrupted request. */
export function interruptedContext(step?: RunStep): string {
  if (!step || step.status === 'done') return ''
  const parts: string[] = []
  if (step.content) parts.push(`Partial response from the interrupted attempt (not a finished result):\n${step.content}`)
  if (step.tools.length) parts.push(`Tools from the interrupted attempt. Reuse completed results; do not repeat completed external actions. A missing result means the outcome is unknown:\n${JSON.stringify(step.tools)}`)
  return parts.length ? `${parts.join('\n\n')}\n\nFinish this stage, retaining useful work above, and return a complete standalone result.` : ''
}
