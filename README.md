# Wrackspurt

Lightweight NotebookLM coworker agent. A pragmatic, replaceable knowledge workspace built on top of `notebooklm-py` and `pi-agent`.

> Named after the invisible creatures in Harry Potter that make your brain go fuzzy — this app exists to clear them out and help non-developers reason about their sources.

## Design

- [docs/design-summary.md](docs/design-summary.md) — condensed summary (start here)
- [docs/progress.md](docs/progress.md) — implementation progress + design-gap audit
- [../notebooklm-coworker-agent-design.md](../notebooklm-coworker-agent-design.md) — full design

## Stack

| Layer | Tech |
|---|---|
| GUI | Next.js 15 (App Router), React 19, TypeScript, Tailwind, zustand |
| API | Next.js Route Handlers, execa |
| Storage | SQLite via `@libsql/client` + Drizzle ORM |
| Agent | `pi-agent` placeholder + Tool Registry |
| Knowledge | `notebooklm-py` (Python CLI) behind `KnowledgeEngine` |
| Models | `GeminiModelClient` (REST); OpenAI-compatible stub |
| Desktop | Tauri v2 (Windows / macOS / Linux) |

## Layout

```
wrackspurt/
  apps/
    web/           Next.js GUI + API + /settings page
    desktop/       Tauri v2 shell (apps/desktop/README.md)
  packages/
    core/          Shared types + KnowledgeEngine interface (incl. doctor())
    notebooklm/    NotebookLmPyCliRunner + NotebookLmPyCliAdapter
    agent/         pi-agent runtime + tools + intent classifier
    models/        ModelClient + GeminiModelClient
    db/            Drizzle schema + repositories (incl. SettingsRepository)
  docs/
    design-summary.md
    progress.md
```

## Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9
- Python with `notebooklm-py` installed (`pip install notebooklm-py`) and `notebooklm login` completed
- For desktop: Rust toolchain — see [`apps/desktop/README.md`](apps/desktop/README.md)

## Quick start (web)

```powershell
pnpm install
pnpm dev          # http://localhost:3000
```

Then open <http://localhost:3000/settings> to point Wrackspurt at your local
`notebooklm` CLI and (optionally) paste a Gemini API key. Each section has a
"Test connection" button that runs `notebooklm doctor --json` or pings the
configured Gemini model.

## Quick start (desktop)

```powershell
pnpm desktop          # dev — opens Tauri window pointed at the Next.js dev server
pnpm desktop:build    # release bundles in apps/desktop/src-tauri/target/release/bundle/
```

See [`apps/desktop/README.md`](apps/desktop/README.md) for the Rust + WebView2
prerequisites and for production sidecar packaging notes.

## Configuration

The Settings UI writes everything into the local SQLite `settings` table.
Environment variables in `.env.local` (or the OS environment) act as
**fallbacks** when the corresponding setting is not yet configured in the UI.

| Setting key | Env fallback | Purpose |
|---|---|---|
| `notebooklm.bin` | `NOTEBOOKLM_BIN` | Path to the `notebooklm` CLI |
| `notebooklm.home` | `NOTEBOOKLM_HOME` | Profile / cookie home dir |
| `notebooklm.profile` | `NOTEBOOKLM_PROFILE` | Active profile name |
| `notebooklm.authJson` (secret) | `NOTEBOOKLM_AUTH_JSON` | Path to `storage_state.json` |
| `notebooklm.timeoutMs` | – | Per-CLI-call timeout (ms) |
| `gemini.apiKey` (secret) | `GEMINI_API_KEY` | Google AI Studio API key |
| `gemini.model` | `GEMINI_MODEL` | e.g. `gemini-2.0-flash` |
| `gemini.endpoint` | `GEMINI_ENDPOINT` | Override REST endpoint |

Secrets are stored locally with a `secret` flag and are redacted on read
(`••••`). The desktop build will replace plaintext storage with the OS
keyring (see `docs/progress.md` item 16).

## Scripts

```powershell
pnpm typecheck          # tsc --noEmit across all workspaces
pnpm test               # vitest
pnpm lint               # next lint
pnpm --filter @wrackspurt/web build   # production Next.js build (standalone)
```

## Status

Phase 1 (Local MVP) functional: notebook CRUD, chat with citations, quick
actions (Summary / Briefing / Action items / FAQ / Quiz / Mind map / Slides),
task tracking, Settings UI for NotebookLM CLI + Gemini.
See [`docs/progress.md`](docs/progress.md) for the full design-gap audit and
recommended next steps (Tauri sidecar packaging, OS keyring, streaming chat,
real `pi-agent` integration).

