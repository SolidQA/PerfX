import { useEffect, useState } from "react"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { open } from "@tauri-apps/plugin-shell"
import { Minus, Maximize2, X, Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getPlatform } from "@/lib/platform"
import { useAppStore } from "@/stores/use-app-store"
import { useUpdateCheck } from "@/hooks/useUpdateCheck"

const appWindow = getCurrentWindow()

export function TitleBar() {
  const [platform, setPlatform] = useState<"macos" | "windows" | "linux">("macos")
  const { theme, setTheme, selectedDevice } = useAppStore()
  const version = __APP_VERSION__
  const update = useUpdateCheck(version)

  useEffect(() => {
    getPlatform().then(setPlatform)
  }, [])

  useEffect(() => {
    appWindow.setTitle(`PerfX v${version}`)
  }, [version])

  useEffect(() => {
    const root = document.documentElement
    if (theme === "dark") {
      root.classList.add("dark")
    } else {
      root.classList.remove("dark")
    }
  }, [theme])

  const handleMinimize = () => {
    appWindow.minimize()
  }

  const handleMaximize = () => {
    appWindow.toggleMaximize()
  }

  const handleClose = () => {
    appWindow.close()
  }

  const isMacOS = platform === "macos"
  const isWindows = platform === "windows"

  const deviceStateClass = (() => {
    if (!selectedDevice) return "bg-muted"
    const state = selectedDevice.state.toLowerCase()
    if (state.includes("offline") || state.includes("unauthorized")) return "bg-destructive"
    if (state.includes("online") || state.includes("device")) return "bg-emerald-500"
    return "bg-amber-500"
  })()

  const deviceLabel = selectedDevice ? (selectedDevice.model ?? selectedDevice.id) : "未选择设备"

  return (
    <div
      data-tauri-drag-region
      className="fixed top-0 left-0 right-0 z-50 flex h-8 select-none items-center border-b bg-background/95 backdrop-blur-md"
    >
      {/* 左侧：macOS 原生按钮区域 */}
      {isMacOS && <div data-tauri-drag-region className="w-[70px]" />}

      {/* 中间：应用名称 - 整个区域可拖动 */}
      <div data-tauri-drag-region className="flex flex-1 items-center gap-3 pl-4 pr-2">
        <span className="text-sm font-semibold pointer-events-none select-none">PerfX</span>
        <div className="pointer-events-none select-none flex items-center gap-2 rounded-full bg-muted/60 px-2 py-1">
          <span className={`h-2.5 w-2.5 rounded-full ${deviceStateClass}`} />
          <span className="text-xs text-foreground/80">
            {deviceLabel}
            {selectedDevice ? ` · ${selectedDevice.state}` : ""}
          </span>
        </div>
      </div>

      {/* 右侧：操作按钮和 Windows 窗口控制按钮 */}
      <div className="flex items-center gap-1.5 pr-2" data-tauri-drag-region="no-drag">
        <div className="mr-1 flex items-center gap-1 text-xs text-foreground/60 select-none" data-tauri-drag-region>
          <span title={`当前版本 v${version}`} data-tauri-drag-region className="pointer-events-none">{version}</span>
          {update.hasUpdate ? (
            <button
              type="button"
              className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-500 cursor-pointer hover:bg-emerald-500/25 hover:text-emerald-400"
              title={`发现新版本 v${update.latestVersion}`}
              data-tauri-drag-region="false"
              onClick={() => {
                if (update.releaseUrl) {
                  open(update.releaseUrl)
                }
              }}
            >
              有更新
            </button>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="h-5 w-5 rounded-sm"
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
        >
          {theme === "light" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
        </Button>
        {isWindows && (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              className="h-5 w-5 rounded-sm"
              onClick={handleMinimize}
            >
              <Minus className="h-2.5 w-2.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="h-5 w-5 rounded-sm"
              onClick={handleMaximize}
            >
              <Maximize2 className="h-2.5 w-2.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="h-5 w-5 rounded-sm hover:bg-destructive hover:text-destructive-foreground"
              onClick={handleClose}
            >
              <X className="h-2.5 w-2.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
