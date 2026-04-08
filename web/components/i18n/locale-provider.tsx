"use client"

import { createContext, useContext, useMemo, useState, useEffect, type ReactNode } from "react"
import { NextIntlClientProvider } from "next-intl"

import enMessages from "@/messages/en.json"
import deMessages from "@/messages/de.json"
import frMessages from "@/messages/fr.json"

export type SupportedLocale = "en" | "de" | "fr"

const messages: Record<SupportedLocale, Record<string, unknown>> = {
  en: enMessages,
  de: deMessages,
  fr: frMessages,
}

function detectDefaultLocale(): SupportedLocale {
  if (typeof window === "undefined") return "en"

  const stored = localStorage.getItem("gsd:locale") as SupportedLocale | null
  if (stored && stored in messages) return stored

  const browser = navigator.language
  if (browser.startsWith("de")) return "de"
  if (browser.startsWith("fr")) return "fr"

  return "en"
}

interface LocaleContextValue {
  locale: SupportedLocale
  setLocale: (locale: SupportedLocale) => void
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: "en",
  setLocale: () => {},
})

export function useLocaleManager() {
  return useContext(LocaleContext)
}

interface LocaleProviderProps {
  children: ReactNode
}

export function LocaleProvider({ children }: LocaleProviderProps) {
  const [locale, setLocaleState] = useState<SupportedLocale>(detectDefaultLocale)

  const setLocale = (next: SupportedLocale) => {
    localStorage.setItem("gsd:locale", next)
    setLocaleState(next)
  }

  // Sync on mount (for SSR hydration mismatch recovery)
  useEffect(() => {
    const initial = detectDefaultLocale()
    if (initial !== locale) {
      setLocaleState(initial)
    }
  }, [locale])

  const value = useMemo(() => ({ locale, setLocale }), [locale])

  return (
    <LocaleContext.Provider value={value}>
      <NextIntlClientProvider locale={locale} messages={messages[locale]}>
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  )
}
