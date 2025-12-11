use crate::adb::{
  command::run_device,
  error::{AdbError, Result},
};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone)]
struct FpsHistory {
  total_frames: u64,
  timestamp: u64, // unix timestamp in milliseconds
}

static FPS_HISTORY: Lazy<Mutex<HashMap<String, FpsHistory>>> = Lazy::new(|| Mutex::new(HashMap::new()));

#[derive(Debug, Clone)]
struct TrafficHistory {
  rx_bytes: u64,
  tx_bytes: u64,
  timestamp: u64,
}

static TRAFFIC_HISTORY: Lazy<Mutex<HashMap<String, TrafficHistory>>> =
  Lazy::new(|| Mutex::new(HashMap::new()));

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MetricKey {
  Fps,
  Cpu,
  Power,
  Memory,
  Network,
  Battery,
  BatteryTemp,
  Traffic,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrameStats {
  pub fps: f64,
  pub avg_frame_time: f64, // 平均帧耗时（毫秒）
  pub frame_times: Vec<f64>, // 最近的帧耗时数组
  pub jank_count: u32, // 帧率不稳定的次数
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MetricsSnapshot {
  pub fps: Option<f64>,
  pub cpu: Option<f64>,
  pub power: Option<f64>,
  pub memory_mb: Option<f64>,
  pub network_kbps: Option<f64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub network_bps: Option<f64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub rx_bytes: Option<u64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub tx_bytes: Option<u64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub rx_bps: Option<f64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub tx_bps: Option<f64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub battery_level: Option<f64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub battery_temp_c: Option<f64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub frame_stats: Option<FrameStats>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub raw: Option<String>,
}

#[derive(Debug, Clone)]
struct BatteryStats {
  level: Option<f64>,
  temp_c: Option<f64>,
}

#[derive(Debug, Clone)]
struct TrafficStats {
  rx_bytes: u64,
  tx_bytes: u64,
  rx_bps: Option<f64>,
  tx_bps: Option<f64>,
}

impl TrafficStats {
  fn total_bps(&self) -> Option<f64> {
    match (self.rx_bps, self.tx_bps) {
      (Some(rx), Some(tx)) => Some(rx + tx),
      (Some(rx), None) => Some(rx),
      (None, Some(tx)) => Some(tx),
      _ => None,
    }
  }

  fn total_kbps(&self) -> Option<f64> {
    self.total_bps().map(|v| v / 1024.0)
  }
}

pub fn collect_metrics(
  device_id: &str,
  package: &str,
  metrics: &[MetricKey],
) -> Result<MetricsSnapshot> {
  let mut snapshot = MetricsSnapshot::default();
  let need_pid = metrics
    .iter()
    .any(|m| matches!(m, MetricKey::Cpu | MetricKey::Traffic));
  let pid = if need_pid { resolve_pid(device_id, package).ok() } else { None };
  let mut battery_stats: Option<BatteryStats> = None;
  let mut traffic_stats: Option<TrafficStats> = None;

  for metric in metrics {
    match metric {
      MetricKey::Cpu => {
        if let Some(ref pid) = pid {
          snapshot.cpu = fetch_cpu(device_id, pid).ok();
        }
      }
      MetricKey::Memory => {
        snapshot.memory_mb = fetch_memory(device_id, package).ok();
      }
      MetricKey::Network => {
        snapshot.network_kbps = fetch_network(device_id).ok();
      }
      MetricKey::Traffic => {
        if traffic_stats.is_none() {
          if let Some(ref pid) = pid {
            traffic_stats = fetch_traffic(device_id, pid).ok();
          }
        }
        if let Some(ref traffic) = traffic_stats {
          snapshot.rx_bytes = Some(traffic.rx_bytes);
          snapshot.tx_bytes = Some(traffic.tx_bytes);
          snapshot.rx_bps = traffic.rx_bps;
          snapshot.tx_bps = traffic.tx_bps;
          snapshot.network_bps = traffic.total_bps();
          snapshot.network_kbps = traffic.total_kbps().or(snapshot.network_kbps);
        }
      }
      MetricKey::Fps => {
        if let Ok(frame_stats) = fetch_fps(device_id, package) {
          snapshot.fps = Some(frame_stats.fps);
          snapshot.frame_stats = Some(frame_stats);
        }
      }
      MetricKey::Power => {
        snapshot.power = fetch_power(device_id, package).ok();
      }
      MetricKey::Battery | MetricKey::BatteryTemp => {
        if battery_stats.is_none() {
          battery_stats = fetch_battery(device_id).ok();
        }
        if let Some(ref battery) = battery_stats {
          snapshot.battery_level = battery.level;
          snapshot.battery_temp_c = battery.temp_c;
        }
      }
    }
  }

  Ok(snapshot)
}

fn resolve_pid(device_id: &str, package: &str) -> Result<String> {
  let raw = run_device(device_id, &["shell", "pidof", package])?;
  raw.split_whitespace()
    .next()
    .map(|s| s.to_string())
    .ok_or_else(|| AdbError::ParseFailed("未找到进程".into()))
}

fn fetch_cpu(device_id: &str, pid: &str) -> Result<f64> {
  let raw = run_device(device_id, &["shell", "top", "-b", "-n", "1", "-q", "-p", pid])?;
  for line in raw.lines() {
    let parts: Vec<&str> = line.split_whitespace().collect();
    // top 命令输出格式通常是: PID USER PR NI VIRT RES SHR S %CPU %MEM TIME+ ARGS
    if parts.len() >= 9 && parts[0] == pid {
      if let Some(cpu_str) = parts.get(8) {
        if let Some(value) = cpu_str.parse::<f64>().ok() {
          // 确保 CPU 使用率不超过 100%
          return Ok(value.min(100.0));
        }
      }
    }
  }
  Err(AdbError::ParseFailed("CPU 解析失败".into()))
}

fn fetch_memory(device_id: &str, package: &str) -> Result<f64> {
  let raw = run_device(device_id, &["shell", "dumpsys", "meminfo", package])?;
  for line in raw.lines() {
    if line.contains("TOTAL") {
      if let Some(value) = line
        .split_whitespace()
        .filter_map(|t| t.parse::<f64>().ok())
        .next()
      {
        return Ok(value / 1024.0); // 转换为 MB
      }
    }
  }
  Err(AdbError::ParseFailed("内存解析失败".into()))
}

fn fetch_network(device_id: &str) -> Result<f64> {
  let raw = run_device(device_id, &["shell", "cat", "/proc/net/dev"])?;
  for line in raw.lines() {
    if line.contains("wlan0") || line.contains("rmnet") {
      let parts: Vec<&str> = line.split_whitespace().collect();
      if parts.len() >= 17 {
        let rx: f64 = parts[1].parse().unwrap_or(0.0);
        let tx: f64 = parts[9].parse().unwrap_or(0.0);
        // 粗略展示为 kbps（单次采样无法得出速率，此处仅返回累计 KB）
        return Ok((rx + tx) / 1024.0);
      }
    }
  }
  Err(AdbError::ParseFailed("网络解析失败".into()))
}

fn fetch_fps(device_id: &str, package: &str) -> Result<FrameStats> {
  let raw = run_device(device_id, &["shell", "dumpsys", "gfxinfo", package])?;

  let mut total_frames = None;
  let mut janky_frames = None;
  let mut percentile_90th = None;
  let mut percentile_95th = None;

  // 解析 dumpsys gfxinfo 的输出
  for line in raw.lines() {
    let line = line.trim();

    // 提取总帧数
    if let Some(total_str) = line.strip_prefix("Total frames rendered:") {
      if let Ok(total) = total_str.trim().parse::<u64>() {
        total_frames = Some(total);
      }
    }

    // 提取卡顿帧数
    if let Some(janky_str) = line.strip_prefix("Janky frames:") {
      // 格式可能是 "Janky frames: 50 (4.17%)"，我们只需要数字部分
      if let Some(num_str) = janky_str.split('(').next() {
        if let Ok(janky) = num_str.trim().parse::<u32>() {
          janky_frames = Some(janky);
        }
      }
    }

    // 提取90th百分位数
    if let Some(p90_str) = line.strip_prefix("90th percentile:") {
      if let Some(ms_str) = p90_str.strip_suffix("ms") {
        if let Ok(p90) = ms_str.trim().parse::<f64>() {
          percentile_90th = Some(p90);
        }
      }
    }

    // 提取95th百分位数
    if let Some(p95_str) = line.strip_prefix("95th percentile:") {
      if let Some(ms_str) = p95_str.strip_suffix("ms") {
        if let Ok(p95) = ms_str.trim().parse::<f64>() {
          percentile_95th = Some(p95);
        }
      }
    }
  }

  // 如果没有获取到总帧数，返回错误
  let total_frames = total_frames.ok_or_else(|| {
    AdbError::ParseFailed("无法获取帧数信息，请确保应用正在运行".into())
  })?;

  // 获取当前时间戳
  let now = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap()
    .as_millis() as u64;

  // 计算FPS（基于历史数据）
  let key = format!("{}:{}", device_id, package);
  let fps = if let Ok(history) = FPS_HISTORY.lock() {
    if let Some(prev) = history.get(&key) {
      let time_diff_sec = (now - prev.timestamp) as f64 / 1000.0;
      if time_diff_sec > 0.1 { // 至少间隔100ms
        let frame_diff = total_frames.saturating_sub(prev.total_frames);
        (frame_diff as f64) / time_diff_sec
      } else {
        // 时间间隔太短，使用估算值
        60.0
      }
    } else {
      // 第一次采样，使用估算值
      60.0
    }
  } else {
    60.0
  };

  // 更新历史记录
  if let Ok(mut history) = FPS_HISTORY.lock() {
    history.insert(key, FpsHistory {
      total_frames,
      timestamp: now,
    });
  }

  // 计算平均帧时间（基于90th百分位数，如果没有则使用默认值）
  let avg_frame_time = percentile_90th.unwrap_or(1000.0 / fps); // 如果没有百分位数据，用FPS计算

  // 使用卡顿帧数作为 jank_count
  let jank_count = janky_frames.unwrap_or(0);

  // 构造帧时间数组（包含90th和95th百分位数）
  let mut frame_times = vec![avg_frame_time];
  if let Some(p95) = percentile_95th {
    frame_times.push(p95);
  }

  Ok(FrameStats {
    fps,
    avg_frame_time,
    frame_times,
    jank_count,
  })
}

fn fetch_power(device_id: &str, package: &str) -> Result<f64> {
  // 首先尝试获取应用级别的功耗统计
  if let Ok(raw) = run_device(device_id, &["shell", "dumpsys", "batterystats", package]) {
    // 解析 batterystats 输出，查找功耗相关信息
    // 格式通常包含: Estimated power use (mAh): XXX
    for line in raw.lines() {
      let line = line.trim();
      if line.contains("Estimated power use") {
        // 尝试提取 mAh 值
        if let Some(ma_str) = line.split(':').nth(1) {
          if let Some(ma_str) = ma_str.split("mAh").next() {
            if let Ok(power) = ma_str.trim().parse::<f64>() {
              return Ok(power);
            }
          }
        }
      }
      // 或者查找其他功耗指标
      if line.contains("power use") || line.contains("Power use") {
        let parts: Vec<&str> = line.split_whitespace().collect();
        for part in parts {
          if let Ok(power) = part.parse::<f64>() {
            return Ok(power);
          }
        }
      }
    }
  }

  // 如果 batterystats 不可用，回退到简单的电池状态查询
  if let Ok(raw) = run_device(device_id, &["shell", "dumpsys", "battery"]) {
    // 优先查找电流信息（真正的功耗指标）
    for line in raw.lines() {
      let line = line.trim();
      if line.starts_with("current now:") {
        if let Some(current_str) = line.split(':').nth(1) {
          if let Ok(current) = current_str.trim().parse::<f64>() {
            // 只有当电流不为0时才返回（避免显示无意义的0值）
            if current.abs() > 100.0 { // 至少100微安
              // 电流通常是微安，转换为毫安
              return Ok(current / 1000.0);
            }
          }
        }
      }
    }

    // 如果没有有效的电流数据，不返回电压（电压不是功耗指标）
    // 让它返回错误，这样前端显示 N/A 更合适
  }

  // 如果都无法获取，返回 None 表示数据不可用
  Err(AdbError::ParseFailed("无法获取功耗数据".into()))
}

fn fetch_battery(device_id: &str) -> Result<BatteryStats> {
  let raw = run_device(device_id, &["shell", "dumpsys", "battery"])?;
  let mut level: Option<f64> = None;
  let mut temp_c: Option<f64> = None;

  for line in raw.lines() {
    let line = line.trim();
    if let Some(rest) = line.strip_prefix("level:") {
      level = rest.trim().parse::<f64>().ok();
    } else if let Some(rest) = line.strip_prefix("temperature:") {
      if let Ok(raw_temp) = rest.trim().parse::<f64>() {
        temp_c = Some(raw_temp / 10.0);
      }
    }
  }

  if level.is_none() && temp_c.is_none() {
    return Err(AdbError::ParseFailed("未获取到电池信息".into()));
  }

  Ok(BatteryStats { level, temp_c })
}

fn fetch_traffic(device_id: &str, pid: &str) -> Result<TrafficStats> {
  let raw = run_device(device_id, &["shell", "cat", &format!("/proc/{pid}/net/dev")])?;
  let mut rx_bytes: u64 = 0;
  let mut tx_bytes: u64 = 0;

  for line in raw.lines() {
    let line = line.trim();
    if line.is_empty() || line.starts_with("Inter-") || line.starts_with("face") {
      continue;
    }

    let mut parts = line.split(':');
    let iface = parts.next().unwrap_or("").trim();
    let payload = parts.next().unwrap_or("").trim();

    // 聚焦常见外网接口，跳过 lo
    let interested = iface.starts_with("wlan")
      || iface.starts_with("rmnet")
      || iface.starts_with("ccmni")
      || iface.starts_with("eth")
      || iface.starts_with("usb")
      || iface.starts_with("pdp")
      || iface.starts_with("cell")
      || iface.starts_with("rmnet_data");

    if !interested || iface.starts_with("lo") {
      continue;
    }

    let cols: Vec<&str> = payload.split_whitespace().collect();
    if cols.len() >= 16 {
      rx_bytes = rx_bytes.saturating_add(cols[0].parse::<u64>().unwrap_or(0));
      tx_bytes = tx_bytes.saturating_add(cols[8].parse::<u64>().unwrap_or(0));
    }
  }

  if rx_bytes == 0 && tx_bytes == 0 {
    return Err(AdbError::ParseFailed("未找到可用网络接口".into()));
  }

  let now = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .as_millis() as u64;
  let key = format!("{device_id}:{pid}");

  let mut rx_bps = None;
  let mut tx_bps = None;

  if let Ok(mut history) = TRAFFIC_HISTORY.lock() {
    if let Some(prev) = history.get(&key) {
      let dt_ms = now.saturating_sub(prev.timestamp).max(1);
      let rx_diff = rx_bytes.saturating_sub(prev.rx_bytes);
      let tx_diff = tx_bytes.saturating_sub(prev.tx_bytes);
      rx_bps = Some((rx_diff as f64) * 1000.0 / (dt_ms as f64));
      tx_bps = Some((tx_diff as f64) * 1000.0 / (dt_ms as f64));
    }

    history.insert(
      key,
      TrafficHistory {
        rx_bytes,
        tx_bytes,
        timestamp: now,
      },
    );
  }

  Ok(TrafficStats {
    rx_bytes,
    tx_bytes,
    rx_bps,
    tx_bps,
  })
}

