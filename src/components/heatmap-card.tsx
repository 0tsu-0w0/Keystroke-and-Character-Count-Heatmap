import { useMemo, useState, type ReactNode } from "react"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { hhmm, minutesToHHMM, MIN, num, signed, SLOT } from "@/lib/format"
import type { Snapshot } from "@/lib/types"
import { cn } from "@/lib/utils"

type Mode = "net" | "added" | "removed" | "keys"

const MODES: { value: Mode; label: string }[] = [
  { value: "net", label: "純増減" },
  { value: "added", label: "増加" },
  { value: "removed", label: "減少" },
  { value: "keys", label: "キー" },
]

// 0 = 変化なし、1–4 = 強さ
const GREENS = ["var(--heat-0)", "var(--heat-g1)", "var(--heat-g2)", "var(--heat-g3)", "var(--heat-g4)"]
const REDS = ["var(--heat-0)", "var(--heat-r1)", "var(--heat-r2)", "var(--heat-r3)", "var(--heat-r4)"]

type Slot = { start: number; added: number; removed: number; keys: number }

function level(v: number, max: number) {
  if (v <= 0 || max <= 0) return 0
  return Math.min(4, Math.max(1, Math.ceil((v / max) * 4)))
}

export function HeatmapCard({ snap, settingsButton }: { snap: Snapshot; settingsButton: ReactNode }) {
  const [mode, setMode] = useState<Mode>("net")

  const slots = useMemo(() => {
    const s: Slot[] = Array.from({ length: 96 }, (_, i) => ({
      start: snap.dayStartMs + i * SLOT,
      added: 0,
      removed: 0,
      keys: 0,
    }))
    const idx = (t: number) => Math.floor((t - snap.dayStartMs) / SLOT)
    for (const e of snap.fileEvents) {
      const i = idx(e.t)
      if (i >= 0 && i < 96) {
        s[i].added += e.added
        s[i].removed += e.removed
      }
    }
    for (const [m, c] of snap.keyMinutes) {
      const i = idx(m * MIN)
      if (i >= 0 && i < 96) s[i].keys += c
    }
    return s
  }, [snap.fileEvents, snap.keyMinutes, snap.dayStartMs])

  const valueOf = (s: Slot) =>
    mode === "net" ? s.added - s.removed : mode === "added" ? s.added : mode === "removed" ? s.removed : s.keys

  const max = Math.max(0, ...slots.map((s) => Math.abs(valueOf(s))))
  const currentIdx = Math.floor((snap.nowMs - snap.dayStartMs) / SLOT)
  const startMin = snap.settings.dayStartMinutes

  const colorFor = (v: number) => {
    const reds = mode === "removed" || (mode === "net" && v < 0)
    return (reds ? REDS : GREENS)[level(Math.abs(v), max)]
  }

  const cols = Array.from({ length: 24 }, (_, c) => slots.slice(c * 4, c * 4 + 4))
  const rowLabels = [0, 1, 2, 3].map((r) => `:${String((startMin + r * 15) % 60).padStart(2, "0")}`)

  const unit = mode === "keys" ? "keys" : "字"
  const fmt = (v: number) => (mode === "net" ? signed(v) : num(v))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl font-bold">今日の進捗</CardTitle>
        <CardDescription className="text-[0.95rem]">
          {snap.date} ・ 1 マス = 15 分（{minutesToHHMM(startMin)} 起点）
        </CardDescription>
        <CardAction className="flex items-center gap-4">
          <Legend mode={mode} />
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={0}
            value={mode}
            onValueChange={(v) => v && setMode(v as Mode)}
          >
            {MODES.map((m) => (
              <ToggleGroupItem key={m.value} value={m.value} className="px-3">
                {m.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {settingsButton}
        </CardAction>
      </CardHeader>
      <CardContent>
        <div
          className="grid gap-1.5 text-xs text-muted-foreground"
          style={{ gridTemplateColumns: "2.5rem repeat(24, minmax(0, 1fr))" }}
        >
          <div />
          {cols.map((col, c) => (
            <div key={c} className="pb-1 text-center tabular-nums">
              {String(new Date(col[0].start).getHours()).padStart(2, "0")}
            </div>
          ))}

          {[0, 1, 2, 3].map((r) => (
            <Row key={r} label={rowLabels[r]}>
              {cols.map((col, c) => {
                const s = col[r]
                const i = c * 4 + r
                const v = valueOf(s)
                const future = i > currentIdx
                return (
                  <Tooltip key={c}>
                    <TooltipTrigger asChild>
                      <div
                        className={cn(
                          "aspect-square rounded-md transition-colors",
                          future && "opacity-40",
                          i === currentIdx && "ring-2 ring-foreground/70 ring-offset-2 ring-offset-card",
                        )}
                        style={{ background: future ? "var(--heat-0)" : colorFor(v) }}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="font-medium">
                        {hhmm(s.start)}–{hhmm(s.start + SLOT)}
                      </div>
                      <div className="tabular-nums">
                        +{num(s.added)} / −{num(s.removed)}（{signed(s.added - s.removed)} 字）・ {num(s.keys)} keys
                      </div>
                    </TooltipContent>
                  </Tooltip>
                )
              })}
            </Row>
          ))}

          <div />
          {cols.map((col, c) => {
            const v = col.reduce((a, s) => a + valueOf(s), 0)
            return (
              <div
                key={c}
                title={`${hhmm(col[0].start)} 台: ${fmt(v)} ${unit}`}
                className={cn(
                  "pt-1 text-center text-[0.7rem] font-medium tabular-nums",
                  v === 0 && "text-muted-foreground/50",
                  v !== 0 && (mode === "removed" || v < 0 ? "text-(--tracker-del)" : "text-(--tracker-add-strong)"),
                )}
              >
                {v === 0 ? "·" : mode === "net" ? signed(v).replace("+", "") : num(v)}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <div className="flex items-center tabular-nums">{label}</div>
      {children}
    </>
  )
}

function Legend({ mode }: { mode: Mode }) {
  const sw = (c: string, k: number) => <span key={k} className="size-2.5 rounded-[3px]" style={{ background: c }} />
  return (
    <div className="hidden items-center gap-1 text-xs text-muted-foreground lg:flex">
      {(mode === "net" || mode === "removed") && (
        <>
          <span className="mr-0.5">減</span>
          {[...REDS].reverse().map(sw)}
        </>
      )}
      {mode === "net" && <span className="w-2" />}
      {mode !== "removed" && (
        <>
          {GREENS.map(sw)}
          <span className="ml-0.5">{mode === "keys" ? "多" : "増"}</span>
        </>
      )}
    </div>
  )
}
