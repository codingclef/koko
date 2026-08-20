export type IdleWorkPriority = 'high' | 'normal' | 'low'

interface IdleWorkTask {
  id: number
  priority: IdleWorkPriority
  callback: () => void
}

interface ScheduledWork {
  priority: IdleWorkPriority
  cancel: () => void
}

const PRIORITY_ORDER: Record<IdleWorkPriority, number> = {
  high: 0,
  normal: 1,
  low: 2,
}

const PRIORITY_TIMING: Record<IdleWorkPriority, { timeout: number; fallbackDelay: number }> = {
  high: { timeout: 1500, fallbackDelay: 700 },
  normal: { timeout: 2500, fallbackDelay: 900 },
  low: { timeout: 4000, fallbackDelay: 1200 },
}

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
  cancelIdleCallback?: (handle: number) => void
}

let nextTaskId = 1
let tasks: IdleWorkTask[] = []
let scheduledWork: ScheduledWork | null = null

function getNextTaskIndex() {
  let nextIndex = 0
  for (let index = 1; index < tasks.length; index += 1) {
    if (PRIORITY_ORDER[tasks[index].priority] < PRIORITY_ORDER[tasks[nextIndex].priority]) {
      nextIndex = index
    }
  }
  return nextIndex
}

function runNextTask() {
  scheduledWork = null
  if (tasks.length === 0) return

  const [task] = tasks.splice(getNextTaskIndex(), 1)
  try {
    task.callback()
  } finally {
    scheduleNextTask()
  }
}

function scheduleNextTask() {
  if (scheduledWork || tasks.length === 0 || typeof window === 'undefined') return

  const priority = tasks[getNextTaskIndex()].priority
  const timing = PRIORITY_TIMING[priority]
  const idleWindow = window as IdleWindow

  if (idleWindow.requestIdleCallback && idleWindow.cancelIdleCallback) {
    const handle = idleWindow.requestIdleCallback(runNextTask, { timeout: timing.timeout })
    scheduledWork = {
      priority,
      cancel: () => idleWindow.cancelIdleCallback?.(handle),
    }
    return
  }

  let animationFrame: number | null = null
  const timeout = window.setTimeout(() => {
    const run = () => runNextTask()
    if (typeof window.requestAnimationFrame === 'function') {
      animationFrame = window.requestAnimationFrame(run)
    } else {
      run()
    }
  }, timing.fallbackDelay)

  scheduledWork = {
    priority,
    cancel: () => {
      window.clearTimeout(timeout)
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame)
    },
  }
}

export function scheduleIdleWork(
  callback: () => void,
  priority: IdleWorkPriority = 'normal'
) {
  if (typeof window === 'undefined') return () => {}

  const task: IdleWorkTask = { id: nextTaskId, priority, callback }
  nextTaskId += 1
  tasks.push(task)

  if (
    scheduledWork &&
    PRIORITY_ORDER[priority] < PRIORITY_ORDER[scheduledWork.priority]
  ) {
    scheduledWork.cancel()
    scheduledWork = null
  }
  scheduleNextTask()

  return () => {
    tasks = tasks.filter((queuedTask) => queuedTask.id !== task.id)
    if (tasks.length === 0 && scheduledWork) {
      scheduledWork.cancel()
      scheduledWork = null
    }
  }
}

export function clearIdleWorkQueue() {
  scheduledWork?.cancel()
  scheduledWork = null
  tasks = []
}
