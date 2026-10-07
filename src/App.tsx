import { CharCard } from "@/components/char-card"
import { HeatmapCard } from "@/components/heatmap-card"
import { KpmCard } from "@/components/kpm-card"
import { SettingsDialog } from "@/components/settings-dialog"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useSnapshot } from "@/hooks/use-snapshot"
import { isTauri } from "@/lib/api"

export default function App() {
  const { snap, error, refresh } = useSnapshot()

  return (
    <TooltipProvider delayDuration={150}>
      <main className="min-h-screen bg-muted/60 p-4">
        {!snap ? (
          <div className="grid h-[80vh] place-items-center text-muted-foreground">
            {error ?? "読み込み中…"}
          </div>
        ) : (
          <div className="mx-auto grid max-w-[1600px] gap-4">
            {!isTauri && (
              <div className="rounded-lg border border-dashed bg-card px-4 py-2 text-sm text-muted-foreground">
                ブラウザでのプレビュー中です（デモデータを表示しています）。実データは Tauri アプリとして起動すると表示されます。
              </div>
            )}
            <div className="grid gap-4 lg:grid-cols-2">
              <CharCard snap={snap} />
              <KpmCard snap={snap} />
            </div>
            <HeatmapCard
              snap={snap}
              settingsButton={<SettingsDialog settings={snap.settings} recentApps={snap.recentApps} onSaved={refresh} />}
            />
          </div>
        )}
      </main>
    </TooltipProvider>
  )
}
