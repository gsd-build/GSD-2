"use client"

import { motion } from "motion/react"
import { ArrowRight, Code2, MessageCircle } from "lucide-react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { UserMode } from "@/lib/use-user-mode"

interface StepModeProps {
  selected: UserMode | null
  onSelect: (mode: UserMode) => void
  onNext: () => void
  onBack: () => void
}

const MODE_OPTIONS: {
  id: UserMode
  labelKey: string
  iconKey: string
  icon: typeof Code2
}[] = [
  {
    id: "expert",
    labelKey: "expert.label",
    iconKey: "expert.tagline",
    icon: Code2,
  },
  {
    id: "vibe-coder",
    labelKey: "vibe.label",
    iconKey: "vibe.tagline",
    icon: MessageCircle,
  },
]

export function StepMode({ selected, onSelect, onNext, onBack }: StepModeProps) {
  const t = useTranslations("onboarding.mode")
  const tc = useTranslations("common")

  return (
    <div className="flex flex-col items-center text-center">
      <motion.h2
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
        style={{ textWrap: "balance" } as React.CSSProperties}
      >
        {t('heading')}
      </motion.h2>

      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06, duration: 0.4 }}
        className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground"
      >
        {t('subheading')}
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12, duration: 0.45 }}
        className="mt-8 grid w-full max-w-lg gap-3 sm:grid-cols-2"
      >
        {MODE_OPTIONS.map((opt) => {
          const isSelected = selected === opt.id
          const Icon = opt.icon

          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onSelect(opt.id)}
              className={cn(
                "group relative flex flex-col rounded-xl border px-5 py-5 text-left transition-all duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "active:scale-[0.98]",
                isSelected
                  ? "border-foreground/30 bg-foreground/[0.06] shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
                  : "border-border/50 bg-card/50 hover:border-foreground/15 hover:bg-card/50",
              )}
              data-testid={`onboarding-mode-${opt.id}`}
            >
              {/* Selection indicator */}
              <div className="absolute right-3.5 top-3.5">
                <div
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full border-[1.5px] transition-all duration-200",
                    isSelected
                      ? "border-foreground bg-foreground"
                      : "border-foreground/20",
                  )}
                >
                  {isSelected && (
                    <motion.svg
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                      viewBox="0 0 12 12"
                      className="h-2.5 w-2.5 text-background"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="2.5 6 5 8.5 9.5 3.5" />
                    </motion.svg>
                  )}
                </div>
              </div>

              {/* Icon */}
              <div
                className={cn(
                  "mb-4 flex h-10 w-10 items-center justify-center rounded-lg transition-colors duration-200",
                  isSelected
                    ? "bg-foreground/10"
                    : "bg-foreground/[0.04]",
                )}
              >
                <Icon
                  className={cn(
                    "h-5 w-5 transition-colors duration-200",
                    isSelected ? "text-foreground" : "text-muted-foreground",
                  )}
                  strokeWidth={1.5}
                />
              </div>

              {/* Label + tagline */}
              <div className="pr-7">
                <span className="text-[15px] font-semibold text-foreground">
                  {t(opt.labelKey)}
                </span>
                <span
                  className={cn(
                    "ml-2 text-xs font-medium transition-colors duration-200",
                    isSelected ? "text-muted-foreground" : "text-muted-foreground",
                  )}
                >
                  {t(opt.iconKey)}
                </span>
              </div>

              {/* Description */}
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                {opt.id === "expert" ? t('expert.description') : t('vibe.description')}
              </p>
            </button>
          )
        })}
      </motion.div>

      {/* Navigation */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.3 }}
        className="mt-8 flex w-full max-w-lg items-center justify-between"
      >
        <Button
          variant="ghost"
          onClick={onBack}
          className="text-muted-foreground transition-transform active:scale-[0.96]"
        >
          {t('common.back')}
        </Button>
        <Button
          onClick={onNext}
          disabled={!selected}
          className="group gap-2 transition-transform active:scale-[0.96]"
          data-testid="onboarding-mode-continue"
        >
          {t('common.continue')}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Button>
      </motion.div>
    </div>
  )
}
