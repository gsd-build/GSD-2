"use client"

import dynamic from "next/dynamic"
import { LocaleProvider } from "@/components/i18n/locale-provider"

const GSDAppShell = dynamic(
  () => import("@/components/gsd/app-shell").then((mod) => mod.GSDAppShell),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading workspace…
      </div>
    ),
  },
)

export default function Page() {
  return (
    <LocaleProvider>
      <GSDAppShell />
    </LocaleProvider>
  )
}
