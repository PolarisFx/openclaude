import { describe, expect, test } from 'bun:test'

import type { Message } from '../../types/message.js'
import { BASH_TOOL_NAME } from '../../tools/BashTool/toolName.ts'
import { createAssistantMessage, createUserMessage } from '../../utils/messages.js'
import {
  TIME_BASED_MC_CLEARED_MESSAGE,
  compactCompactableToolResults,
  evaluateTimeBasedTrigger,
} from './microCompact.js'

function assistantWithToolUse(toolName: string, toolId: string): Message {
  return createAssistantMessage({
    content: [
      {
        type: 'tool_use' as const,
        id: toolId,
        name: toolName,
        input: {},
      },
    ],
  })
}

function userWithToolResult(toolId: string, output: string): Message {
  return createUserMessage({
    content: [
      {
        type: 'tool_result' as const,
        tool_use_id: toolId,
        content: output,
      },
    ],
  })
}

describe('microCompact MCP tool compaction', () => {
  test('module exports load correctly', async () => {
    const mod = await import('./microCompact.js')
    expect(mod.microcompactMessages).toBeFunction()
    expect(mod.estimateMessageTokens).toBeFunction()
    expect(mod.evaluateTimeBasedTrigger).toBeFunction()
  })

  test('estimateMessageTokens counts MCP tool_use blocks', async () => {
    const { estimateMessageTokens } = await import('./microCompact.js')

    const builtinMessages: Message[] = [
      assistantWithToolUse('Read', 'tool-builtin-1'),
      userWithToolResult('tool-builtin-1', 'file contents here'),
    ]

    const mcpMessages: Message[] = [
      assistantWithToolUse('mcp__github__get_file_contents', 'tool-mcp-1'),
      userWithToolResult('tool-mcp-1', 'file contents here'),
    ]

    const builtinTokens = estimateMessageTokens(builtinMessages)
    const mcpTokens = estimateMessageTokens(mcpMessages)

    expect(builtinTokens).toBeGreaterThan(0)
    expect(mcpTokens).toBeGreaterThan(0)
    expect(Math.abs(builtinTokens - mcpTokens)).toBeLessThan(50)
  })

  test('microcompactMessages processes MCP tools without error', async () => {
    const { microcompactMessages } = await import('./microCompact.js')

    const messages: Message[] = [
      assistantWithToolUse('mcp__slack__send_message', 'tool-mcp-2'),
      userWithToolResult('tool-mcp-2', 'Message sent successfully'),
      assistantWithToolUse('mcp__github__create_pull_request', 'tool-mcp-3'),
      userWithToolResult(
        'tool-mcp-3',
        JSON.stringify({ number: 42, url: 'https://github.com/org/repo/pull/42' }),
      ),
    ]

    const result = await microcompactMessages(messages)
    expect(result).toBeDefined()
    expect(result.messages).toBeDefined()
    expect(result.messages.length).toBe(messages.length)
  })

  test('microcompactMessages processes mixed built-in and MCP tools', async () => {
    const { microcompactMessages } = await import('./microCompact.js')

    const messages: Message[] = [
      assistantWithToolUse('Read', 'tool-read-1'),
      userWithToolResult('tool-read-1', 'some file content'),
      assistantWithToolUse('mcp__playwright__screenshot', 'tool-mcp-4'),
      userWithToolResult('tool-mcp-4', 'base64-encoded-screenshot-data'.repeat(100)),
      assistantWithToolUse('Bash', 'tool-bash-1'),
      userWithToolResult('tool-bash-1', 'command output'),
    ]

    const result = await microcompactMessages(messages)
    expect(result).toBeDefined()
    expect(result.messages.length).toBe(messages.length)
  })
})

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
    (result!.messages[1]!.message.content as Array<{ content: string }>)[0]!
      .content,
  ).toBe(TIME_BASED_MC_CLEARED_MESSAGE)
  expect(result!.messages[1]!.toolUseResult).toBeUndefined()
  expect(
    (result!.messages[3]!.message.content as Array<{ content: string }>)[0]!
      .content,
  ).toBe('second output')
  expect(result!.messages[3]!.toolUseResult).toBe(secondToolResult)
})

test('evaluateTimeBasedTrigger remains disabled without an explicit main-thread source', () => {
  const messages = [
    createAssistantMessage({ content: 'done' }),
  ]

  const result = evaluateTimeBasedTrigger(messages, undefined)
  expect(result).toBeNull()
})
