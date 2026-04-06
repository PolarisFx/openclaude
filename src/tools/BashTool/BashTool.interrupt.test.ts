import { expect, test } from 'bun:test'
import type { AppState } from '../../state/AppState.js'
import { getDefaultAppState } from '../../state/AppState.js'
import { killTask } from '../../tasks/LocalShellTask/killShellTasks.js'
import { runShellCommand } from './BashTool.js'

function createTestState(): AppState {
  return getDefaultAppState()
}

test('runShellCommand backgrounds interrupted bash commands before the progress threshold', async () => {
  let state = createTestState()
  const setAppState = (updater: (prev: AppState) => AppState): void => {
    state = updater(state)
  }

  const abortController = new AbortController()
  const generator = runShellCommand({
    input: {
      command: 'sleep 30',
      dangerouslyDisableSandbox: true,
    },
    abortController,
    setAppState,
  })

  let taskId: string | undefined
  try {
    const nextResultPromise = generator.next()
    setTimeout(() => {
      abortController.abort('interrupt')
    }, 1200).unref()

    const nextResult = await Promise.race([
      nextResultPromise,
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(
              'Interrupted bash command was not backgrounded before the progress threshold',
            ),
          )
        }, 2500).unref()
      }),
    ])

    expect(nextResult.done).toBe(true)
    expect(nextResult.value.interrupted).toBe(false)
    expect(typeof nextResult.value.backgroundTaskId).toBe('string')

    taskId = nextResult.value.backgroundTaskId
    expect(taskId).toBeDefined()
    expect(state.tasks[taskId!]?.status).toBe('running')
  } finally {
    if (taskId) {
      killTask(taskId, setAppState)
    }
    for (const [id, task] of Object.entries(state.tasks)) {
      if (task.status === 'running') {
        killTask(id, setAppState)
      }
    }
  }
})
