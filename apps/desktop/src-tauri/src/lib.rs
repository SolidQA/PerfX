mod adb;
mod commands;

use crate::adb::set_bundled_adb_path;
use std::{env, path::PathBuf};
use tauri::{path::BaseDirectory, Manager};
use tauri_plugin_log::{Target, TargetKind, WEBVIEW_TARGET};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_sql::Builder::default().build())
    .plugin(tauri_plugin_shell::init())
    .plugin(
      tauri_plugin_log::Builder::new()
        .level(log::LevelFilter::Info)
        .max_file_size(5_000_000)
        .clear_targets()
        .targets([
          Target::new(TargetKind::LogDir {
            file_name: Some("webview".into())
          })
          .filter(|metadata| metadata.target().starts_with(WEBVIEW_TARGET)),
          Target::new(TargetKind::LogDir {
            file_name: Some("rust".into())
          })
          .filter(|metadata| !metadata.target().starts_with(WEBVIEW_TARGET)),
          Target::new(TargetKind::Stdout),
        ])
        .build(),
    )
    .invoke_handler(tauri::generate_handler![
      commands::tauri_list_devices,
      commands::tauri_list_apps,
      commands::tauri_get_metrics,
      commands::tauri_set_adb_path
    ])
    .setup(|app| {
      if let Some(window) = app.get_webview_window("main") {
        #[cfg(target_os = "macos")]
        {
          // macOS: 使用 Overlay 样式，保留原生按钮
          let _ = window.set_title_bar_style(tauri::TitleBarStyle::Overlay);
        }

        #[cfg(target_os = "windows")]
        {
          // Windows: 禁用原生装饰，使用自定义标题栏
          let _ = window.set_decorations(false);
        }
      }

      #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
      {
        let resolver = app.path();

        #[cfg(target_os = "macos")]
        let adb_relative_path = PathBuf::from("adb").join("adb");
        #[cfg(target_os = "windows")]
        let adb_relative_path = PathBuf::from("adb").join("adb.exe");
        #[cfg(target_os = "linux")]
        let adb_relative_path = PathBuf::from("adb").join("adb");

        let mut resolved_path = resolver
          .resolve(&adb_relative_path, BaseDirectory::Resource)
          .ok()
          .filter(|p| p.exists());

        if resolved_path.is_none() {
          if let Ok(resource_dir) = resolver.resource_dir() {
            let candidate = resource_dir.join(&adb_relative_path);
            if candidate.exists() {
              resolved_path = Some(candidate);
            }
          }
        }

        if resolved_path.is_none() {
          if let Ok(exe) = env::current_exe() {
            if let Some(parent) = exe.parent() {
              let candidate = parent.join("resources").join(&adb_relative_path);
              if candidate.exists() {
                resolved_path = Some(candidate);
              }
            }
          }
        }

        if resolved_path.is_none() {
          let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
          path.push("resources");
          path.push(&adb_relative_path);
          if path.exists() {
            resolved_path = Some(path);
          }
        }

        if let Some(path) = resolved_path {
          log::info!("Bundled ADB path resolved: {}", path.display());
          set_bundled_adb_path(Some(path.to_string_lossy().to_string()));
        } else {
          log::error!("Bundled ADB not found. Looked for {}", adb_relative_path.display());
        }
      }

      // TODO: 添加开发者工具菜单（暂时注释以修复CI编译）
      // let enable_devtools = cfg!(debug_assertions) ||
      //   std::env::var("DEVTOOLS").map(|v| v == "true").unwrap_or(false);
      //
      // if enable_devtools {
      //   let devtools_item = MenuItem::with_id(app, "devtools", "打开开发者工具", true, Some("F12"))?;
      //   let reload_item = MenuItem::with_id(app, "reload", "重新加载", true, Some("CmdOrCtrl+R"))?;
      //
      //   let dev_menu = Submenu::with_items(app, "开发", true, &[&devtools_item, &reload_item])?;
      //   let menu = Menu::with_items(app, &[&dev_menu])?;
      //
      //   app.set_menu(menu)?;
      //
      //   app.on_menu_event(|app, event| {
      //     match event.id().as_ref() {
      //       "devtools" => {
      //         if let Some(window) = app.get_webview_window("main") {
      //           let _ = window.open_devtools();
      //         }
      //       }
      //       "reload" => {
      //         if let Some(window) = app.get_webview_window("main") {
      //           let _ = window.eval("window.location.reload()");
      //         }
      //       }
      //       _ => {}
      //     }
      //   });
      // }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
