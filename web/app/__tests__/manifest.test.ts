import { describe, test } from "node:test"
import assert from "node:assert/strict"

import manifest from "../manifest.ts"

describe("manifest", () => {
  const result = manifest()

  test("returns required PWA fields", () => {
    assert.equal(result.name, "GSD - Get Shit Done")
    assert.equal(result.short_name, "GSD")
    assert.equal(result.start_url, "/")
    assert.equal(result.display, "standalone")
    assert.ok(result.description, "description must be present")
  })

  test("declares at least one icon", () => {
    assert.ok(Array.isArray(result.icons), "icons must be an array")
    assert.ok(result.icons!.length > 0, "icons must not be empty")
  })

  test("includes an SVG icon with sizes 'any'", () => {
    const svg = result.icons!.find((i) => i.type === "image/svg+xml")
    assert.ok(svg, "must include an SVG icon")
    assert.equal(svg!.sizes, "any")
  })

  test("includes 192x192 and 512x512 PNG icons for Chromium installability", () => {
    const pngs = result.icons!.filter((i) => i.type === "image/png")
    const sizes = pngs.map((i) => i.sizes)
    assert.ok(sizes.includes("192x192"), "must include 192x192 icon")
    assert.ok(sizes.includes("512x512"), "must include 512x512 icon")
  })

  test("includes theme_color and background_color matching dark theme", () => {
    assert.equal(result.theme_color, "#0a0a0a")
    assert.equal(result.background_color, "#0a0a0a")
  })

  test("all icons have required src and type", () => {
    for (const icon of result.icons!) {
      assert.ok(icon.src, "icon must have src")
      assert.ok(icon.type, "icon must have type")
    }
  })
})
