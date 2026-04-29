// Sidecar launcher for production builds.
//
// In release mode the Tauri bundle ships an `apps/desktop/sidecar/` directory
// (declared via `bundle.resources` in tauri.conf.json). At startup we spawn
//
//     node <resource_dir>/sidecar/launcher.mjs
//
// and wait for the launcher to print `READY http://127.0.0.1:<port>` on
// stdout. We then navigate the main window to that URL.
//
// Resilience:
//   * If the launcher dies after READY (e.g. a crashed Next route boots
//     the process down), we restart it up to `MAX_RESTARTS` times within
//     `RESTART_WINDOW`, then give up.
//   * Restart attempts re-use the same window; the sidecar picks a new
//     free port each time so previous in-flight requests fail cleanly.
//
// Caveats / TODOs:
//   * The user must have Node.js (>=20) on PATH. Bundling Node itself is
//     deferred — see docs/progress.md for the rationale (libsql native
//     bindings + Node SEA are non-trivial).

use std::path::PathBuf;
use std::time::{Duration, Instant};

use tauri::{App, AppHandle, Manager};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

const MAX_RESTARTS: usize = 5;
const RESTART_WINDOW: Duration = Duration::from_secs(60);
const READY_TIMEOUT: Duration = Duration::from_secs(20);

pub fn start(app: &App) -> tauri::Result<()> {
    // In dev mode tauri.conf.json points at http://localhost:3000 via
    // `devUrl`, so we skip the sidecar entirely.
    #[cfg(debug_assertions)]
    {
        let _ = app;
        return Ok(());
    }

    #[cfg(not(debug_assertions))]
    {
        let resource_dir = app.path().resource_dir()?;
        let launcher = resource_dir.join("sidecar").join("launcher.mjs");

        if !launcher.exists() {
            eprintln!(
                "[wrackspurt] sidecar launcher missing at {} — falling back to bundled frontend",
                launcher.display()
            );
            return Ok(());
        }

        let app_handle = app.handle().clone();
        tauri::async_runtime::spawn(async move {
            run_with_restart(app_handle, launcher).await;
        });

        Ok(())
    }
}

#[allow(dead_code)] // only used in release builds
async fn run_with_restart(app_handle: AppHandle, launcher: PathBuf) {
    let mut restart_count = 0usize;
    let mut window_started_at = Instant::now();
    let mut redirected = false;

    loop {
        let attempt_started = Instant::now();
        let outcome = run_once(&app_handle, &launcher, &mut redirected).await;

        match outcome {
            SidecarOutcome::Stopped => {
                eprintln!("[wrackspurt] sidecar stopped cleanly");
                break;
            }
            SidecarOutcome::SpawnFailed(err) => {
                eprintln!("[wrackspurt] failed to spawn sidecar: {err}");
                break;
            }
            SidecarOutcome::Crashed => {
                if attempt_started.duration_since(window_started_at) > RESTART_WINDOW {
                    // Outside the window — reset the counter.
                    restart_count = 0;
                    window_started_at = attempt_started;
                }
                restart_count += 1;
                if restart_count > MAX_RESTARTS {
                    eprintln!(
                        "[wrackspurt] sidecar crashed too often ({MAX_RESTARTS} times in {:?}) — giving up",
                        RESTART_WINDOW
                    );
                    break;
                }
                eprintln!(
                    "[wrackspurt] sidecar crashed; restarting ({restart_count}/{MAX_RESTARTS})"
                );
                tokio::time::sleep(Duration::from_millis(500)).await;
            }
        }
    }
}

#[allow(dead_code)]
enum SidecarOutcome {
    Stopped,
    SpawnFailed(String),
    Crashed,
}

#[allow(dead_code)]
async fn run_once(
    app_handle: &AppHandle,
    launcher: &PathBuf,
    redirected: &mut bool,
) -> SidecarOutcome {
    let shell = app_handle.shell();
    let resource_dir = app_handle
        .path()
        .resource_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    let spawn_result = shell
        .command("node")
        .args([launcher.to_string_lossy().as_ref()])
        .env("WRACKSPURT_RESOURCE_DIR", resource_dir)
        .spawn();
    let (mut rx, _child) = match spawn_result {
        Ok(pair) => pair,
        Err(e) => return SidecarOutcome::SpawnFailed(e.to_string()),
    };

    let deadline = Instant::now() + READY_TIMEOUT;
    let mut got_ready = false;
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(bytes) => {
                let line = String::from_utf8_lossy(&bytes).to_string();
                print!("[sidecar] {line}");
                if !*redirected {
                    if let Some(url) = parse_ready(&line) {
                        got_ready = true;
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let escaped = url.replace('\\', "\\\\").replace('"', "\\\"");
                            let _ = window.eval(&format!(
                                "window.location.replace(\"{escaped}\")"
                            ));
                            *redirected = true;
                        }
                    }
                    if Instant::now() > deadline && !got_ready {
                        eprintln!("[wrackspurt] sidecar did not emit READY within timeout");
                        got_ready = true;
                    }
                }
            }
            CommandEvent::Stderr(bytes) => {
                eprint!("[sidecar:stderr] {}", String::from_utf8_lossy(&bytes));
            }
            CommandEvent::Error(err) => {
                eprintln!("[wrackspurt] sidecar error: {err}");
            }
            CommandEvent::Terminated(payload) => {
                eprintln!(
                    "[wrackspurt] sidecar exited (code={:?}, signal={:?})",
                    payload.code, payload.signal
                );
                let clean = payload.code == Some(0) && payload.signal.is_none();
                return if clean {
                    SidecarOutcome::Stopped
                } else {
                    SidecarOutcome::Crashed
                };
            }
            _ => {}
        }
    }
    SidecarOutcome::Crashed
}

#[allow(dead_code)]
fn parse_ready(line: &str) -> Option<String> {
    let trimmed = line.trim();
    let rest = trimmed.strip_prefix("READY ")?;
    Some(rest.to_string())
}
