import fs from 'node:fs'
import path from 'node:path'

export type JsonSchema = {
  properties?: Record<string, unknown>
  required?: string[]
  $defs?: Record<string, JsonSchema>
  allOf?: JsonSchema[]
  oneOf?: JsonSchema[]
  anyOf?: JsonSchema[]
  if?: JsonSchema
  then?: JsonSchema
  else?: JsonSchema
  const?: unknown
  enum?: unknown[]
  type?: string | string[]
  items?: JsonSchema
  additionalProperties?: boolean
  $ref?: string
  minimum?: number
}

const schemaPath = path.resolve(__dirname, '../../docs/public-json-output.schema.json')

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function resolveRef(root: JsonSchema, ref: string): JsonSchema {
  if (!ref.startsWith('#/')) {
    throw new Error(`unsupported ref: ${ref}`)
  }

  const parts = ref.slice(2).split('/')
  let cursor: unknown = root
  for (const part of parts) {
    if (!isRecord(cursor) || !(part in cursor)) {
      throw new Error(`invalid ref path: ${ref}`)
    }
    cursor = cursor[part]
  }

  if (!isRecord(cursor)) {
    throw new Error(`ref target is not schema object: ${ref}`)
  }

  return cursor as JsonSchema
}

function matchesSchemaType(schemaType: string, value: unknown): boolean {
  if (schemaType === 'object') {
    return isRecord(value)
  }
  if (schemaType === 'array') {
    return Array.isArray(value)
  }
  if (schemaType === 'string') {
    return typeof value === 'string'
  }
  if (schemaType === 'boolean') {
    return typeof value === 'boolean'
  }
  if (schemaType === 'integer') {
    return typeof value === 'number' && Number.isInteger(value)
  }
  if (schemaType === 'number') {
    return typeof value === 'number'
  }
  if (schemaType === 'null') {
    return value === null
  }
  return true
}

export function validateSchema(schema: JsonSchema, value: unknown, root: JsonSchema): boolean {
  if (schema.$ref) {
    return validateSchema(resolveRef(root, schema.$ref), value, root)
  }

  if (schema.allOf && !schema.allOf.every((branch) => validateSchema(branch, value, root))) {
    return false
  }

  if (schema.oneOf) {
    const matchCount = schema.oneOf.filter((branch) => validateSchema(branch, value, root)).length
    if (matchCount !== 1) {
      return false
    }
  }

  if (schema.anyOf && !schema.anyOf.some((branch) => validateSchema(branch, value, root))) {
    return false
  }

  if (schema.if) {
    const conditionMatched = validateSchema(schema.if, value, root)
    if (conditionMatched && schema.then && !validateSchema(schema.then, value, root)) {
      return false
    }
    if (!conditionMatched && schema.else && !validateSchema(schema.else, value, root)) {
      return false
    }
  }

  if (Object.prototype.hasOwnProperty.call(schema, 'const') && value !== schema.const) {
    return false
  }

  if (schema.enum && !schema.enum.some((item) => item === value)) {
    return false
  }

  if (schema.type) {
    const schemaTypes = Array.isArray(schema.type) ? schema.type : [schema.type]
    if (!schemaTypes.some((schemaType) => matchesSchemaType(schemaType, value))) {
      return false
    }
  }

  if (typeof schema.minimum === 'number' && (typeof value !== 'number' || value < schema.minimum)) {
    return false
  }

  if (isRecord(value)) {
    if (schema.required && !schema.required.every((key) => Object.prototype.hasOwnProperty.call(value, key))) {
      return false
    }

    if (schema.properties) {
      for (const [key, childSchema] of Object.entries(schema.properties)) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) {
          continue
        }
        if (!isRecord(childSchema)) {
          continue
        }
        if (!validateSchema(childSchema as JsonSchema, value[key], root)) {
          return false
        }
      }
    }

    if (schema.additionalProperties === false && schema.properties) {
      const allowed = new Set(Object.keys(schema.properties))
      for (const key of Object.keys(value)) {
        if (!allowed.has(key)) {
          return false
        }
      }
    }
  }

  if (Array.isArray(value) && schema.items && !value.every((item) => validateSchema(schema.items as JsonSchema, item, root))) {
    return false
  }

  return true
}

export function loadPublicJsonSchema(): JsonSchema {
  return JSON.parse(fs.readFileSync(schemaPath, 'utf8')) as JsonSchema
}

export function validatePublicJsonSchema(value: unknown): boolean {
  const publicJsonSchema = loadPublicJsonSchema()
  return validateSchema(publicJsonSchema, value, publicJsonSchema)
}

export function validatePublicJsonSchemaDef(defName: string, value: unknown): boolean {
  const publicJsonSchema = loadPublicJsonSchema()
  const def = publicJsonSchema.$defs?.[defName]
  if (!def) {
    throw new Error(`missing schema def: ${defName}`)
  }

  return validateSchema(def, value, publicJsonSchema)
}
