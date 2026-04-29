# Design Summary

A condensed summary of [notebooklm-coworker-agent-design.md](../notebooklm-coworker-agent-design.md). Read the full design for rationale and detail.

## Goal

Build a lightweight, NotebookLM-like AI coworker for non-developer users. Pragmatic over ambitious: small GUI, real notebook capabilities, agent orchestration on top, and a clean seam so the knowledge backend can be swapped later.

## Guiding Principles

- **GUI stays simple** — three-panel NotebookLM-style workspace.
- **One backend at a time** — start with `notebooklm-py`, do not couple product code to it.
- **Typed boundaries** — GUI calls internal API, agent calls typed tools, only one package speaks CLI.
- **Async by default** — long-running artifact generation lives in tasks, not HTTP requests.

## Stack

| Layer | Choice |
|---|---|
| GUI | Next.js, React, TypeScript, shadcn/ui, assistant-ui, Tailwind, lucide-react, react-resizable-panels |
| API | Next.js Route Handlers, execa |
| Storage | SQLite + Drizzle ORM |
| Agent | `pi-agent` + Tool Registry |
| Knowledge | `notebooklm-py` (Python CLI) behind `KnowledgeEngine` |
| Models | OpenAI-compatible HTTP client |

## Architecture

```
User
  └─ Next.js GUI
      └─ TypeScript API (Route Handlers)
          └─ pi-agent runtime
              └─ Tool Registry
                  ├─ NotebookLMTool ──► KnowledgeEngine ──► NotebookLmPyCliAdapter ──► notebooklm CLI ──► Google NotebookLM
                  ├─ ModelTool      ──► External model API
                  └─ InternalTool   ──► Internal business systems (later)
```

Hard rules:

- GUI **must not** call `notebooklm-py` directly.
- `pi-agent` **must not** build raw CLI commands.
- NotebookLM-specific behaviour stays inside `packages/notebooklm`.
- Every external call has timeout, logging, and normalised errors.

## Repository Layout

```
wrackspurt/
  apps/web/              Next.js GUI + API
  packages/
    core/                Shared types + KnowledgeEngine + AgentRuntime interfaces
    notebooklm/          NotebookLmPyCliRunner + NotebookLmPyCliAdapter
    agent/               pi-agent runtime, tool registry, intent classifier
    models/              External model client(s)
    db/                  Drizzle schema + repositories
```

## Core Abstractions

- **`KnowledgeEngine`** — provider-agnostic notebook operations: list/create notebooks, add/list sources, ask, summarize, generate/get/download artifacts.
- **`NotebookLmPyCliRunner`** — thin `execa` wrapper, returns stdout or parsed JSON.
- **`NotebookLmPyCliAdapter`** — implements `KnowledgeEngine` using the CLI; the only place that knows CLI flags and JSON shapes.
- **`Tool` + `ToolRegistry`** — typed tools that `pi-agent` invokes.
- **`AgentRuntime`** — accepts `{ userId, notebookId, message }`, returns `{ reply, citations?, taskIds? }`.

## MVP Scope (Phase 1)

- Notebook: create, list, local↔external mapping
- Sources: file / URL / text, list, sync status
- Chat: ask, display answer + citations, persist history
- Quick actions: summary, briefing, action items, FAQ, risks, study guide
- Tasks: source sync, artifact generation, error reporting

## CLI Mapping

| Capability | `notebooklm` command |
|---|---|
| Auth check | `auth check --json` |
| Create / list notebook | `create "title" --json` / `list --json` |
| Add / list source | `source add ... -n <id> --json` / `source list -n <id> --json` |
| Ask | `ask "..." -n <id> --json` |
| Summary | `summary -n <id>` |
| Generate report / quiz / mind map | `generate report|quiz|mind-map -n <id> --json` |
| Download | `download report ./out.md -n <id> --json` |
| Diagnose | `doctor --json` |

Prefer `--json` commands. Wrap text-only output in adapter parsers. Long-running operations become tasks.

## Authentication Modes

- **Local single-user** — user runs `notebooklm login` locally; ideal for MVP / Tauri.
- **Team web** — backend manages per-workspace profiles via `NOTEBOOKLM_AUTH_JSON` or `storage_state.json`; backend owns auth, audit, tasks.

Always provide an `auth check` diagnostic and a re-login flow. Confirm data policy before sending internal documents to NotebookLM.

## Risks

| Risk | Mitigation |
|---|---|
| `notebooklm-py` is unofficial / Google may break it | Hide behind `KnowledgeEngine`, pin versions, smoke test on upgrade, keep escape path to RAGFlow / Dify / LlamaIndex / Azure AI Search |
| CLI output not always structured | Prefer `--json`, centralise parsing in adapter, consider Python sidecar later |
| Long-running tasks | Async tasks in DB, GUI polls, add BullMQ/Redis worker post-MVP |
| Auth expiry | `auth check`, normalised auth errors, admin re-auth UI |

## Evolution Plan

1. **Local MVP** — Next.js + SQLite + CLI adapter + basic agent.
2. **Better agent workflow** — full tool registry, intent classifier, task history, retry.
3. **Desktop packaging** — Tauri, drag-and-drop, local auth.
4. **Team deployment** — Postgres, background worker, RBAC, audit, SSO, internal connectors.
5. **Replaceable backend** — swap NotebookLM for RAGFlow / Dify / LlamaIndex / Azure AI Search when compliance or scale requires it.

## Decision

Build the lightweight GUI and API in TypeScript. Use `pi-agent` for orchestration. Use `notebooklm-py` as the first knowledge provider, hidden behind `KnowledgeEngine`. Start with CLI integration; move to a Python sidecar only if richer access or long-running operations require it.
