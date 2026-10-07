import { useCallback, useEffect, useState } from "react"
import { getSnapshot } from "@/lib/api"
import type { Snapshot } from "@/lib/types"

export function useSnapshot(intervalMs = 1000) {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setSnap(await getSnapshot())
      setError(null)
    } catch (e) {
      setError(String(e))
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, intervalMs)
    return () => clearInterval(id)
  }, [refresh, intervalMs])

  return { snap, error, refresh }
}
