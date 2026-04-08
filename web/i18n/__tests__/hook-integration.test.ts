import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { createTranslator, NextIntlClientProvider, useTranslations } from "next-intl"

// Minimal in-memory test messages
const enMessages = {
  greeting: "Hello {name}!",
  shell: {
    connectingToWorkspace: "Connecting to workspace…",
    retry: "Retry",
  },
}

const deMessages = {
  greeting: "Hallo {name}!",
  shell: {
    connectingToWorkspace: "Verbinde mit Workspace…",
    retry: "Erneut versuchen",
  },
}

describe("i18n integration", () => {
  describe("createTranslator resolves keys correctly", () => {
    test("English nested key resolution", () => {
      const t = createTranslator({ locale: "en", messages: enMessages })
      assert.equal(t("shell.connectingToWorkspace"), "Connecting to workspace…")
    })

    test("German nested key resolution", () => {
      const t = createTranslator({ locale: "de", messages: deMessages })
      assert.equal(t("shell.connectingToWorkspace"), "Verbinde mit Workspace…")
    })
  })

  describe("ICU placeholder interpolation", () => {
    test("English {name} interpolation", () => {
      const t = createTranslator({ locale: "en", messages: enMessages })
      assert.equal(t("greeting", { name: "World" }), "Hello World!")
    })

    test("German {name} interpolation", () => {
      const t = createTranslator({ locale: "de", messages: deMessages })
      assert.equal(t("greeting", { name: "Welt" }), "Hallo Welt!")
    })
  })

  describe("locale switching produces different output", () => {
    test("same key, different locale → different string", () => {
      const enT = createTranslator({ locale: "en", messages: enMessages })
      const deT = createTranslator({ locale: "de", messages: deMessages })

      const enResult = enT("shell.connectingToWorkspace")
      const deResult = deT("shell.connectingToWorkspace")

      assert.notEqual(enResult, deResult, "English and German should produce different strings")
      assert.ok(enResult.includes("Connecting"))
      assert.ok(deResult.includes("Verbinde"))
    })
  })

  describe("next-intl public API surface", () => {
    test("NextIntlClientProvider is exported", () => {
      assert.equal(typeof NextIntlClientProvider, "function")
    })

    test("useTranslations is exported", () => {
      assert.equal(typeof useTranslations, "function")
    })

    test("createTranslator is exported", () => {
      assert.equal(typeof createTranslator, "function")
    })
  })
})
