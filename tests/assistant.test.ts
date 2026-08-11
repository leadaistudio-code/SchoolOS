import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { toolsFor, findTool, TOOL_NAMES } from '../src/server/assistant/tools'
import { zodToJsonSchema } from '../src/server/assistant/json-schema'
import { parseAgentEvent } from '../src/lib/assistant-events'
import type { AppContext } from '../src/server/context'
import { toOpenAiMessages, toOpenAiTools, toStrictSchema } from '../src/server/assistant/providers/openai'
import { toAnthropicMessages } from '../src/server/assistant/providers/anthropic'
import type { ModelTurn } from '../src/server/assistant/providers/types'

/**
 * The assistant's security properties, tested rather than asserted in a comment.
 *
 * These tests do not exercise the model. They exercise the two mechanisms that
 * make the model's behaviour irrelevant to safety: the tool list a user is given,
 * and the argument schemas that list is described by. If a future tool forgets a
 * permission or leaks a tenant argument, one of these fails.
 */

/** A context with exactly the permissions named, and nothing else. */
function contextWith(...permissions: string[]): AppContext {
  const held = new Set(permissions)
  return {
    user: {
      sessionId: 's_1',
      userId: 'u_1',
      tenantId: 't_1',
      isSuperAdmin: false,
      firstName: 'Test',
      lastName: 'User',
      email: null,
      phone: null,
      avatarUrl: null,
      mustChangePassword: false,
      roleKeys: ['TEACHER'],
      permissions: held,
      impersonatedById: null,
    },
    tenant: { id: 't_1', name: 'Test School' } as never,
    db: {} as never,
    can: (permission: string) => held.has(permission),
    canAny: (...perms: string[]) => perms.some((p) => held.has(p)),
    require: (permission: string) => {
      if (!held.has(permission)) throw new Error(`missing ${permission}`)
    },
  }
}

describe('assistant tool exposure', () => {
  it('offers a user with no permissions no tools at all', () => {
    expect(toolsFor(contextWith())).toHaveLength(0)
  })

  it('offers a teacher attendance tools but not fees', () => {
    const tools = toolsFor(contextWith('attendance.view', 'students.view')).map((t) => t.name)

    expect(tools).toContain('unmarked_registers')
    expect(tools).toContain('attendance_report')
    expect(tools).toContain('find_students')
    expect(tools).not.toContain('fees_outstanding')
    expect(tools).not.toContain('fees_collected')
    expect(tools).not.toContain('fees_invoices')
  })

  it('offers an accountant fees tools but not attendance', () => {
    const tools = toolsFor(contextWith('fees.view', 'dashboard.view')).map((t) => t.name)

    expect(tools).toContain('fees_outstanding')
    expect(tools).toContain('school_overview')
    expect(tools).not.toContain('unmarked_registers')
    expect(tools).not.toContain('attendance_report')
  })

  it('withholds the action tool from someone who cannot create notices', () => {
    const withoutRight = toolsFor(contextWith('fees.view', 'attendance.view')).map((t) => t.name)
    const withRight = toolsFor(contextWith('notices.create')).map((t) => t.name)

    expect(withoutRight).not.toContain('draft_notice')
    expect(withRight).toContain('draft_notice')
  })

  it('names a real permission for every tool', () => {
    // A tool whose permission string does not exist would be silently invisible
    // to everyone, which is the failure this catches.
    const everyPermission = toolsFor(
      contextWith(...TOOL_NAMES.map((name) => findTool(name)!.permission)),
    )
    expect(everyPermission).toHaveLength(TOOL_NAMES.length)
  })

  it('exposes exactly one action tool, and it is the notice draft', () => {
    const actions = TOOL_NAMES.map((name) => findTool(name)!).filter((tool) => tool.action)
    expect(actions.map((tool) => tool.name)).toEqual(['draft_notice'])
  })

  it('accepts no tenant, school or user argument on any tool', () => {
    // The model must have no way to name whose data it wants. Tenancy comes from
    // the request context; anything else here would be a cross-tenant hole.
    const forbidden = ['tenantid', 'tenant', 'schoolid', 'userid', 'sql', 'query_raw']

    for (const name of TOOL_NAMES) {
      const schema = zodToJsonSchema(findTool(name)!.input)
      const keys = Object.keys((schema.properties ?? {}) as Record<string, unknown>)
      for (const key of keys) {
        expect(
          forbidden.includes(key.toLowerCase()),
          `${name} exposes a forbidden argument: ${key}`,
        ).toBe(false)
      }
    }
  })
})

