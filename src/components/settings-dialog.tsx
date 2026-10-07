import { useEffect, useState } from "react"
import { FolderOpen, Plus, Settings2, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { isTauri, pickFile, saveSettings } from "@/lib/api"
import { hhmmToMinutes, minutesToHHMM } from "@/lib/format"
import type { Settings } from "@/lib/types"

type Props = {
  settings: Settings
  recentApps: string[]
  onSaved: () => void
}

export function SettingsDialog({ settings, recentApps, onSaved }: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Settings>(settings)
  const [appInput, setAppInput] = useState("")
  const [error, setError] = useState<string | null>(null)

  // 開くたびに現在の設定から編集を始める
  useEffect(() => {
    if (open) {
      setDraft(settings)
      setAppInput("")
      setError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const addApp = (name: string) => {
    const n = name.trim()
    if (!n) return
    setDraft((d) =>
      d.targetApps.some((a) => a.toLowerCase() === n.toLowerCase()) ? d : { ...d, targetApps: [...d.targetApps, n] },
    )
    setAppInput("")
  }

  const suggestions = recentApps.filter((a) => !draft.targetApps.some((t) => t.toLowerCase() === a.toLowerCase()))

  const save = async () => {
    try {
      await saveSettings({ ...draft, targetApps: appInput.trim() ? [...draft.targetApps, appInput.trim()] : draft.targetApps })
      setOpen(false)
      onSaved()
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="設定">
          <Settings2 />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>設定</DialogTitle>
          <DialogDescription>計測するアプリと文字数を数えるファイルを指定します。</DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          <section className="grid gap-2">
            <Label>計測対象のアプリ</Label>
            <div className="flex min-h-9 flex-wrap gap-1.5">
              {draft.targetApps.length === 0 && (
                <span className="text-sm text-muted-foreground">未設定（キーストロークは記録されません）</span>
              )}
              {draft.targetApps.map((a) => (
                <Badge key={a} variant="secondary" className="gap-1 pr-1">
                  {a}
                  <button
                    type="button"
                    aria-label={`${a} を外す`}
                    className="rounded-sm opacity-60 hover:opacity-100"
                    onClick={() => setDraft((d) => ({ ...d, targetApps: d.targetApps.filter((x) => x !== a) }))}
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="実行ファイル名（例: Code.exe）"
                value={appInput}
                onChange={(e) => setAppInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addApp(appInput)}
              />
              <Button variant="outline" onClick={() => addApp(appInput)}>
                <Plus /> 追加
              </Button>
            </div>
            {suggestions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                最近前面にあったアプリ:
                {suggestions.slice(0, 8).map((a) => (
                  <Button key={a} variant="outline" size="xs" onClick={() => addApp(a)}>
                    {a}
                  </Button>
                ))}
              </div>
            )}
          </section>

          <Separator />

          <section className="grid gap-2">
            <Label htmlFor="file">文字数を数えるファイル</Label>
            <div className="flex gap-2">
              <Input
                id="file"
                placeholder="C:\path\to\manuscript.md"
                value={draft.filePath ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, filePath: e.target.value || null }))}
              />
              <Button
                variant="outline"
                disabled={!isTauri}
                onClick={async () => {
                  const p = await pickFile()
                  if (p) setDraft((d) => ({ ...d, filePath: p }))
                }}
              >
                <FolderOpen /> 参照
              </Button>
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="ws" className="font-normal text-muted-foreground">
                空白（スペース・タブ）も数えない ※改行は常に数えません
              </Label>
              <Switch
                id="ws"
                checked={draft.ignoreWhitespace}
                onCheckedChange={(v) => setDraft((d) => ({ ...d, ignoreWhitespace: v }))}
              />
            </div>
          </section>

          <Separator />

          <section className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="daystart">日付を切り替える時刻</Label>
              <Input
                id="daystart"
                type="time"
                step={900}
                value={minutesToHHMM(draft.dayStartMinutes)}
                onChange={(e) => setDraft((d) => ({ ...d, dayStartMinutes: hhmmToMinutes(e.target.value) }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="poll">ファイル確認の間隔（秒）</Label>
              <Input
                id="poll"
                type="number"
                min={1}
                max={60}
                value={draft.pollSeconds}
                onChange={(e) => setDraft((d) => ({ ...d, pollSeconds: Math.max(1, Number(e.target.value) || 1) }))}
              />
            </div>
          </section>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            キャンセル
          </Button>
          <Button onClick={save}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
