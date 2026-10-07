import { useMemo } from "react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { hhmm, minutesToHHMM, num, signed } from "@/lib/format"
import type { Snapshot } from "@/lib/types"
import { cn } from "@/lib/utils"

const config = {
  net: { label: "純増減", color: "var(--tracker-net)" },
  added: { label: "増加", color: "var(--tracker-add)" },
  removed: { label: "減少", color: "var(--tracker-del)" },
} satisfies ChartConfig

export function timeTicks(from: number, to: number, count = 7) {
  const step = (to - from) / (count - 1)
  return Array.from({ length: count }, (_, i) => Math.round(from + step * i))
}

export function CharCard({ snap }: { snap: Snapshot }) {
  const { data, added, removed } = useMemo(() => {
    let a = 0
    let r = 0
    const rows = [{ t: snap.dayStartMs, net: 0, added: 0, removed: 0 }]
    for (const e of snap.fileEvents) {
      if (e.t < snap.dayStartMs) continue
      a += e.added
      r += e.removed
      rows.push({ t: e.t, net: a - r, added: a, removed: r })
    }
    rows.push({ t: snap.nowMs, net: a - r, added: a, removed: r })
    return { data: rows, added: a, removed: r }
  }, [snap.fileEvents, snap.dayStartMs, snap.nowMs])

  const net = added - removed
  const noFile = !snap.settings.filePath

  return (
    <Card className="gap-3">
      <CardHeader>
        <CardDescription className="text-[0.95rem]">
          文字数の変化（{minutesToHHMM(snap.settings.dayStartMinutes)} から）
        </CardDescription>
        <CardTitle className="flex items-baseline gap-1">
          <span
            className={cn(
              "text-4xl font-bold tabular-nums tracking-tight",
              net > 0 && "text-(--tracker-add-strong)",
              net < 0 && "text-(--tracker-del)",
            )}
          >
            {signed(net)}
          </span>
          <span className="text-base font-normal text-muted-foreground">字</span>
        </CardTitle>
        <div className="text-sm text-muted-foreground tabular-nums">
          <span className="text-(--tracker-add-strong)">+{num(added)}</span>
          {" / "}
          <span className="text-(--tracker-del)">−{num(removed)}</span>
          {"  ・  "}
          {noFile ? (
            "ファイル未設定"
          ) : snap.fileError ? (
            <span className="text-(--tracker-del)">{snap.fileError}</span>
          ) : (
            <>現在 {snap.fileTotal != null ? num(snap.fileTotal) : "—"} 字</>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="aspect-auto h-[220px] w-full">
          <LineChart data={data} margin={{ left: 0, right: 12, top: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              domain={[snap.dayStartMs, snap.nowMs]}
              ticks={timeTicks(snap.dayStartMs, snap.nowMs)}
              tickFormatter={hhmm}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={44} />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(_, p) => hhmm(Number(p?.[0]?.payload?.t ?? 0))}
                />
              }
            />
            <Line
              dataKey="added"
              type="stepAfter"
              stroke="var(--color-added)"
              strokeDasharray="4 3"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              dataKey="removed"
              type="stepAfter"
              stroke="var(--color-removed)"
              strokeDasharray="4 3"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              dataKey="net"
              type="stepAfter"
              stroke="var(--color-net)"
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
