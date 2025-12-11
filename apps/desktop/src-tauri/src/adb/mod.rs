use serde::{Deserialize, Serialize};

pub mod app;
pub mod command;
pub mod device;
pub mod error;
pub mod metrics;

pub use app::list_apps;
pub use command::{set_adb_path, set_bundled_adb_path};
pub use device::list_devices;
pub use metrics::{collect_metrics, MetricKey, MetricsSnapshot};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceInfo {
  pub id: String,
  pub model: Option<String>,
  pub state: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppInfo {
  pub package: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub label: Option<String>,
  #[serde(default)]
  pub is_system: bool,
}


