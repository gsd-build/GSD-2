"use client"

import { useCallback, useEffect, useState } from "react"
import { motion } from "motion/react"
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  MessageSquare,
  SkipForward,
} from "lucide-react"

import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { authFetch } from "@/lib/auth"

// ─── Types ──────────────────────────────────────────────────────────

type RemoteChannel = "slack" | "discord" | "telegram"

interface RemoteQuestionsApiResponse {
  config: {
    channel: RemoteChannel
    channelId: string
    timeoutMinutes: number
    pollIntervalSeconds: number
  } | null
  envVarSet: boolean
  tokenSet: boolean
  envVarName: string | null
  status: string
  error?: string
}

const CHANNEL_OPTIONS: { value: RemoteChannel; label: string }[] = [
  { value: "slack", label: "Slack" },
  { value: "discord", label: "Discord" },
  { value: "telegram", label: "Telegram" },
]

const CHANNEL_ID_PATTERNS: Record<RemoteChannel, RegExp> = {
  slack: /^[A-Z0-9]{9,12}$/,
  discord: /^\d{17,20}$/,
  telegram: /^-?\d{5,20}$/,
}

const ENV_KEYS: Record<RemoteChannel, string> = {
  slack: "SLACK_BOT_TOKEN",
  discord: "DISCORD_BOT_TOKEN",
  telegram: "TELEGRAM_BOT_TOKEN",
}

// ─── Component ──────────────────────────────────────────────────────

interface StepRemoteProps {
  onBack: () => void
  onNext: () => void
}

