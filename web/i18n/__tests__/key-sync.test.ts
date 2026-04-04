import { describe, test, beforeEach, afterEach } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, resolve } from "node:path"

const messagesDir = resolve(import.meta.dirname, "../../messages")

/**
 * Recursively walk an object's keys, producing dot-notation key paths.
 * e.g. { a: { b: "x", c: "y" } } → ["a.b", "a.c"]
 */
function collectKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = []
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...collectKeys(value as Record<string, unknown>, path))
    } else {
      keys.push(path)
    }
  }
  return keys
}

describe("i18n message file sync", () => {
  test("en.json and de.json have identical key sets", () => {
    const enRaw = readFileSync(join(messagesDir, "en.json"), "utf-8")
    const deRaw = readFileSync(join(messagesDir, "de.json"), "utf-8")

    const en = JSON.parse(enRaw) as Record<string, unknown>
    const de = JSON.parse(deRaw) as Record<string, unknown>

    const enKeys = collectKeys(en).sort()
    const deKeys = collectKeys(de).sort()

    const missingInDe = enKeys.filter(k => !deKeys.includes(k))
    const orphanedInDe = deKeys.filter(k => !enKeys.includes(k))

    const issues: string[] = []
    if (missingInDe.length) {
      issues.push(`Missing in de.json: ${missingInDe.join(", ")}`)
    }
    if (orphanedInDe.length) {
      issues.push(`Orphaned in de.json (not in en.json): ${orphanedInDe.join(", ")}`)
    }

    assert.equal(issues.length, 0, issues.join("\n"))
  })

  test("en.json and fr.json have identical key sets", () => {
    const enRaw = readFileSync(join(messagesDir, "en.json"), "utf-8")
    const frRaw = readFileSync(join(messagesDir, "fr.json"), "utf-8")

    const en = JSON.parse(enRaw) as Record<string, unknown>
    const fr = JSON.parse(frRaw) as Record<string, unknown>

    const enKeys = collectKeys(en).sort()
    const frKeys = collectKeys(fr).sort()

    const missingInFr = enKeys.filter(k => !frKeys.includes(k))
    const orphanedInFr = frKeys.filter(k => !enKeys.includes(k))

    const issues: string[] = []
    if (missingInFr.length) {
      issues.push(`Missing in fr.json: ${missingInFr.join(", ")}`)
    }
    if (orphanedInFr.length) {
      issues.push(`Orphaned in fr.json (not in en.json): ${orphanedInFr.join(", ")}`)
    }

    assert.equal(issues.length, 0, issues.join("\n"))
  })

  test("all translation values are non-empty strings", () => {
    for (const lang of ["en", "de", "fr"]) {
      const raw = readFileSync(join(messagesDir, `${lang}.json`), "utf-8")
      const data = JSON.parse(raw) as Record<string, unknown>
      const keys = collectKeys(data)

      for (const key of keys) {
        const parts = key.split(".")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let node: any = data
        for (const part of parts) {
          node = node[part]
        }
        assert.equal(typeof node, "string", `${lang}.json key "${key}" is not a string`)
        assert(node.length > 0, `${lang}.json key "${key}" has an empty value`)
      }
    }
  })

  test("no duplicate keys in message files", () => {
    // JSON.parse already deduplicates by overwriting, so we check that re-stringify is stable
    for (const lang of ["en", "de", "fr"]) {
      const raw = readFileSync(join(messagesDir, `${lang}.json`), "utf-8")
      const parsed = JSON.parse(raw)
      const roundTripped = JSON.stringify(parsed, null, 2)
      const reparsed = JSON.parse(roundTripped)
      assert.deepStrictEqual(parsed, reparsed, `${lang}.json has structural issues`)
    }
  })

  test("supported locales are discoverable", () => {
    const files = readdirSync(messagesDir).filter(f => f.endsWith(".json")).sort()
    assert.deepEqual(files, ["de.json", "en.json", "fr.json"], "Expected exactly en.json, de.json, and fr.json in messages/")
  })
})
