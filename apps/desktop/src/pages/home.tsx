import { HeaderBar } from "@/components/header"
import { useAdbApps } from "@/hooks/useAdbApps"
import { useAdbDevices } from "@/hooks/useAdbDevices"
import { useAdbMetrics } from "@/hooks/useAdbMetrics"
import type { MetricKey } from "@/types/adb"
import { ChartList, ChartItem } from "@/components/charts/ChartList"
import { useEffect, useMemo, useRef, useState } from "react"
import { useAppStore } from "@/stores/use-app-store"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Cpu, Gauge, Zap, Database, ArrowUpDown } from "lucide-react"

const METRIC_KEYS: MetricKey[] = ["cpu", "memory", "power", "traffic", "fps"]
const DEFAULT_METRICS: MetricKey[] = ["cpu"]
const STORAGE_KEYS = {
  device: "perfcat:selected_device",
  app: "perfcat:selected_app",
  metrics: "perfcat:selected_metrics",
}

function readStoredDevice() {
  if (typeof window === "undefined") return ""
  return window.localStorage.getItem(STORAGE_KEYS.device) ?? ""
}

function readStoredApp() {
  if (typeof window === "undefined") return ""
  return window.localStorage.getItem(STORAGE_KEYS.app) ?? ""
}

function readStoredMetrics(): MetricKey[] {
  if (typeof window === "undefined") return DEFAULT_METRICS
  try {
    const saved = window.localStorage.getItem(STORAGE_KEYS.metrics)
    if (!saved) return DEFAULT_METRICS
    const parsed = JSON.parse(saved)
    if (Array.isArray(parsed)) {
      const valid = parsed.filter((m: string): m is MetricKey => METRIC_KEYS.includes(m as MetricKey))
      if (valid.length) return valid
    }
  } catch {
    // ignore parse errors
  }
  return DEFAULT_METRICS
}