describe('tool argument schemas', () => {
  it('converts the shapes the tools actually use', () => {
    const schema = zodToJsonSchema(
      z.object({
        needed: z.string().describe('A description the model reads'),
        maybe: z.number().int().min(1).max(40).optional(),
        choice: z.enum(['ALL', 'CLASS']),
      }),
    )

    expect(schema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      properties: {
        needed: { type: 'string', description: 'A description the model reads' },
        maybe: { type: 'integer', minimum: 1, maximum: 40 },
        choice: { type: 'string', enum: ['ALL', 'CLASS'] },
      },
    })
    // Optional arguments must not be required, or every call fails validation.
    expect(schema.required).toEqual(['needed', 'choice'])
  })

  it('refuses a type it cannot describe rather than emitting a loose schema', () => {
    expect(() => zodToJsonSchema(z.object({ when: z.date() }))).toThrow(/unsupported Zod type/i)
  })

  it('produces a strict schema for every real tool', () => {
    for (const name of TOOL_NAMES) {
      const schema = zodToJsonSchema(findTool(name)!.input)
      expect(schema.additionalProperties, `${name} allows unknown arguments`).toBe(false)
      expect(Array.isArray(schema.required), `${name} has no required list`).toBe(true)
    }
  })
})

describe('assistant event protocol', () => {
  it('drops a truncated line instead of rendering a partial turn', () => {
    expect(parseAgentEvent('{"type":"text","te')).toBeNull()
    expect(parseAgentEvent('')).toBeNull()
    expect(parseAgentEvent('null')).toBeNull()
  })

  it('drops events with missing fields', () => {
    expect(parseAgentEvent('{"type":"source","label":"Fees"}')).toBeNull()
    expect(parseAgentEvent('{"type":"draft","id":"d_1"}')).toBeNull()
    expect(parseAgentEvent('{"type":"nonsense"}')).toBeNull()
  })

  it('rejects a source that is not an in-app path', () => {
    // A link out of the product would be a phishing surface if a source ever
    // carried an absolute URL.
    expect(
      parseAgentEvent('{"type":"source","label":"Fees","href":"https://evil.example/x"}'),
    ).toBeNull()
    expect(
      parseAgentEvent('{"type":"source","label":"Fees","href":"/finance/outstanding"}'),
    ).toEqual({ type: 'source', label: 'Fees', href: '/finance/outstanding' })
  })

  it('passes a complete text event through unchanged', () => {
    expect(parseAgentEvent('{"type":"text","text":"₹4,20,000 is outstanding."}')).toEqual({
      type: 'text',
      text: '₹4,20,000 is outstanding.',
    })
  })
})

