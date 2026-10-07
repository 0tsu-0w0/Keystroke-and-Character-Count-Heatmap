import { invoke } from "@tauri-apps/api/core"
import type { Settings, Snapshot } from "./types"
import { MIN } from "./format"

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

// ───── ブラウザでのプレビュー用デモデータ ─────
let demoSettings: Settings = {
  targetApps: ["Code.exe"],
  filePath: "C:\\Users\\me\\novel\\chapter3.md",
  dayStartMinutes: 4 * 60,
  pollSeconds: 2,
  ignoreWhitespace: false,
}

function demoSnapshot(): Snapshot {
  const now = Date.now()
  const d = new Date(now - demoSettings.dayStartMinutes * MIN)
  d.setHours(0, 0, 0, 0)
  const dayStartMs = d.getTime() + demoSettings.dayStartMinutes * MIN
  let rnd = 7
  const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647)
  const events = []
  const keyMinutes: [number, number][] = []
  let total = 16_000
  for (let t = dayStartMs + 3 * 60 * MIN; t < now; t += 4 * MIN) {
    const hour = new Date(t).getHours()
    const busy = (hour >= 9 && hour < 12) || (hour >= 14 && hour < 18) || hour >= 20
    if (!busy || rand() < 0.35) continue
    const added = Math.floor(rand() * 60)
    const removed = Math.floor(rand() * rand() * 30)
    total += added - removed
    events.push({ t, added, removed, total })
    for (let k = 0; k < 4; k++) keyMinutes.push([Math.floor(t / MIN) + k, Math.floor(rand() * 40)])
  }
  return {
    date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    dayStartMs,
    nowMs: now,
    settings: demoSettings,
    fileTotal: total,
    fileError: null,
    startTotal: 16_000,
    fileEvents: events,
    keyMinutes,
    kpmNow: Math.floor(rand() * 30),
    focusedApp: "Code.exe",
    targetFocused: true,
    recentApps: ["Code.exe", "WINWORD.EXE", "notepad.exe", "obsidian.exe"],
    listenerError: null,
  }
}

export async function getSnapshot(): Promise<Snapshot> {
  return isTauri ? invoke<Snapshot>("get_snapshot") : demoSnapshot()
}

export async function saveSettings(settings: Settings): Promise<void> {
  if (isTauri) return invoke("save_settings", { settings })
  demoSettings = settings
}

export async function pickFile(): Promise<string | null> {
  if (!isTauri) return null
  const { open } = await import("@tauri-apps/plugin-dialog")
  const res = await open({
    multiple: false,
    directory: false,
    filters: [
      { name: "テキスト", extensions: ["txt", "md", "tex", "markdown", "org", "rst", "html"] },
      { name: "すべてのファイル", extensions: ["*"] },
    ],
  })
  return typeof res === "string" ? res : null
}
