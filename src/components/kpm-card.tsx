import { useMemo } from "react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { timeTicks } from "@/components/char-card"
import { hhmm, MIN, num } from "@/lib/format"
import type { Snapshot } from "@/lib/types"
import { cn } from "@/lib/utils"

const config = {
  keys: { label: "キー/分", color: "var(--tracker-net)" },
} satisfies ChartConfig

export function KpmCard({ snap }: { snap: Snapshot }) {
  const { data, total, avg, peak, from, to } = useMemo(() => {
    const startMin = Math.floor(snap.dayStartMs / MIN)
    const nowMin = Math.floor(snap.nowMs / MIN)
    const map = new Map<number, number>()
    for (const [m, c] of snap.keyMinutes) if (m >= startMin) map.set(m, c)
    const counts = [...map.values()]
    const total = counts.reduce((a, b) => a + b, 0)
    const active = counts.filter((c) => c > 0).length
    const peak = counts.length ? Math.max(...counts) : 0
    const first = map.size ? Math.min(...map.keys()) : nowMin - 60
    const fromMin = Math.max(startMin, Math.min(first - 5, nowMin - 30))
    const rows = []
    for (let m = fromMin; m <= nowMin; m++) rows.push({ t: m * MIN, keys: map.get(m) ?? 0 })
    return {
      data: rows,
      total,
      avg: active ? total / active : 0,
      peak,
      from: fromMin * MIN,
      to: nowMin * MIN,
    }
  }, [snap.keyMinutes, snap.dayStartMs, snap.nowMs])

  const targets = snap.settings.targetApps
  const status = snap.listenerError
    ? snap.listenerError
    : targets.length === 0
      ? "対象アプリが未設定です（右下の歯車から設定）"
      : snap.targetFocused
        ? `計測中: ${snap.focusedApp}`
        : `待機中（前面: ${snap.focusedApp ?? "不明"}）`

  return (
    <Card className="gap-3">
      <CardHeader>
        <CardDescription className="text-[0.95rem]">分間キーストローク（直近 60 秒）</CardDescription>
        <CardAction>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "block size-2.5 rounded-full",
                  snap.listenerError
                    ? "bg-(--tracker-del)"
                    : snap.targetFocused
                      ? "bg-(--tracker-add) shadow-[0_0_0_3px] shadow-(color:--tracker-add)/25"
                      : "bg-muted-foreground/30",
                )}
              />
            </TooltipTrigger>
            <TooltipContent side="left">{status}</TooltipContent>
          </Tooltip>
        </CardAction>
        <CardTitle className="flex items-baseline gap-1">
          <span className="text-4xl font-bold tabular-nums tracking-tight">{snap.kpmNow}</span>
          <span className="text-base font-normal text-muted-foreground">KPM</span>
        </CardTitle>
        <div className="text-sm text-muted-foreground tabular-nums">
          今日 {num(total)} keys ・ 平均 {avg.toFixed(1)} ・ ピーク {peak}
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="aspect-auto h-[220px] w-full">
          <LineChart data={data} margin={{ left: 0, right: 12, top: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              domain={[from, to]}
              ticks={timeTicks(from, to)}
              tickFormatter={hhmm}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={44} />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent labelFormatter={(_, p) => hhmm(Number(p?.[0]?.payload?.t ?? 0))} />
              }
            />
            <Line
              dataKey="keys"
              type="stepAfter"
              stroke="var(--color-keys)"
              strokeWidth={1.75}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
