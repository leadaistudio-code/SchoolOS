import { z } from 'zod'

/**
 * Zod → JSON Schema, for the subset the assistant's tools actually use.
 *
 * There are libraries for this. None is worth a dependency here: the tool
 * arguments in `tools.ts` are flat objects of strings, numbers, enums and
 * optional versions of those, and the whole conversion is fifty lines. A
 * dependency that converts recursive discriminated unions is dead weight in the
 * bundle and one more thing to keep current.
 *
 * The schema this produces is the strict shape the API wants: every object
 * carries `additionalProperties: false` and an explicit `required` list, so
 * arguments that do not match are rejected before a tool ever runs. `.describe()`
 * text is carried through — that text is how the model learns what a field means,
 * so dropping it would quietly degrade every tool call.
 *
 * Anything unsupported throws at startup rather than silently producing a schema
 * that accepts the wrong thing.
 */

type JsonSchema = Record<string, unknown>

export function zodToJsonSchema(schema: z.ZodObject<z.ZodRawShape>): JsonSchema {
  const shape = schema.shape
  const properties: Record<string, JsonSchema> = {}
  const required: string[] = []

  for (const [key, value] of Object.entries(shape)) {
    const { schema: converted, optional } = convert(value as z.ZodTypeAny)
    properties[key] = converted
    if (!optional) required.push(key)
  }

  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  }
}

function convert(node: z.ZodTypeAny): { schema: JsonSchema; optional: boolean } {
  let optional = false
  let current = node
  const description: string | undefined = current.description

  // Unwrap the modifier chain. `.optional()` and `.default()` both mean "the
  // model may leave this out"; `.describe()` sits anywhere in the chain.
  for (;;) {
    if (current instanceof z.ZodOptional) {
      optional = true
      current = current.unwrap() as z.ZodTypeAny
      continue
    }
    if (current instanceof z.ZodDefault) {
      optional = true
      current = current.removeDefault() as z.ZodTypeAny
      continue
    }
    if (current instanceof z.ZodNullable) {
      current = current.unwrap() as z.ZodTypeAny
      continue
    }
    break
  }

  const described = (schema: JsonSchema): JsonSchema => {
    const text = description ?? current.description
    return text ? { ...schema, description: text } : schema
  }

  if (current instanceof z.ZodString) {
    return { schema: described({ type: 'string' }), optional }
  }

  if (current instanceof z.ZodNumber) {
    const checks = (current._def.checks ?? []) as { kind: string; value?: number }[]
    const isInt = checks.some((check) => check.kind === 'int')
    const min = checks.find((check) => check.kind === 'min')?.value
    const max = checks.find((check) => check.kind === 'max')?.value

    return {
      schema: described({
        type: isInt ? 'integer' : 'number',
        ...(min === undefined ? {} : { minimum: min }),
        ...(max === undefined ? {} : { maximum: max }),
      }),
      optional,
    }
  }

  if (current instanceof z.ZodBoolean) {
    return { schema: described({ type: 'boolean' }), optional }
  }

  if (current instanceof z.ZodEnum) {
    return { schema: described({ type: 'string', enum: current.options }), optional }
  }

  if (current instanceof z.ZodArray) {
    const inner = convert(current.element as z.ZodTypeAny)
    return { schema: described({ type: 'array', items: inner.schema }), optional }
  }

  if (current instanceof z.ZodObject) {
    return { schema: described(zodToJsonSchema(current as z.ZodObject<z.ZodRawShape>)), optional }
  }

  // Reached only by a tool author adding an unsupported type, and it fails on
  // the first request rather than producing a schema the model misreads.
  throw new Error(
    `Assistant tool argument uses an unsupported Zod type: ${current.constructor.name}. Extend json-schema.ts or simplify the argument.`,
  )
}
