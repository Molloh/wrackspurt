# @wrackspurt/desktop

Tauri v2 desktop shell that hosts the Wrackspurt web app as a native
Windows / macOS / Linux application.

## One-time setup

### 1. Install Rust (required by Tauri)

**Windows**

1. Install Visual Studio Build Tools 2022 with the **"Desktop development with C++"** workload (provides MSVC + Windows SDK).
   - Download: <https://visualstudio.microsoft.com/visual-cpp-build-tools/>
2. Install Rust via rustup:

   ```powershell
   winget install --id Rustlang.Rustup -e
   # then restart the terminal so cargo is on PATH
   rustup default stable
   ```

3. Install Microsoft WebView2 Runtime (preinstalled on Windows 11; Win10 may need it):
   - <https://developer.microsoft.com/microsoft-edge/webview2/>

**macOS**

```bash
xcode-select --install
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup default stable
```

**Linux** (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup default stable
```

Verify:

```bash
cargo --version
rustc --version
```

### 2. Generate icons (one-time)

Tauri requires platform icons under `apps/desktop/src-tauri/icons/`.
Provide a 1024x1024 PNG and run:

```powershell
cd apps/desktop
pnpm tauri icon path/to/source-1024.png
```

This produces `icon.ico`, `icon.icns`, and PNG variants automatically.

## Development (live-reload)

Runs the Next.js dev server and opens it inside a native Tauri window:

```powershell
cd apps/desktop
pnpm dev
```

The first run will compile Rust crates (a few minutes); subsequent runs are fast.

## Production build

Produces native installers under `apps/desktop/src-tauri/target/release/bundle/`:

```powershell
cd apps/desktop
pnpm build
```

Outputs:
- Windows: `.msi` and `.exe` (NSIS) installers
- macOS: `.app` bundle and `.dmg`
- Linux: `.deb`, `.AppImage`

## How it works

- **Dev mode**: `tauri.conf.json` -> `beforeDevCommand` runs `pnpm --filter @wrackspurt/web dev` and the webview points at `http://localhost:3000`.
- **Production mode** (current MVP): the Next.js app is built with `output: "standalone"` (see `apps/web/next.config.mjs`). The standalone server runs inside the Tauri process via `tauri-plugin-shell` (TODO: wire `sidecar` in `src-tauri/src/lib.rs` to spawn `node server.js` and waituntil port 3000 is reachable before opening the window). For now `pnpm build` packages the shell only — see "Bundling the Next.js server" below.

## Bundling the Next.js server (next steps)

The web app needs a Node runtime to serve API routes (chat, notebook
lifecycle, NotebookLM CLI invocation). Two options:

1. **Node sidecar** (recommended): bundle a portable Node runtime and the
   `.next/standalone/` output as a Tauri [external binary sidecar][sidecar].
   Use [@yao-pkg/pkg](https://github.com/yao-pkg/pkg) or Node SEA to produce
   a single executable per platform, declare it in `tauri.conf.json` under
   `bundle.externalBin`, and spawn it from `lib.rs`.
2. **Embedded Deno/Bun**: replace the Node sidecar with a single static
   binary; requires verifying `@libsql/client` native bindings work.

Both options will be implemented after the dev workflow is validated end to end.

[sidecar]: https://v2.tauri.app/develop/sidecar/

## Troubleshooting

- **`cargo` not found**: open a new terminal so the rustup-modified PATH is loaded.
- **Webview2 missing on Windows**: install the runtime linked above.
- **Port 3000 in use**: stop other Next.js dev servers, or change the port in `apps/web` and update `devUrl` in `tauri.conf.json`.
