"use client"

import { useMemo } from "react"
import { motion } from "motion/react"
import { ArrowRight, Check, ShieldCheck } from "lucide-react"
import { useTranslations } from "next-intl"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { WorkspaceOnboardingProviderState } from "@/lib/gsd-workspace-store"
import { cn } from "@/lib/utils"

interface StepProviderProps {
  providers: WorkspaceOnboardingProviderState[]
  selectedId: string | null
  onSelect: (id: string) => void
  onNext: () => void
  onBack: () => void
}

function capabilityBadgeKeys(provider: WorkspaceOnboardingProviderState): string[] {
  const badges: string[] = []
  if (provider.supports.apiKey) badges.push("apiKey")
  if (provider.supports.oauth)
    badges.push(provider.supports.oauthAvailable ? "browserSignIn" : "oauthUnavailable")
  return badges
}

const BADGE_LABELS: Record<string, string> = {
  apiKey: "badges.apiKey",
  browserSignIn: "badges.browserSignIn",
  oauthUnavailable: "badges.oauthUnavailable",
}

const BADGE_TOOLTIPS: Record<string, string> = {
  apiKey: "tooltips.apiKey",
  browserSignIn: "tooltips.browserSignIn",
  oauthUnavailable: "tooltips.oauthUnavailable",
}

function configuredViaKey(source: WorkspaceOnboardingProviderState["configuredVia"]): string {
  switch (source) {
    case "auth_file": return "configuredVia.savedAuth"
    case "environment": return "configuredVia.environmentVariable"
    case "runtime": return "configuredVia.runtime"
    default: return "notConfigured"
  }
}

/** Group providers: configured first, then recommended, then rest. */
function groupProviders(providers: WorkspaceOnboardingProviderState[]): {
  label: string
  items: WorkspaceOnboardingProviderState[]
}[] {
  const configured = providers.filter((p) => p.configured)
  const recommended = providers.filter((p) => !p.configured && p.recommended)
  const rest = providers.filter((p) => !p.configured && !p.recommended)

  const groups: { label: string; items: WorkspaceOnboardingProviderState[] }[] = []
  if (configured.length > 0) groups.push({ label: "Configured", items: configured })
  if (recommended.length > 0) groups.push({ label: "Recommended", items: recommended })
  if (rest.length > 0) groups.push({ label: "Other Providers", items: rest })
  return groups
}

const GROUP_LABEL_KEYS: Record<string, string> = {
  "Configured": "configured",
  "Recommended": "recommended",
  "Other Providers": "other",
}

export function StepProvider({ providers, selectedId, onSelect, onNext, onBack }: StepProviderProps) {
  const t = useTranslations("onboarding.provider")
  const tc = useTranslations("common")

  const hasConfigured = providers.some((p) => p.configured)
  const groups = useMemo(() => groupProviders(providers), [providers])

  return (
    <div className="flex flex-col items-center">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-center"
      >
        <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {t('heading')}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {t('subheading')}
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.45 }}
        className="mt-8 w-full space-y-5"
      >
        {groups.map((group) => (
          <div key={group.label}>
            <div className="mb-2 px-0.5 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              {t(GROUP_LABEL_KEYS[group.label] || group.label)}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {group.items.map((provider) => {
                const selected = provider.id === selectedId
                return (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => onSelect(provider.id)}
                    className={cn(
                      "group relative rounded-xl border px-4 py-3.5 text-left transition-all duration-200",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      "active:scale-[0.98]",
                      selected
                        ? "border-foreground/30 bg-foreground/[0.06]"
                        : "border-border/50 bg-card/50 hover:border-foreground/15 hover:bg-card/50",
                    )}
                    data-testid={`onboarding-provider-${provider.id}`}
                  >
                    <div className="absolute right-3 top-3">
                      <div
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded-full border-[1.5px] transition-all duration-200",
                          selected ? "border-foreground bg-foreground" : "border-foreground/15",
                        )}
                      >
                        {selected && <Check className="h-2.5 w-2.5 text-background" strokeWidth={3} />}
                      </div>
                    </div>

                    <div className="pr-8">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">{provider.label}</span>
                        {provider.recommended && (
                          <Badge variant="outline" className="border-foreground/10 bg-foreground/[0.03] text-[9px] text-muted-foreground">
                            {t('recommended')}
                          </Badge>
                        )}
                      </div>

                      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        {provider.configured ? (
                          <>
                            <ShieldCheck className="h-3 w-3 text-success/80" />
                            <span>{t(configuredViaKey(provider.configuredVia))}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">{t('notConfigured')}</span>
                        )}
                      </div>
                    </div>

                    <div className="mt-2.5 flex flex-wrap gap-1">
                      {capabilityBadgeKeys(provider).map((key) => (
                        <Tooltip key={key}>
                          <TooltipTrigger asChild>
                            <Badge variant="outline" className="border-border/50 text-[10px] text-muted-foreground">
                              {t(BADGE_LABELS[key])}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            {t(BADGE_TOOLTIPS[key])}
                          </TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.3 }}
        className="mt-8 flex w-full items-center justify-between"
      >
        <Button
          variant="ghost"
          onClick={onBack}
          className="text-muted-foreground transition-transform active:scale-[0.96]"
        >
          {tc('back')}
        </Button>
        <Button
          onClick={onNext}
          disabled={!hasConfigured}
          className="group gap-2 transition-transform active:scale-[0.96]"
          data-testid="onboarding-provider-continue"
        >
          {tc('continue')}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Button>
      </motion.div>
    </div>
  )
}
