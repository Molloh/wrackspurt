# Wrackspurt 实施进度

> 更新时间：2026-04-29
> 对应设计文档：[`c:\git\ai\notebooklm-coworker-agent-design.md`](../../notebooklm-coworker-agent-design.md)
> 设计摘要：[`docs/design-summary.md`](./design-summary.md)

## 一、已完成

### 1. 仓库与工程基线
- pnpm 9 monorepo（`apps/*` + `packages/*`），TypeScript 5.9 strict（含 `exactOptionalPropertyTypes`）
- Workspaces: `apps/web`、`apps/desktop`、`packages/{core,agent,db,notebooklm,models}`
- 工具链：Prettier、ESLint（next/core-web-vitals）、Vitest 2、Drizzle Kit 0.28
- 根脚本：`pnpm dev | build | typecheck | test | lint | format | desktop | desktop:build`

### 2. 核心包（packages/）
- **`@wrackspurt/core`** — 领域类型 + `KnowledgeEngine` 接口（含 `listNotebooks / createNotebook / deleteNotebook / getNotebookMetadata / addSource / ask / summarize / generateArtifact / getArtifactStatus / downloadArtifact / doctor`）+ `AgentRuntime` 接口
- **`@wrackspurt/agent`** — `PiAgentRuntime`（占位实现）+ `ToolRegistry` + `notebookLmTool` + 规则式 `intent-classifier`（已支持 `generate_slides`）
- **`@wrackspurt/notebooklm`** — `NotebookLmPyCliAdapter` 通过 execa 调用外部 Python CLI；包含 `mapArtifactCommand`（`slides / quiz / faq / mind-map / briefing / report / data-table / ...`）；附 13 个 vitest 用例覆盖输出解析
- **`@wrackspurt/db`** — Drizzle ORM + `@libsql/client` 封装；`schema.ts` 5 张表（projects、notebooks、sources、chat_messages、tasks）；`migrate()` 自动迁移；初始 SQL 已生成 `0000_medical_rumiko_fujikawa.sql`
- **`@wrackspurt/models`** — Zod schema（API/IPC 用）

### 3. Web 应用（apps/web）— Next.js 15 App Router
- 路由：`/`（GUI）、`/api/notebooks`、`/api/notebooks/[id]` (DELETE)、`/api/sources`、`/api/chat`、`/api/tasks/[id]`、`/api/artifacts`、`/api/doctor`
- 组件：`AppShell` 三栏布局；`NotebookSidebar`（增/删 + toast 错误提示）；`SourceList`；`ChatPanel`（含快捷按钮 Summary / Briefing / Action items / FAQ / Quiz / Mind map / **Slides**）；`CitationPanel`；`TaskStatusPanel`；`ToastViewport`
- 状态：zustand `workspace-store`（当前 notebook、citations、活动 task IDs）+ `toast-store`
- 服务层：`lib/services.ts` 懒加载单例（KnowledgeEngine / AgentRuntime / DB / repositories），首次访问自动迁移 DB
- 持久化：聊天消息、tasks 写入 SQLite
- webpack 兼容：`extensionAlias` for NodeNext `.js`、`IgnorePlugin` for libsql `*.md`、`serverExternalPackages` 含 libsql 全家 + execa
- `next.config.mjs` 已开 `output: "standalone"`（供桌面打包）

### 4. 桌面壳（apps/desktop）— Tauri v2
- `package.json`、`src-tauri/{tauri.conf.json, Cargo.toml, build.rs, src/main.rs, src/lib.rs, .gitignore}`
- Dev 模式：`pnpm desktop` 启动 Tauri 内嵌 Webview，自动跑 `pnpm --filter @wrackspurt/web dev`，加载 `http://localhost:3000`
- Bundle targets 配置：Windows `.msi/.exe(NSIS)`、macOS `.app/.dmg`、Linux `.deb/.AppImage`
- 完整安装/打包/排错指南：[`apps/desktop/README.md`](../apps/desktop/README.md)

