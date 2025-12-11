use crate::adb::{
  collect_metrics, list_apps, list_devices, set_adb_path, AppInfo, DeviceInfo, MetricKey,
  MetricsSnapshot,
};
use log::{error, info};
use serde::Deserialize;
use tauri::async_runtime::spawn_blocking;

#[derive(Debug, Deserialize)]
pub struct ListAppsPayload {
  pub device_id: String,
  #[serde(default)]
  pub keyword: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct MetricsPayload {
  pub device_id: String,
  pub package: String,
  pub metrics: Vec<MetricKey>,
}

#[tauri::command]
pub async fn tauri_list_devices() -> Result<Vec<DeviceInfo>, String> {
  spawn_blocking(|| {
    match list_devices() {
      Ok(devices) => {
        info!("ADB设备搜索成功，找到 {} 个设备", devices.len());
        for device in &devices {
          info!("设备: {} (状态: {}, 型号: {:?})", device.id, device.state, device.model);
        }
        Ok(devices)
      }
      Err(e) => {
        error!("ADB设备搜索失败: {:?}", e);
        info!("当前ADB路径: {}", crate::adb::command::current_adb_path());
        Err(e)
      }
    }
  })
    .await
  .map_err(|e| format!("异步执行错误: {}", e.to_string()))?
  .map_err(|e| format!("ADB错误: {}", e.to_string()))
}

#[tauri::command]
pub async fn tauri_list_apps(payload: ListAppsPayload) -> Result<Vec<AppInfo>, String> {
  spawn_blocking(move || list_apps(&payload.device_id, payload.keyword.as_deref()))
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn tauri_get_metrics(payload: MetricsPayload) -> Result<MetricsSnapshot, String> {
  spawn_blocking(move || collect_metrics(&payload.device_id, &payload.package, &payload.metrics))
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn tauri_set_adb_path(path: Option<String>) -> Result<(), String> {
  spawn_blocking(move || {
    set_adb_path(path);
  })
  .await
  .map_err(|e| e.to_string())?;
  Ok(())
}

