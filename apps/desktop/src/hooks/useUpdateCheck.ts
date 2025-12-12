import { useEffect, useState } from "react"

const REPO = "SolidQA/PerfX"
const STORAGE_KEY = "perfx:lastUpdateCheck"
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

type UpdateInfo = {
  hasUpdate: boolean
  latestVersion: string | null
  releaseUrl: string | null
  error?: string
}

function normalizeVersion(v: string) {
  return v.trim().replace(/^v/i, "")
}

function compareSemver(a: string, b: string) {
  const pa = normalizeVersion(a)
    .split(".")
    .map(n => Number(n) || 0)
  const pb = normalizeVersion(b)
    .split(".")
    .map(n => Number(n) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da > db) return 1
    if (da < db) return -1
  }
  return 0
}

export function useUpdateCheck(currentVersion: string) {
  const [info, setInfo] = useState<UpdateInfo>({
    hasUpdate: false,
    latestVersion: null,
    releaseUrl: null,
  })
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    // Dev-only mock for UI preview: set localStorage key to a version string.
    const mockLatest = import.meta.env.DEV
      ? window.localStorage.getItem("perfx:mockLatestVersion")
      : null
    if (mockLatest) {
      const latest = normalizeVersion(mockLatest)
      setInfo({
        hasUpdate: compareSemver(latest, currentVersion) > 0,
        latestVersion: latest,
        releaseUrl: `https://github.com/${REPO}/releases/latest`,
      })
      setChecking(false)
      return
    }

    const last = Number(window.localStorage.getItem(STORAGE_KEY) || 0)
    if (Date.now() - last < CHECK_INTERVAL_MS) return

    let canceled = false
    const run = async () => {
      setChecking(true)
      try {
        const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
          headers: {
            Accept: "application/vnd.github+json",
          },
        })
        if (!res.ok) throw new Error(`GitHub API ${res.status}`)
        const data: { tag_name?: string; html_url?: string } = await res.json()
        const latest = data.tag_name ? normalizeVersion(data.tag_name) : null
        const url = data.html_url || null
        window.localStorage.setItem(STORAGE_KEY, String(Date.now()))

        if (canceled) return
        if (latest && url && compareSemver(latest, currentVersion) > 0) {
          setInfo({
            hasUpdate: true,
            latestVersion: latest,
            releaseUrl: url,
          })
        } else {
          setInfo({
            hasUpdate: false,
            latestVersion: latest,
            releaseUrl: url,
          })
        }
      } catch (err) {
        if (!canceled) {
          setInfo({
            hasUpdate: false,
            latestVersion: null,
            releaseUrl: null,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      } finally {
        if (!canceled) setChecking(false)
      }
    }

    run()

    return () => {
      canceled = true
    }
  }, [currentVersion])

  return { ...info, checking }
}