### 5. 验证（最近一次全绿）
| 步骤 | 结果 |
|---|---|
| `pnpm install` | 8 workspaces, OK |
| `pnpm typecheck` | 7/7 |
| `pnpm test` | 13/13（packages/notebooklm） |
| `pnpm --filter @wrackspurt/web build` | 13 路由（含 settings + DELETE），standalone 输出 |

### 6. Settings / 连接配置（2026-04-29 新增）
- DB：`settings` 表（key/value + secret 标记），迁移 `0001_settings.sql`，`SettingsRepository`
- Models 包：`GeminiModelClient`（REST，支持 `complete()` + `ping()`）
- Web 服务层：`getKnowledgeEngine` / `getAgentRuntime` / `getGeminiClient` 改为异步、读取 settings；写入后 `invalidateConfigCaches()` 强制重建
- API：`GET/PUT /api/settings`（密文自动 redact）、`POST /api/settings/test/notebooklm`、`POST /api/settings/test/gemini`
- UI：`/settings` 页（NotebookLM CLI binary/HOME/PROFILE/AUTH_JSON/timeout、Gemini apiKey/model/endpoint），含"Test connection"、`doctor` JSON 内联展示、密钥自动遮蔽。`NotebookSidebar` 加 ⚙ Settings 入口
- `KnowledgeEngine` 接口正式纳入 `doctor()` 方法

## 二、未完成 / 待办

