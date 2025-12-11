use crate::adb::error::{AdbError, Result};
use once_cell::sync::OnceCell;
use std::{
  path::Path,
  process::{Command, Stdio},
  sync::Mutex,
};

#[derive(Debug, Clone)]
pub struct AdbBinary {
  pub custom: Option<String>,
  pub bundled: Option<String>,
}

static ADB_BIN: OnceCell<Mutex<AdbBinary>> = OnceCell::new();

fn adb_bin() -> &'static Mutex<AdbBinary> {
  ADB_BIN.get_or_init(|| Mutex::new(AdbBinary { custom: None, bundled: None }))
}

pub fn set_adb_path(path: Option<String>) {
  if let Ok(mut guard) = adb_bin().lock() {
    guard.custom = normalize_path(path);
  }
}

pub fn set_bundled_adb_path(path: Option<String>) {
  if let Ok(mut guard) = adb_bin().lock() {
    guard.bundled = normalize_path(path).filter(|p| Path::new(p).exists());
  }
}

pub fn current_adb_path() -> String {
  resolve_adb_path().unwrap_or_else(|_| "adb".to_string())
}

fn normalize_path(path: Option<String>) -> Option<String> {
  path.map(|p| p.trim().to_string()).filter(|p| !p.is_empty())
}

pub fn run_host(args: &[&str]) -> Result<String> {
  let adb_path = resolve_adb_path()?;
  run_raw(&adb_path, args)
}

pub fn run_device(device_id: &str, args: &[&str]) -> Result<String> {
  let mut full = Vec::with_capacity(args.len() + 2);
  full.push("-s");
  full.push(device_id);
  full.extend_from_slice(args);
  let adb_path = resolve_adb_path()?;
  run_raw(&adb_path, &full)
}

fn run_raw(bin: &str, args: &[&str]) -> Result<String> {
  let mut cmd = Command::new(bin);
  cmd.args(args)
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());

  // 在Windows上避免弹出命令窗口
  #[cfg(target_os = "windows")]
  {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
  }

  let output = cmd.output().map_err(|_| AdbError::NotFound)?;

  if !output.status.success() {
    let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
    return Err(AdbError::CommandFailed(err));
  }

  Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn resolve_adb_path() -> Result<String> {
  if let Ok(guard) = adb_bin().lock() {
    if let Some(path) = guard.custom.clone() {
      return Ok(path);
    }
    if let Some(path) = guard.bundled.clone() {
      return Ok(path);
    }
  }

  Err(AdbError::NotFound)
}

#[allow(dead_code)]
pub fn try_ping_server() -> Result<()> {
  let _ = run_host(&["start-server"]).map_err(|e| AdbError::Client(format!("{e}")))?;
  Ok(())
}

