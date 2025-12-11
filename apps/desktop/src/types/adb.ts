export type MetricKey =
  | "fps"
  | "cpu"
  | "power"
  | "memory"
  | "network"
  | "battery"
  | "battery_temp"
  | "traffic"

export interface AdbDevice {
  id: string
  model?: string | null
  state: string
}

export interface AdbApp {
  package: string
  label?: string | null
  /**
   * 是否为系统应用（来自 pm list packages -s）
   */
  is_system?: boolean
}

export interface FrameStats {
  fps: number
  avg_frame_time: number // 平均帧耗时（毫秒）
  frame_times: number[] // 最近的帧耗时数组
  jank_count: number // 帧率不稳定的次数
}

export interface MetricsSnapshot {
  fps?: number | null
  cpu?: number | null
  power?: number | null
  memory_mb?: number | null
  network_kbps?: number | null
  network_bps?: number | null
  rx_bytes?: number | null
  tx_bytes?: number | null
  rx_bps?: number | null
  tx_bps?: number | null
  battery_level?: number | null
  battery_temp_c?: number | null
  frame_stats?: FrameStats | null
  raw?: string | null
}