### A. 桌面打包（最关键）
- **Rust 工具链**：用户机器尚未安装。需按 [`apps/desktop/README.md`](../apps/desktop/README.md) 装 rustup + VS 2022 Build Tools "Desktop development with C++" + WebView2 Runtime。
- **桌面图标**：缺 `apps/desktop/src-tauri/icons/`。需提供 1024×1024 PNG 后跑 `pnpm tauri icon`。
- **生产模式 Next.js sidecar**：当前 `pnpm desktop:build` 只打包了 Tauri 壳。生产需把 `.next/standalone/server.js` + Node 运行时打成单文件 sidecar（推荐 [`@yao-pkg/pkg`](https://github.com/yao-pkg/pkg) 或 Node SEA），在 `tauri.conf.json` 的 `bundle.externalBin` 声明，并在 `src-tauri/src/lib.rs` 用 `tauri-plugin-shell` 启动子进程、等端口可用后再开窗。
- **libsql 原生绑定**：sidecar 打包时必须把 `node_modules/@libsql/*` 的平台原生 `.node` 一并带上。
- **首次签名/公证**：Windows `.msi` 需 codesign；macOS 需 Apple Developer ID + notarization。

### B. NotebookLM 能力对齐
- `notebooklm-py` CLI 必须由用户预先 `pip install` 并 `notebooklm login`。当前应用未在启动时检查；建议首屏调用 `/api/doctor` 给出红黄绿状态条。
- Source 上传：API + UI 已通，但只验证过文本/URL 路径，本地文件上传链路需手动联调。
- Slides 下载：`generateArtifact("slides")` 已可启动任务并轮询；缺一个 `/api/artifacts/[taskId]/download` 路由 + `TaskStatusPanel` 上的下载按钮（调用 `engine.downloadArtifact()` 写到本地）。
- Audio/Video overview、Study guide、Flashcards、Data-table 等 ArtifactKind 后端类型已存在，但 UI 暂未暴露。

### C. Agent 运行时
- 当前 `PiAgentRuntime` 是规则式分类 + 直调 tool。设计文档计划接入真正的 `pi-agent`（多步推理、计划/执行/反思）。
- `ToolRegistry` 仅注册了 `notebookLmTool`，缺：本地搜索 / 文件读写 / 浏览器抓取等通用工具。
- 没有流式响应（chat 路由是 single JSON return），无 SSE/Streaming；UI 也没"打字机"效果。

### D. 持久化与多用户
- 仅单机 SQLite，无认证、无多用户隔离。
- Project 表已建但无 UI（设计文档里 Project → Notebooks 的层级未在 GUI 体现）。
- 没有数据导出/备份/迁移到 Turso 远程的脚本。

### E. 测试覆盖
- 只有 `packages/notebooklm` 的解析单测（13 条）。
- 缺：API 路由测试、agent runtime 测试、组件测试（React Testing Library / Playwright）、端到端测试。

### F. 可观测性 / 运维
- 无结构化日志（目前是 `console.error`）。
- 无 OpenTelemetry / Sentry 接入。
- 无健康检查面板（`/api/doctor` 只返 JSON，无 UI）。

### G. 安全
- API 路由无鉴权，桌面应用本地访问尚可；如未来要做 web 部署需加 auth。
- 上传文件未做大小/类型限制。
- `confirm()` 用作删除确认是浏览器原生，桌面体验一般，可换为自定义对话框。

### H. 文档
- 缺顶层 `README.md` 写"如何启动 / 如何接入 NotebookLM CLI"的最小入门。
- 缺 ADR（架构决策记录）。

## 三、推荐下一步顺序
1. **装 Rust + 跑通 `pnpm desktop` dev 模式** — 验证 Tauri 壳能渲染 Web 应用。
2. **写顶层 README + `/api/doctor` 状态条** — 降低新人接入摩擦。
3. **Slides 下载链路** — 完成"PPT 全闭环"用户故事。
4. **Sidecar 打包 Next.js** — 真正可分发的 `.msi/.dmg`。
5. **接入真实 `pi-agent` + 流式响应** — 提升 agent 智能与体验。


## 四、设计文档差距对照（2026-04-29 审计）

| # | 设计要求 | 现状 | 处理 |
|---|---|---|---|
| 1 | Settings/连接配置 UI（§13 NOTEBOOKLM_HOME/PROFILE/AUTH_JSON） | **已补齐** `/settings` + `/api/settings` + Gemini 配置 | ✓ |
| 2 | `auth check` 在 admin/debug UI；过期重登引导 | 后端有 `/api/doctor` + Settings "Test connection"；缺过期自动提示 | 部分 |
| 3 | Profile 多账号隔离 | Settings 已支持 `notebooklm.profile` 字段；缺 UI 切换 dropdown | 部分 |
| 4 | `packages/models` 含 OpenAI-compatible / Gemini provider | **已补齐** `GeminiModelClient` | ✓ |
| 5 | Project 层级（左栏 Projects → Notebooks） | DB 表在；UI 不存在 | TODO |
| 6 | shadcn/ui + assistant-ui | 未引入，组件用 Tailwind 原语 | TODO |
| 7 | 流式聊天 | `/api/chat` single-shot JSON | TODO |
| 8 | 首次启动 onboarding 向导 | 无 | TODO |
| 9 | Quick actions 缺：Risk list、Study guide、Flashcards、Audio/Video overview | 已有 7 类（含 slides）；缺 4 类 | TODO |
| 10 | 文件拖拽上传 source | 仅 URL/text 路径联调 | TODO |
| 11 | conversationId 复用（多轮上下文） | adapter 支持，UI 没回传 | TODO |
| 12 | Phase 3 sidecar：Next.js standalone 包成 Tauri externalBin | 未做 | 高优 |
| 13 | 任务重试 / 错误恢复 | 无重试按钮 | 低 |
| 14 | 长任务后台 worker | 同进程轮询 | 低（MVP 可接受） |
| 15 | 操作审计日志、结构化日志 | 仅 `console.error` | TODO |
| 16 | 密钥安全存储（OS keyring） | SQLite 明文 + secret 标记 + redact 输出；Tauri 桌面应迁移到 keyring | 高优（桌面发布前必做） |

### 推荐下一步排序（更新）
1. 装 Rust + 跑通 `pnpm desktop` dev 模式，验证 Tauri 壳能渲染。
2. **首屏 doctor 状态条** + 把 settings page 链接放到顶栏（替代 sidebar 角落）。
3. **Slides 下载链路** 完成 PPT 全闭环。
4. **OS keyring** 集成（Tauri 后即可做：`tauri-plugin-stronghold` 或 `keyring-rs`）。
5. **Sidecar 打包 Next.js standalone**，真正可分发的 `.msi/.dmg`。
6. 接入真实 `pi-agent` + 流式响应。