describe('provider message conversion', () => {
  // A question that needed two lookups: assistant asks for both, both answer,
  // then the assistant replies. Every provider must round-trip this shape.
  const conversation: ModelTurn[] = [
    { role: 'user', text: 'what fees are pending in class 9?' },
    {
      role: 'assistant',
      text: 'Let me check.',
      toolCalls: [
        { id: 'call_1', name: 'list_classes', argumentsJson: '{}' },
        { id: 'call_2', name: 'fees_outstanding', argumentsJson: '{}' },
      ],
    },
    { role: 'tool', callId: 'call_1', name: 'list_classes', content: '{"classes":[]}' },
    {
      role: 'tool',
      callId: 'call_2',
      name: 'fees_outstanding',
      content: 'permission denied',
      isError: true,
    },
  ]

  it('gives OpenAI one tool message per call, each quoting its call id', () => {
    const messages = toOpenAiMessages(conversation)

    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'tool'])
    expect(messages[1]).toMatchObject({
      role: 'assistant',
      tool_calls: [
        { id: 'call_1', function: { name: 'list_classes' } },
        { id: 'call_2', function: { name: 'fees_outstanding' } },
      ],
    })
    // Order matters: a tool message that does not follow its request is rejected.
    expect(messages[2]).toMatchObject({ role: 'tool', tool_call_id: 'call_1' })
    // OpenAI tool messages have no error flag, so failure is stated in the text.
    expect(messages[3]).toMatchObject({
      role: 'tool',
      tool_call_id: 'call_2',
      content: 'Error: permission denied',
    })
  })

  it('merges Anthropic tool results into a single user message', () => {
    const messages = toAnthropicMessages(conversation)

    // Splitting results across messages teaches the model to stop calling tools
    // in parallel, so both results belong in one turn.
    expect(messages).toHaveLength(3)
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])

    const results = messages[2]!.content as { type: string; tool_use_id: string; is_error?: boolean }[]
    expect(results).toHaveLength(2)
    expect(results.map((block) => block.tool_use_id)).toEqual(['call_1', 'call_2'])
    expect(results[0]!.is_error).toBeUndefined()
    expect(results[1]!.is_error).toBe(true)
  })

  it('replays an assistant turn verbatim when the provider supplied one', () => {
    // Anthropic thinking blocks must be echoed back unchanged on the same model;
    // rebuilding the turn from the neutral fields would drop them.
    const raw = [
      { type: 'thinking', thinking: '', signature: 'sig' },
      { type: 'tool_use', id: 'call_9', name: 'school_overview', input: {} },
    ]
    const messages = toAnthropicMessages([
      { role: 'user', text: 'summary please' },
      { role: 'assistant', text: '', toolCalls: [{ id: 'call_9', name: 'school_overview', argumentsJson: '{}' }], raw },
    ])

    expect(messages[1]!.content).toBe(raw)
  })

  it('marks OpenAI tools strict so an invented argument is rejected', () => {
    const [spec] = toOpenAiTools([
      { name: 'fees_outstanding', description: 'x', parameters: { type: 'object', properties: {} } },
    ])
    expect(spec).toMatchObject({ type: 'function', function: { strict: true } })
  })
})

describe('OpenAI strict-mode schemas', () => {
  // OpenAI's strict mode has no concept of an omitted argument: every property
  // must be in `required`. Getting this wrong 400s the whole request with
  // "Invalid schema for function …", which is how it was first found.
  it('requires every property and makes optional ones nullable', () => {
    const strict = toStrictSchema(
      zodToJsonSchema(
        z.object({
          search: z.string(),
          limit: z.number().int().optional(),
          status: z.enum(['PAID', 'OVERDUE']).optional(),
        }),
      ),
    )

    expect(strict.required).toEqual(['search', 'limit', 'status'])
    expect(strict.additionalProperties).toBe(false)

    const properties = strict.properties as Record<string, Record<string, unknown>>
    expect(properties.search!.type).toBe('string')
    expect(properties.limit!.type).toEqual(['integer', 'null'])
    // An enum must accept null too, or the nullable union is unsatisfiable.
    expect(properties.status!.type).toEqual(['string', 'null'])
    expect(properties.status!.enum).toEqual(['PAID', 'OVERDUE', null])
  })

  it('holds for every real tool', () => {
    for (const name of TOOL_NAMES) {
      const schema = zodToJsonSchema(findTool(name)!.input)
      const strict = toStrictSchema(schema)
      const keys = Object.keys((strict.properties ?? {}) as Record<string, unknown>)
      expect(strict.required, `${name} must require every property`).toEqual(keys)
    }
  })
})
