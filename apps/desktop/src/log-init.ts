import { attachConsole, info as logInfo } from "@tauri-apps/plugin-log"

// Pipe webview console output into the Tauri log plugin so it is written to files.
void (async () => {
  try {
    await logInfo("[log-init] plugin log ready")
    await attachConsole()
    console.info("[log-init] webview console attached to native log files")
  } catch (error) {
    console.error("attachConsole failed", error)
  }
})()
