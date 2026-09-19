import * as v from "valibot"

function toBinaryString(bytes: Uint8Array): string {
  let result = ""

  for (const byte of bytes) result += String.fromCharCode(byte)

  return result
}

export function encodeCursor<T>(cursor: T): string {
  const json = JSON.stringify(cursor)
  const base64 = btoa(toBinaryString(new TextEncoder().encode(json)))

  return base64.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
}

export function decodeCursor(value: string): unknown | undefined {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return undefined

  try {
    const base64 = value.replaceAll("-", "+").replaceAll("_", "/")
    const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch {
    return undefined
  }
}

export function cursorParser<TSchema extends v.GenericSchema>(
  schema: TSchema,
): (value: string) => v.InferOutput<TSchema> | undefined {
  return (value) => {
    const result = v.safeParse(schema, decodeCursor(value))

    return result.success ? result.output : undefined
  }
}