export function StepRemote({ onBack, onNext }: StepRemoteProps) {
  const t = useTranslations("onboarding.remote")
  const tc = useTranslations("common")
  const [channel, setChannel] = useState<RemoteChannel | null>(null)
  const [channelId, setChannelId] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [alreadyConfigured, setAlreadyConfigured] = useState(false)
  const [loading, setLoading] = useState(true)
  const [botToken, setBotToken] = useState("")
  const [showToken, setShowToken] = useState(false)
  const [savingToken, setSavingToken] = useState(false)
  const [tokenSet, setTokenSet] = useState(false)
  const [tokenSuccess, setTokenSuccess] = useState<string | null>(null)

  const channelDescriptions: Record<RemoteChannel, string> = {
    slack: t("channelDescriptions.slack"),
    discord: t("channelDescriptions.discord"),
    telegram: t("channelDescriptions.telegram"),
  }

  const channelIdHints: Record<RemoteChannel, string> = {
    slack: t("channelIdHints.slack"),
    discord: t("channelIdHints.discord"),
    telegram: t("channelIdHints.telegram"),
  }

  // Check if already configured
  useEffect(() => {
    authFetch("/api/remote-questions", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: RemoteQuestionsApiResponse) => {
        if (data.tokenSet) setTokenSet(true)
        if (data.status === "configured" && data.config) {
          setAlreadyConfigured(true)
          setChannel(data.config.channel)
          setChannelId(data.config.channelId)
          setSuccess(true)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const channelIdValid =
    channel !== null &&
    channelId.trim().length > 0 &&
    CHANNEL_ID_PATTERNS[channel].test(channelId.trim())

  const handleSave = useCallback(async () => {
    if (!channel || !channelIdValid) return
    setSaving(true)
    setError(null)

    try {
      const res = await authFetch("/api/remote-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          channelId: channelId.trim(),
          timeoutMinutes: 5,
          pollIntervalSeconds: 5,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? `${t("saveFailed")} (${res.status})`)
        return
      }
      setSuccess(true)
      setAlreadyConfigured(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failedToSave"))
    } finally {
      setSaving(false)
    }
  }, [channel, channelId, channelIdValid])

  const handleSaveToken = useCallback(async () => {
    if (!channel || !botToken.trim()) return
    setSavingToken(true)
    setError(null)
    setTokenSuccess(null)
    try {
      const res = await authFetch("/api/remote-questions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, token: botToken.trim() }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? `Token save failed (${res.status})`); return }
      setTokenSuccess(`Token saved (${json.masked})`)
      setTokenSet(true)
      setBotToken("")
      setShowToken(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save token")
    } finally {
      setSavingToken(false)
    }
  }, [channel, botToken])

  return (
    <div className="flex flex-col items-center">
      {/* Icon */}
      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", duration: 0.5, bounce: 0 }}
        className="mb-8"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-border/50 bg-card/50">
          <MessageSquare className="h-7 w-7 text-foreground/80" strokeWidth={1.5} />
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06, duration: 0.4 }}
        className="text-center"
      >
        <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {t("heading")}
        </h2>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {t("subheading")}
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12, duration: 0.45 }}
        className="mt-8 w-full max-w-md space-y-5"
      >
        {/* Already configured banner */}
        {success && (
          <div className="flex items-center gap-3 rounded-xl border border-success/15 bg-success/[0.04] px-4 py-3 text-sm">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
            <span className="text-muted-foreground">
              {alreadyConfigured && !saving
                ? t("connectedTo", { channel: channel ?? "channel" })
                : t("configSaved")}
            </span>
          </div>
        )}

        {/* Channel picker */}
        {!loading && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Channel</div>
            <div className="grid grid-cols-3 gap-2">
              {CHANNEL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setChannel(opt.value)
                    setError(null)
                    if (success && !alreadyConfigured) setSuccess(false)
                  }}
                  disabled={saving}
                  className={cn(
                    "rounded-xl border px-3 py-3 text-left transition-all duration-200",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    "active:scale-[0.97]",
                    channel === opt.value
                      ? "border-foreground/30 bg-foreground/[0.06]"
                      : "border-border/50 bg-card/50 hover:border-foreground/15 hover:bg-card/50",
                  )}
                >
                  <div className="text-sm font-medium text-foreground">{opt.label}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{channelDescriptions[opt.value]}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Channel ID input */}
        {channel && !loading && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Channel ID</div>
            <Input
              value={channelId}
              onChange={(e) => {
                setChannelId(e.target.value)
                if (error) setError(null)
              }}
              placeholder={channelIdHints[channel]}
              disabled={saving}
              className="font-mono text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter" && channelIdValid) {
                  void handleSave()
                }
              }}
            />
            {channelId.trim().length > 0 && !CHANNEL_ID_PATTERNS[channel].test(channelId.trim()) && (
              <p className="text-xs text-destructive/70">
                {t("channelFormatMismatch", { channel })}
              </p>
            )}
          </div>
        )}

        {/* Bot token input */}
        {channel && !loading && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">
              {t("botToken")}
              {tokenSet && (
                <span className="ml-2 text-success">{t("configured")}</span>
              )}
            </div>

            {tokenSuccess && (
              <div className="flex items-center gap-2 rounded-xl border border-success/15 bg-success/[0.04] px-3 py-2 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
                {tokenSuccess}
              </div>
            )}

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showToken ? "text" : "password"}
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  placeholder={`Paste your ${ENV_KEYS[channel]}`}
                  disabled={savingToken}
                  className="pr-9 font-mono text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && botToken.trim()) void handleSaveToken()
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowToken((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground transition-colors"
                >
                  {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleSaveToken()}
                disabled={!botToken.trim() || savingToken}
                className="gap-1.5 transition-transform active:scale-[0.96]"
              >
                {savingToken ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                Save
              </Button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/[0.06] px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Save button */}
        {channel && channelId.trim().length > 0 && !success && (
          <Button
            onClick={() => void handleSave()}
            disabled={!channelIdValid || saving}
            className="gap-2 transition-transform active:scale-[0.96]"
          >
            {saving ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {t("saveConnect")}
          </Button>
        )}

        {loading && (
          <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            Checking existing configuration…
          </div>
        )}
      </motion.div>

      {/* Navigation */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.3 }}
        className="mt-8 flex w-full max-w-md items-center justify-between"
      >
        <Button
          variant="ghost"
          onClick={onBack}
          className="text-muted-foreground transition-transform active:scale-[0.96]"
        >
          {tc("back")}
        </Button>
        <div className="flex items-center gap-2">
          {!success && (
            <Button
              variant="ghost"
              onClick={onNext}
              className="gap-1.5 text-muted-foreground transition-transform active:scale-[0.96]"
            >
              Skip
              <SkipForward className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            onClick={onNext}
            className="group gap-2 transition-transform active:scale-[0.96]"
          >
            {t("continue")}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
