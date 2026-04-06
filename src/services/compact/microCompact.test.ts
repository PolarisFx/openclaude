import { expect, test } from 'bun:test'

import { BASH_TOOL_NAME } from '../../tools/BashTool/toolName.ts'
import { createAssistantMessage, createUserMessage } from '../../utils/messages.ts'
import {
  TIME_BASED_MC_CLEARED_MESSAGE,
  compactCompactableToolResults,
} from './microCompact.ts'

test('compactCompactableToolResults clears old tool content and drops retained raw payloads', () => {
  const firstToolResult = {
    stdout: 'first output',
    stderr: '',
  }
  const secondToolResult = {
    stdout: 'second output',
    stderr: '',
  }

  const messages = [
    createAssistantMessage({
      content: [
        {
          type: 'tool_use',
          id: 'tool-1',
          name: BASH_TOOL_NAME,
          input: { command: 'npm test' },
        },
      ],
    }),
    createUserMessage({
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'tool-1',
          content: 'first output',
          is_error: false,
        },
      ],
      toolUseResult: firstToolResult,
    }),
    createAssistantMessage({
      content: [
        {
          type: 'tool_use',
          id: 'tool-2',
          name: BASH_TOOL_NAME,
          input: { command: 'npm run build' },
        },
      ],
    }),
    createUserMessage({
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'tool-2',
          content: 'second output',
          is_error: false,
        },
      ],
      toolUseResult: secondToolResult,
    }),
  ]

  const result = compactCompactableToolResults(messages, 1)

  expect(result).not.toBeNull()
  expect(result!.clearedToolIds).toEqual(['tool-1'])
  expect(result!.tokensSaved).toBeGreaterThan(0)
  expect(
    (result!.messages[1]!.message.content as Array<{ content: string }>)[0]!.content,
  ).toBe(TIME_BASED_MC_CLEARED_MESSAGE)
  expect(result!.messages[1]!.toolUseResult).toBeUndefined()
  expect(
    (result!.messages[3]!.message.content as Array<{ content: string }>)[0]!.content,
  ).toBe('second output')
  expect(result!.messages[3]!.toolUseResult).toBe(secondToolResult)
})