export function HomePage() {
  const [selectedDevice, setSelectedDevice] = useState<string>(() => readStoredDevice())
  const [selectedApp, setSelectedApp] = useState<string>(() => readStoredApp())
  const [selectedMetrics, setSelectedMetrics] = useState<MetricKey[]>(() => readStoredMetrics())
  const { setSelectedDevice: setSelectedDeviceInStore } = useAppStore()
  const prevDeviceRef = useRef<string | null>(null)

  const {
    devices,
    search: deviceSearch,
    setSearch: setDeviceSearch,
    loading: loadingDevices,
    refresh: refreshDevices,
  } = useAdbDevices()

  const {
    apps,
    search: appSearch,
    setSearch: setAppSearch,
    loading: loadingApps,
    error: appError,
    refresh: refreshApps,
  } = useAdbApps(selectedDevice || null)

  const { data: metrics, running, start, stop } = useAdbMetrics()

  // 将当前选择写回 localStorage
  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(STORAGE_KEYS.device, selectedDevice)
      window.localStorage.setItem(STORAGE_KEYS.app, selectedApp)
      window.localStorage.setItem(STORAGE_KEYS.metrics, JSON.stringify(selectedMetrics))
    } catch {
      // ignore
    }
  }, [selectedDevice, selectedApp, selectedMetrics])

  useEffect(() => {
    const prev = prevDeviceRef.current
    if (prev !== null && prev !== selectedDevice) {
      setSelectedApp("")
      setAppSearch("")
    }
    if (selectedDevice) {
      refreshApps()
    }
    prevDeviceRef.current = selectedDevice
  }, [selectedDevice, setAppSearch, refreshApps])

  const handleStart = () => {
    if (!selectedDevice || !selectedApp || selectedMetrics.length === 0) return
    const metricsToRequest = Array.from(
      new Set([
        ...selectedMetrics,
        ...(selectedMetrics.includes("power") ? (["battery", "battery_temp"] as MetricKey[]) : []),
      ])
    )
    start({
      deviceId: selectedDevice,
      packageName: selectedApp,
      metrics: metricsToRequest,
      intervalMs: 1000,
    })
  }

  // 模拟实时数据：每秒追加一条随机 CPU 数据，最多保留 120s
  const [history, setHistory] = useState<Record<string, number | string>[]>([])
  const lastValuesRef = useRef<{
    fps?: number
    cpu?: number
    power?: number
    memory?: number
    battery?: number
    battery_temp?: number
    traffic_rx?: number
    traffic_tx?: number
  }>({})

  // 监控开始时重置时间与历史
  useEffect(() => {
    if (running) {
      setHistory([])
      lastValuesRef.current = {}
    }
  }, [running])

  // 收集实时指标历史
  useEffect(() => {
    if (!metrics || !running) return

    const now = Date.now()
    const timeLabel = new Date(now).toLocaleTimeString("zh-CN", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })

    // 更新最新值（有值才覆盖）
    if (metrics.fps !== null && metrics.fps !== undefined) lastValuesRef.current.fps = metrics.fps
    if (metrics.cpu !== null && metrics.cpu !== undefined) lastValuesRef.current.cpu = metrics.cpu
    if (metrics.power !== null && metrics.power !== undefined) lastValuesRef.current.power = metrics.power
    if (metrics.memory_mb !== null && metrics.memory_mb !== undefined) lastValuesRef.current.memory = metrics.memory_mb
    if (metrics.battery_level !== null && metrics.battery_level !== undefined)
      lastValuesRef.current.battery = metrics.battery_level
    if (metrics.battery_temp_c !== null && metrics.battery_temp_c !== undefined)
      lastValuesRef.current.battery_temp = metrics.battery_temp_c

    // 流量：优先使用速率（bps），转换为 KB/s；若无速率但有总字节则沿用上次值
    const rxKbps =
      metrics.rx_bps !== null && metrics.rx_bps !== undefined ? metrics.rx_bps / 1024 : undefined
    const txKbps =
      metrics.tx_bps !== null && metrics.tx_bps !== undefined ? metrics.tx_bps / 1024 : undefined

    if (rxKbps !== undefined) lastValuesRef.current.traffic_rx = rxKbps
    if (txKbps !== undefined) lastValuesRef.current.traffic_tx = txKbps

    const {
      fps,
      cpu,
      power,
      memory,
      battery,
      battery_temp,
      traffic_rx,
      traffic_tx,
    } = lastValuesRef.current

    // 仅当至少有一个有效值时记录
    if ([fps, cpu, power, memory, battery, battery_temp, traffic_rx, traffic_tx].some((v) => v !== undefined)) {
      setHistory((prev) =>
        [
          ...prev,
          {
            time: timeLabel,
            fps: fps ?? 0,
            cpu: cpu ?? 0,
            power: power ?? 0,
            memory: memory ?? 0,
            battery: battery ?? 0,
            battery_temp: battery_temp ?? 0,
            traffic_rx: traffic_rx ?? 0,
            traffic_tx: traffic_tx ?? 0,
          },
        ].slice(-600)
      )
    }
  }, [metrics])

  const chartData = useMemo(() => history, [history])

  // 同步所选设备信息到全局，以便标题栏展示
  useEffect(() => {
    const device = devices.find((item) => item.id === selectedDevice) ?? null
    setSelectedDeviceInStore(device)
  }, [devices, selectedDevice, setSelectedDeviceInStore])

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <HeaderBar
        deviceId={selectedDevice}
        devices={devices}
        deviceSearch={deviceSearch}
        loadingDevices={loadingDevices}
        onDeviceChange={(value) => {
          setSelectedDevice(value)
          refreshDevices()
        }}
        onDeviceSearch={setDeviceSearch}
        onRefreshDevices={refreshDevices}
        appId={selectedApp}
        apps={apps}
        appSearch={appSearch}
        loadingApps={loadingApps}
        appError={appError}
        onRefreshApps={refreshApps}
        onAppChange={setSelectedApp}
        onAppSearch={setAppSearch}
        metrics={selectedMetrics}
        onMetricsChange={setSelectedMetrics}
        running={running}
        onStart={handleStart}
        onStop={stop}
      />

      <main className="flex-1 overflow-hidden min-h-0">
        <ScrollArea className="h-full">
          <div className="p-4">
            <ChartList initialBrush={{ start: 0, end: 100 }}>
              {selectedMetrics.includes("cpu") && (
                <ChartItem
                  key="cpu"
                  title="CPU (%)"
                  icon={<Cpu size={14} strokeWidth={1.8} />}
                  data={chartData}
                  xKey="time"
                  yDomain={[0, 100]}
                  height={224}
                  lines={[{ dataKey: "cpu", label: "CPU", color: "hsl(217, 91%, 60%)" }]}
                />
              )}
              {selectedMetrics.includes("fps") && (
                <ChartItem
                  key="fps"
                  title="FPS"
                  icon={<Gauge size={14} strokeWidth={1.8} />}
                  data={chartData}
                  xKey="time"
                  yDomain={[0, 120]}
                  height={224}
                  lines={[{ dataKey: "fps", label: "FPS", color: "hsl(291, 64%, 42%)" }]}
                />
              )}
              {selectedMetrics.includes("power") && (
                <ChartItem
                  key="power"
                  title="耗能 / 电池"
                  icon={<Zap size={14} strokeWidth={1.8} />}
                  data={chartData}
                  xKey="time"
                  height={224}
                  lines={[
                    { dataKey: "power", label: "功耗 (mA)", color: "hsl(16, 90%, 55%)" },
                    { dataKey: "battery", label: "电量 (%)", color: "hsl(45, 90%, 55%)" },
                    { dataKey: "battery_temp", label: "温度 (°C)", color: "hsl(10, 80%, 55%)" },
                  ]}
                />
              )}
              {selectedMetrics.includes("memory") && (
                <ChartItem
                  key="memory"
                  title="内存 (MB)"
                  icon={<Database size={14} strokeWidth={1.8} />}
                  data={chartData}
                  xKey="time"
                  height={224}
                  lines={[{ dataKey: "memory", label: "内存", color: "hsl(200, 80%, 45%)" }]}
                />
              )}
              {selectedMetrics.includes("traffic") && (
                <ChartItem
                  key="traffic"
                  title="流量 (KB/s)"
                  icon={<ArrowUpDown size={14} strokeWidth={1.8} />}
                  data={chartData}
                  xKey="time"
                  height={224}
                  lines={[
                    { dataKey: "traffic_rx", label: "下行", color: "hsl(120, 70%, 40%)" },
                    { dataKey: "traffic_tx", label: "上行", color: "hsl(200, 70%, 50%)" },
                  ]}
                />
              )}
            </ChartList>
          </div>
        </ScrollArea>
      </main>
    </div>
  )
}
