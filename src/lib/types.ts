export type Settings = {
  targetApps: string[]
  filePath: string | null
  dayStartMinutes: number
  pollSeconds: number
  ignoreWhitespace: boolean
}

export type FileEvent = {
  t: number
  added: number
  removed: number
  total: number
}

export type Snapshot = {
  date: string
  dayStartMs: number
  nowMs: number
  settings: Settings
  fileTotal: number | null
  fileError: string | null
  startTotal: number | null
  fileEvents: FileEvent[]
  /** [epoch 分, 回数] */
  keyMinutes: [number, number][]
  kpmNow: number
  focusedApp: string | null
  targetFocused: boolean
  recentApps: string[]
  listenerError: string | null
}
