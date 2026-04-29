# Wrackspurt 实施进度

> 更新时间：2026-04-29（第八轮 · 重构）

## 一、已完成

### 8. 第八轮 — Workspace 重构 + Skill 框架（用户大改：抛弃 NotebookLM）

用户决定彻底转向：移除全部 NotebookLM 集成，把 projects/notebooks 模型换成"VSCode 风格的 workspace 文件夹 + 可挂载 skill 库"。第一个 skill 接 [PPT Master](https://hugohe3.github.io/ppt-master/)，PPT 生成前必须做多轮结构化对话。

**删除（一次性 hard reset）**
- `packages/notebooklm/`、所有 `apps/web/app/api/{notebooks,projects,sources,tasks,artifacts,setup,doctor}` 目录、`/api/settings/test/{gemini,notebooklm}` 旧子路由
- `apps/web/lib/{notebooklm-login,notebooklm-runtime,api-client}.ts`
- `apps/web/components/{notebook-sidebar,source-list,citation-panel,task-status-panel,setup-dialog,onboarding-banner,project-picker,app-shell,top-bar,chat-panel}.tsx`（旧版）
- `packages/agent/src/{notebooklm-tool,intent-classifier,llm-planner-runtime}.ts`
- `packages/core/src/{knowledge-engine,agent-runtime,types}.ts`（旧）
- `packages/db/drizzle/`（旧 0000/0001 迁移整盘弃用）
- 旧 vendored python-pkgs 安装/sidecar/Tauri 注入逻辑

**新建**

`packages/core` — 全新 domain 类型：`Workspace`、`SkillManifest`、`SkillRun`、`ChatMessage`、`ProviderConfig`、`AgentRuntime/Run{Input,Result}`。无 KnowledgeEngine。

`packages/db` — 4 张表、单一 0000 迁移：`workspaces`（path 主键）、`chat_messages`、`skill_runs`、`settings`。Repositories 同名重写。

`packages/models` — 3 个 provider 全部 API key 模式：
- `GeminiModelClient`（已有）
- `OpenAiCompatibleClient`（已有，新增 `ping()`）
- `CopilotModelClient`（**新**）— 走 `api.githubcopilot.com /chat/completions`，Bearer + `editor-version` + `copilot-integration-id` 头；同时兼容任何 Copilot 代理（PackyCode 等）

`packages/agent` — [`PiAgentRuntime`](packages/agent/src/pi-agent-runtime.ts) 重写为 single-turn responder，把 `SKILL.md` + workspace path + 用户结构化约束（JSON）拼进 system prompt 后调 ModelClient；[`buildSkillSystemPrompt`](packages/agent/src/skill-prompt.ts) 是 PPT Master 那种"复制 SKILL.md 给 agent"模式的官方化。`ToolRegistry` 保留为 forward-compat seam。

`apps/web/lib`
- [`services.ts`](apps/web/lib/services.ts) — provider 路由 + 缓存的 model/agent runtime 单例；新 SETTINGS_KEYS（`provider.active` + 三家 apiKey/model/endpoint）；DB 默认落到 `~/.wrackspurt/wrackspurt.db`
- [`workspace-fs.ts`](apps/web/lib/workspace-fs.ts) — `scaffoldWorkspace()` 在选定目录里创建 `.wrackspurt/{skills,runs,workspace.json,.gitignore}`，拒绝 `/` 和 `$HOME` 当作 workspace
- [`skill-registry.ts`](apps/web/lib/skill-registry.ts) — 硬编码 manifest 数组；首项就是 ppt-master
- [`skills.ts`](apps/web/lib/skills.ts) — `installSkill()` 优先用 `git submodule add`（workspace 是 git 仓库时），否则 `git clone --depth 1`；已存在即 `git pull --ff-only`；5 分钟超时
- [`audit-log.ts`](apps/web/lib/audit-log.ts) — 事件枚举换为 workspace.* / skill.* / agent.*
- [`workspace-store.ts`](apps/web/lib/workspace-store.ts) — zustand 客户端 store，localStorage 持久化"当前打开的 workspace"

`apps/web/app/api`
- `/workspaces` — GET 列表 / POST `{path, action:"open"|"create"}` / DELETE
- `/settings` — GET（自动 redact secret）/ PUT（任意 key 写入并清缓存）
- `/settings/test` — POST `{provider}` 调对应 `ping()`
- `/chat` — GET 历史 / POST 一次对话；跳进 `buildAgentRuntime()` 用 active provider；可附带 `skillInvocation: {skillId, constraints}`
- `/skills` — GET 注册表（带 per-workspace install 状态）
- `/skills/[id]/install` — POST 触发 git clone/submodule

`apps/web/components`
- [`Launcher`](apps/web/components/launcher.tsx) — 首屏：provider 状态点 + recents 列表 + path 输入框（Open/Create）。provider 没配齐时强制弹 ProviderSetupDialog，Open/Create 禁用
- [`ProviderSetupDialog`](apps/web/components/provider-setup-dialog.tsx) — 单窗口 3 provider 并列：apiKey/model/endpoint 三字段 + Save & test + 单选 active
- [`WorkspaceShell`](apps/web/components/workspace-shell.tsx) — 进入 workspace 后的两栏布局，顶部"Switch"返回 Launcher
- [`SkillSidebar`](apps/web/components/skill-sidebar.tsx) — 注册表卡片，Install/Update/Use/Docs 四按钮
- [`PptClarifyDialog`](apps/web/components/ppt-clarify-dialog.tsx) — 4 步结构化问卷（标题+受众 → 模板+画幅 → 页数+重点章节 → source 模式与内容），收集到 constraints + 用户可读 prompt 后通过 `pendingInvocation` 喂给 ChatPanel
- [`ChatPanel`](apps/web/components/chat-panel.tsx) — 拉历史 + 发消息 + 自动消化 pendingInvocation；Cmd/Ctrl+Enter 发送

`apps/web/app/page.tsx` — 简单路由：有 workspace 渲染 Shell，否则 Launcher。`app/settings/page.tsx` 退化为 ProviderSetupDialog 的固定 URL 容器。

**新流程**
1. 启动 → Launcher（强制 provider 配置）
2. 配齐至少一家 provider + 选 active → 输入或选择 workspace folder（Create 自动 scaffold .wrackspurt/）
3. 进入 WorkspaceShell → SkillSidebar 看到 PPT Master，点 Install → 后端 `git clone hugohe3/ppt-master` 到 `<workspace>/.wrackspurt/skills/ppt-master/`
4. 点 Use → PptClarifyDialog 4 步问卷 → Generate → 自动作为一条 user 消息发送，agent 把 SKILL.md + 约束注入 system prompt，模型按 SKILL.md 工作流回应（包括 slide markdown + 后续 export 步骤指引）

**校验**
- `pnpm typecheck` 6/6 ✅
- `pnpm -r test` 12/12 ✅（agent 3 + db 4 + apps/web 5）
- `pnpm --filter @wrackspurt/web build` 8 routes（`/`、`/settings`、`/api/{chat,settings,settings/test,skills,skills/[id]/install,workspaces}`） ✅

**deferred / 已知未做**
- Tauri 端原生文件夹 picker（目前 web 用文本框粘路径）
- 真正 spawn 一个长跑 skill run（如直接帮用户跑 `python skills/ppt-master/scripts/source_to_md.py`）— 当前由用户在自己机器上根据模型给出的指引自行运行
- pi-agent 实物 scheduler（当前 PiAgentRuntime 是 single-turn placeholder，行为契约稳定）

---

## 二、历史轮次（已废弃，仅供回溯）

### 7. 第七轮 收官 — NotebookLM CLI 适配（已被第八轮整体丢弃）


- **Setup 一窗口集成 install + sign-in + Gemini key**（设计 §13）—
  - 新组件 [`SetupDialog`](apps/web/components/setup-dialog.tsx)：三 Tab（Install / Sign in / Gemini）共享同一探测状态；打开时自动跳到第一个未完成步骤，每步绿勾随实时探测点亮
  - Sign in 二选一表单：Chrome profile 路径 OR auth.json 内容，"Save & verify" 一键 PUT `/api/settings`（auth.json 走 secret=true）→ 立即 POST `/api/settings/test/notebooklm` 跑 `engine.doctor()` 验证；失败把 doctor stderr 回显
  - Gemini Tab 保存即跑 `/api/settings/test/gemini` 探可达性，成功显示 "Gemini reachable (model)"
  - [`GET /api/setup/notebooklm`](apps/web/app/api/setup/notebooklm/route.ts) 升级为统一状态探测：`installed / signedIn(真跑 doctor) / geminiConfigured / profile / hasAuthJson`，仅当 CLI 可达且配过凭据时才探 doctor，避免首次进就刷 stderr
- **每次启动强校验三项**（用户明确要求）— [OnboardingBanner](apps/web/components/onboarding-banner.tsx) 加载即并行拉 `/api/settings` + `/api/setup/notebooklm`，三项任缺一项**自动弹 SetupDialog**；用户 ✕ dismiss 改用 `sessionStorage`（仅当前 tab 静默），下次重启 / 重载页面重新强校验。三项全齐黄条与弹窗均不出现
- **核心功能 UT 扩展**（用户要求 + 第七轮 todo #2 收尾）—
  - [`packages/notebooklm/test/notebooklm-py-cli-runner.test.ts`](packages/notebooklm/test/notebooklm-py-cli-runner.test.ts) 7 用例：覆盖 binary/command 选项优先级与 `describe()` 拼接、`command:[]` 兜底、ENOENT → 友好"install with pip install notebooklm-py"消息、错误消息含 binary 路径
  - [`packages/notebooklm/test/notebooklm-py-cli-adapter.test.ts`](packages/notebooklm/test/notebooklm-py-cli-adapter.test.ts) 8 用例：mock runner 验证 `doctor` 错误吞掉返回 `ok:false`、`createNotebook` 透传标题位置参数、`listNotebooks` 映射、`ask` 拼接 `--conversation` + 多个 `--source`、空 references 兼容、`summarize` 走 text channel 并 trim
  - [`apps/web/test/audit-log.test.ts`](apps/web/test/audit-log.test.ts) 6 用例：成功走 stdout、失败走 stderr、`WRACKSPURT_AUDIT_FILE` 真落盘、`withAudit` 计 durationMs + 失败重抛
  - [`apps/web/test/notebooklm-runtime.test.ts`](apps/web/test/notebooklm-runtime.test.ts) 7 用例：`getVendoredPkgsDir`（WRACKSPURT_HOME 优先 / `~/.wrackspurt` 兜底）、`getBundledPkgsDir`（路径不存在返回 undefined）、`resolveBundledCli`（无 vendored 包时 undefined / 有则 `python -m notebooklm` + `PYTHONPATH`）
  - 配套：apps/web 加 vitest devDep + `vitest.config.ts`（`include: test/**/*.test.ts`，避开 .next）+ `test` 脚本
- **校验**：`pnpm typecheck` 8/8（含 apps/web 测试代码）、`pnpm test` **67/67**（13 → 33 → 67）、`pnpm --filter @wrackspurt/web build` 19 routes 全绿

### 0′. 本次迭代中段（2026-04-29 第七轮 · 续）
- **notebooklm-py 内置安装** —
  - **构建期预装**：[`apps/desktop/scripts/bundle-notebooklm-py.mjs`](apps/desktop/scripts/bundle-notebooklm-py.mjs) 现在真正执行 `python3 -m pip install --upgrade --target apps/desktop/sidecar/python-pkgs notebooklm-py`，输出目录被 `bundle.resources` 自动打入安装包；构建机若没 python 则跳过且不报错（`pip install` 失败也只警告，不阻塞 desktop 构建），由运行时安装兜底
  - **运行时一键安装**：新增 [`apps/web/lib/notebooklm-runtime.ts`](apps/web/lib/notebooklm-runtime.ts) 与 [`POST /api/setup/notebooklm`](apps/web/app/api/setup/notebooklm/route.ts)。点击 OnboardingBanner 上 "Install notebooklm-py" 按钮即跑 `python3 -m pip install --target ~/.wrackspurt/python-pkgs notebooklm-py`，5 分钟超时，结果原文回显；安装完立即 `invalidateConfigCaches()`，无需重启
  - **运行时解析**：[`resolveBundledCli()`](apps/web/lib/notebooklm-runtime.ts) 优先级：用户在 Settings 显式配置的 `notebooklm.bin` → 用户数据目录 vendored pkgs → bundle 资源目录 vendored pkgs → bare PATH。命中 vendored 时 services.ts 自动用 `python3 -m notebooklm` + `PYTHONPATH=<dir>` 调起，与原生 binary 互不影响
  - **CLI runner 增强**：[`NotebookLmPyCliRunner`](packages/notebooklm/src/notebooklm-py-cli-runner.ts) 新增 `command?: string[]` 选项，允许 `python -m notebooklm` 这种多段调用形式；保留单 binary 兼容路径
  - **Tauri 集成**：`tauri.conf.json` `beforeBuildCommand` 串接 `bundle-notebooklm-py.mjs`；`src-tauri/src/sidecar.rs` 在 spawn launcher 时注入 `WRACKSPURT_RESOURCE_DIR`，使运行时 vendored 解析能找到 bundle 资源目录
  - **OnboardingBanner**：并行拉 `/api/setup/notebooklm`，"Install the notebooklm-py CLI" 这一栏改为根据探测结果显示状态；未安装时附 Install 按钮，安装中禁用并显示 "Installing…"，python3 缺失时按钮禁用并 tooltip 提示装 python.org
  - **Gemini key 文案修正**：从"optional"改为"powers planner + notebooklm-py"，与第七轮（前段）单 key 共享一致
- **校验**：`pnpm typecheck` 7/7、`pnpm test` 33/33、`pnpm --filter @wrackspurt/web build` 19 routes（多了 `/api/setup/notebooklm`）

### 0′. 本次迭代前段（2026-04-29 第七轮）
- **`pnpm desktop` 修复** — Tauri 在 dev/build 时都校验 `bundle.resources` 路径必须匹配，新建 [`apps/desktop/sidecar/.gitkeep`](apps/desktop/sidecar/.gitkeep) 占位让全新克隆也能直接 `pnpm desktop`，无需先跑 `bundle:sidecar`
- **+ New notebook 错误可读化** — [`NotebookLmPyCliRunner`](packages/notebooklm/src/notebooklm-py-cli-runner.ts) 包了一层 `wrapSpawnError`：ENOENT 翻译为 "notebooklm CLI not found（pip install notebooklm-py 并到 Settings 配置路径）"，timeout 给出明确耗时，其它非零退出附带 stderr。`POST /api/notebooks` 据此把 ENOENT 类失败返回 503 + `hint`，前端 toast 看到的是行动建议而不是 `spawn ENOENT`
- **单 Gemini key 同时授权 notebooklm-py 与 planner**（设计 §13 Sign in）— 用户在 Settings 只填一次 `gemini.apiKey`，[`getKnowledgeEngine`](apps/web/lib/services.ts) 注入 `GEMINI_API_KEY` 与 `GOOGLE_API_KEY` 到 CLI 子进程环境变量；`GeminiModelClient` 继续读同一 key 服务 planner。Settings 页 Gemini 区块文案与 hint 同步更新
- **notebooklm-py 安装包内置（脚手架）** — 新增 [`apps/desktop/scripts/bundle-notebooklm-py.mjs`](apps/desktop/scripts/bundle-notebooklm-py.mjs) + `apps/desktop/sidecar/bin/README.md`，记录 PyInstaller / python-build-standalone 两种策略与 Tauri `bundle.externalBin` 的对接方式；真正的 per-target 二进制制作放到下一轮（依赖 macOS/Windows/Linux CI runner）
- **新增单元测试**（覆盖率从 13 提升到 33）—
  - [`packages/db/test/repositories.test.ts`](packages/db/test/repositories.test.ts)：8 用例覆盖 `ProjectRepository.ensureDefault/list/rename/delete`、`NotebookRepository.getOrCreateMapping/setProject/listForProject/delete`、`SettingsRepository.set/get/delete + secret 标志 + 上覆盖更新`，全部跑在 `:memory:` libsql + drizzle 真实迁移
  - [`packages/agent/test/llm-planner-runtime.test.ts`](packages/agent/test/llm-planner-runtime.test.ts)：12 用例覆盖 `ToolRegistry`（注册/重复注册抛错/查找不存在）、`parsePlannerStep`（tool/final/markdown 包裹/prose 包裹/降级）、`LlmPlannerRuntime`（一次性 final、tool→final 链式 + citations + conversationId 透传、缺 notebookId 拒绝执行），全部使用 mock `ModelClient` 与 stub `KnowledgeEngine`
  - 配套：`@wrackspurt/db` 与 `@wrackspurt/agent` 加入 `vitest` devDep + `test` 脚本；`parsePlannerStep` 从 `llm-planner-runtime.ts` 改为命名导出
- **校验**：`pnpm typecheck` 7/7、`pnpm test` 33/33、`pnpm --filter @wrackspurt/web build` 18 routes 全部通过

### 0′. 上一轮（2026-04-29 第六轮）
- **Project rename UI**（设计 §3）— `ProjectPicker` 增加 ✎ rename 按钮，复用既有 `PATCH /api/projects/[id]`，禁止改默认 Inbox；toast 反馈
- **审计日志覆盖剩余路由** — `audit()` 接入 `/api/projects` POST/PATCH/DELETE、`/api/sources` POST、`/api/sources/upload` POST、`/api/settings` PUT；事件枚举已涵盖 project.create/rename/delete、source.add/upload、settings.update
- **TopBar doctor 自动轮询** — `visibilitychange` 监听，可见时每 60 秒 `/api/doctor`；隐藏时立即停掉 interval；切回前台立即触发一次刷新
- **Sidecar HTTP 健康探针**（设计 §6 桌面分发）— `apps/desktop/scripts/build-sidecar.mjs` 生成的 launcher 现在先 `import("server.js")` 引导 Next，再 `fetch /api/doctor` 重试拉起，最多 30 s（环境变量 `WRACKSPURT_HEALTH_TIMEOUT_MS` 可调），就绪后才打 `READY <url>`；超时仍打 READY 但 stderr 报警，避免死锁
- **TopBar Profile 标签** — 拉一次 `/api/settings`，把当前 `notebooklm.profile` 显示在 Settings 链接旁的小 pill 上；点击仍跳到完整 Settings 页面（多账号 quick-switcher 仍待做，需要先建 profile 历史 store）
- **校验**：`pnpm typecheck` 7/7、`pnpm test` 13/13、`pnpm --filter @wrackspurt/web build` 18 routes 全部通过

### 0′. 上一轮（2026-04-29 第五轮）
- **首次启动 onboarding 横幅**（设计 §13）— 新组件 [`OnboardingBanner`](apps/web/components/onboarding-banner.tsx)，挂在 `AppShell` 顶栏与三栏之间。读 `/api/settings`，按"装 CLI / 登录（profile or auth json）/ Gemini key（可选）"三步打勾；关键两步全配齐自动隐藏，可手动 ✕ 关闭并写入 localStorage 永久消失
- **Quick actions 全集补齐**（设计 §9）— 在 [ChatPanel](apps/web/components/chat-panel.tsx) 加入 `Video overview`、`Data table` 两个按钮，与 `mapArtifactCommand` 已支持的 kind 完全对齐；点击同样直接 POST `/api/artifacts`
- **任务失败重试**（设计 §13）— `workspace-store` 加 `taskMeta` 与 `swapTask`，提交 artifact 时记录原 kind/instructions；[TaskStatusPanel](apps/web/components/task-status-panel.tsx) 在状态为 `failed` 时显示 Retry/Dismiss 按钮，Retry 复用元数据再次 POST 并把列表里的旧 taskId 替换为新的
- **结构化操作审计日志**（设计 §15）— 新模块 [`apps/web/lib/audit-log.ts`](apps/web/lib/audit-log.ts) 输出 ndjson `{ts,event,...}`，事件类型包含 `notebook.create/delete/move`、`artifact.start/retry`、`agent.run/error` 等；成功走 stdout、失败走 stderr；环境变量 `WRACKSPURT_AUDIT_FILE`（或 `WRACKSPURT_HOME`）可同时落盘。已挂到 `/api/notebooks`、`/api/notebooks/[id]`、`/api/artifacts`、`/api/chat/stream`
- **Sidecar 健康自愈**（设计 §6 桌面分发）— `src-tauri/src/sidecar.rs` 改为 `run_with_restart`：READY 超时不再 break，`Terminated` 非 0 退出/被信号终止判定为 crash，60 秒窗口内最多重启 5 次；window navigation 仅在首次 READY 后执行，重启时复用同一窗口。`Cargo.toml` 新增 `tokio = { features = ["time"] }` 以支持 `tokio::time::sleep` 退避
- **校验**：`pnpm typecheck` 7/7、`pnpm test` 13/13、`pnpm --filter @wrackspurt/web build` 18 routes 全部通过

### 0′. 上一轮（2026-04-29 第四轮）
- **Project 层贯通到 UI**（设计 §3 项目层）
  - `packages/db`：`NotebookRepository` 重写为「外部 notebookId ↔ projectId」映射表，新增 `getOrCreateMapping / setProject / deleteByExternalId`；`ProjectRepository` 加 `list()`（带 notebookCount 的 leftJoin+groupBy）、`rename / delete / ensureDefault`，导出 `DEFAULT_PROJECT_NAME = "Inbox"`
  - 新路由 `GET/POST /api/projects` + `PATCH/DELETE /api/projects/[id]`；`GET /api/notebooks?projectId=` 支持过滤、`POST /api/notebooks` 接受 `projectId` 并即时落库映射，未指定时落 Inbox；`PATCH /api/notebooks/[id]` 支持移动到指定 project
  - `workspace-store` 增 `projectId / selectProject`，切换 project 时清掉当前 notebook + citations + 活动任务
  - 新组件 [`ProjectPicker`](apps/web/components/project-picker.tsx)（下拉 + "+ New" + "✕ Delete"，禁止删 Inbox）；`NotebookSidebar` 接入 picker，切换 project 重新拉列表，新建/移动 notebook 都带上 projectId（每行 hover 出现 "Move to" select）
- **真实 pi-agent 多步规划器**（设计 §4 Agent 内核）— 新增 [`LlmPlannerRuntime`](packages/agent/src/llm-planner-runtime.ts)：每一步让 Gemini 输出严格 JSON `{tool,args}` 或 `{final}`，runtime 调 `ToolRegistry` 跑工具、把结果回填 prompt，最多 4 步；解析失败/无 model client 时回退到 `PiAgentRuntime`。`apps/web/lib/services.ts` 在 Gemini 配好时优先用 planner，否则继续用规则式 runtime
- **Sidecar 打包脚手架**（设计 §6 桌面分发）—
  - 新脚本 [`apps/desktop/scripts/build-sidecar.mjs`](apps/desktop/scripts/build-sidecar.mjs)：跑 web build → 拷贝 `.next/standalone` + `.next/static` + `public` 到 `apps/desktop/sidecar/server/`，落 `launcher.mjs`（自选空闲端口、注入 `WRACKSPURT_DB_PATH`、boot 前打印 `READY <url>`）和 `manifest.json`
  - `tauri.conf.json`：`beforeBuildCommand` 切到该脚本；`bundle.resources` 加入 `../sidecar/**/*`
  - `src-tauri/src/sidecar.rs`：在 release 模式下用 `tauri-plugin-shell` 起 `node <resource_dir>/sidecar/launcher.mjs`，监听 stdout 解析 `READY` 后用 `window.eval` 把主窗口跳到 sidecar URL；dev 模式短路保留 devUrl 行为；首屏 capability `shell:allow-spawn` 允许执行 `node`
  - **限制**（已记入源码注释）：仍依赖用户系统装有 Node ≥ 20；`@libsql/client` 原生绑定使得 Node SEA 单文件方案不可行，需要后续配合 `@yao-pkg/pkg` 或在 Rust 端直接用 `rusqlite`；READY 解析 20 s 超时后不会重启 sidecar
- **校验**：`pnpm typecheck` 7/7、`pnpm test` 13/13、`pnpm --filter @wrackspurt/web build` 18 routes（新增 `/api/projects` + `/api/projects/[id]`）

### 0′. 上一轮（2026-04-29 第三轮）
- **本地文件拖拽上传** — 新路由 `POST /api/sources/upload`（multipart/form-data）：补到按 notebook 分区的临时目录后调 `addSource({sourceType:"file"})`；文件名消毒、扩展名白名单、50 MB 上限、15 种常见文档格式。[`SourceList`](apps/web/components/source-list.tsx) 加拖拽区 + 多选文件器，拖入高亮背景
- **聊天流式响应（SSE）** — 新路由 `POST /api/chat/stream`：帧协议 `event: chunk|meta|done|error`；agent reply 按 24字节边界切片产生打字机效果；citations / conversationId / taskIds 在 `meta` 帧中带回。[`ChatPanel`](apps/web/components/chat-panel.tsx) 改为读 stream，边收边追加到占位 assistant 气泡。原 `/api/chat` POST 仍保留作为同步后退。

### 0′. 上一轮（2026-04-29 第二轮）
- **Tauri dev 冒烟验证** — `pnpm desktop` 本机（macOS arm64）跑通：`tauri dev` 编译 Rust、开窗、加载 Next.js dev server。错误骨：
  - 生成占位图标（纯色 1024×1024 PNG）+ `pnpm tauri icon` 扩出全平台图标集
  - 修 `packages/db/src/client.ts`：`createDb` 现会为 `file:` 临时库 `mkdirSync(parentDir)`，避免 libsql `SQLITE_CANTOPEN(14)`
  - 清理 `apps/desktop/src-tauri/src/lib.rs` 未使用的 `tauri::Manager` import
- **顶栏 doctor 状态条** — 新组件 `TopBar` 调 `/api/doctor`，三色 pill + 折叠 JSON 详情 + 重试；Settings 链接从侧栏上移
- **Slides / Artifact 下载链路闭环** — 新路由 `POST /api/artifacts/[id]/download`：调 `engine.downloadArtifact()` 写入临时目录后流式回传，按 `ArtifactKind` 推断扩展名/MIME；`TaskStatusPanel` 完成任务自动出现 "Download" 按钮
- **Quick actions 补齐** — 新增 Study guide / Flashcards / Audio overview / Risks 4 类；按钮直接 POST `/api/artifacts`（绕过规则式 classifier，保证 kind 准确）
- **多轮上下文** — `AgentRunInput/Result` 加 `conversationId`；`PiAgentRuntime.ask` 透传；`ChatPanel` 持有 conversationId 并随每条消息回传，切换 notebook 时清空
- **Source 上传输入校验** — `/api/sources` POST 增加 `sourceType` 白名单、1 MB 字节上限（HTTP 413）、URL/YouTube 必须为 http(s)

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
| `pnpm --filter @wrackspurt/web build` | 16 路由（启 `chat/stream` + `sources/upload`），standalone 输出 |

### 6. Settings / 连接配置（2026-04-29 新增）
- DB：`settings` 表（key/value + secret 标记），迁移 `0001_settings.sql`，`SettingsRepository`
- Models 包：`GeminiModelClient`（REST，支持 `complete()` + `ping()`）
- Web 服务层：`getKnowledgeEngine` / `getAgentRuntime` / `getGeminiClient` 改为异步、读取 settings；写入后 `invalidateConfigCaches()` 强制重建
- API：`GET/PUT /api/settings`（密文自动 redact）、`POST /api/settings/test/notebooklm`、`POST /api/settings/test/gemini`
- UI：`/settings` 页（NotebookLM CLI binary/HOME/PROFILE/AUTH_JSON/timeout、Gemini apiKey/model/endpoint），含"Test connection"、`doctor` JSON 内联展示、密钥自动遮蔽。`NotebookSidebar` 加 ⚙ Settings 入口
- `KnowledgeEngine` 接口正式纳入 `doctor()` 方法

## 二、未完成 / 待办

### A. 桌面打包（最关键）
- **Rust 工具链**：已就位；`pnpm desktop` dev 已验证跑通。
- **桌面图标**：占位图标已生成于 `apps/desktop/src-tauri/icons/`（纯蓝色 1024×1024）；发布前需替换为品牌资源。
- **生产模式 Next.js sidecar**：当前 `pnpm desktop:build` 只打包了 Tauri 壳。生产需把 `.next/standalone/server.js` + Node 运行时打成单文件 sidecar（推荐 [`@yao-pkg/pkg`](https://github.com/yao-pkg/pkg) 或 Node SEA），在 `tauri.conf.json` 的 `bundle.externalBin` 声明，并在 `src-tauri/src/lib.rs` 用 `tauri-plugin-shell` 启动子进程、等端口可用后再开窗。
- **libsql 原生绑定**：sidecar 打包时必须把 `node_modules/@libsql/*` 的平台原生 `.node` 一并带上。
- **首次签名/公证**：Windows `.msi` 需 codesign；macOS 需 Apple Developer ID + notarization。

### B. NotebookLM 能力对齐
- `notebooklm-py` CLI 必须由用户预先 `pip install` 并 `notebooklm login`。**已加** 顶栏 doctor 状态条作为首屏指示。
- Source 上传：API + UI 已通，已加白名单 + 1 MB 上限；本地文件拖拽链路仍待做。
- Slides 下载：**已闭环**（`POST /api/artifacts/[id]/download` + TaskStatusPanel 下载按钮）。
- Audio/Video overview、Study guide、Flashcards：UI 按钮已暴露并直连 `/api/artifacts`；Data-table 仍未暴露。

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
| 2 | `auth check` 在 admin/debug UI；过期重登引导 | **顶栏 doctor 状态条 + Settings "Test connection"**；缺过期自动弹窗 | 部分 |
| 3 | Profile 多账号隔离 | Settings 已支持 `notebooklm.profile` 字段；缺 UI 切换 dropdown | 部分 |
| 4 | `packages/models` 含 OpenAI-compatible / Gemini provider | **已补齐** `GeminiModelClient` | ✓ |
| 5 | Project 层级（左栏 Projects → Notebooks） | **已闭环** repo 改造 + `/api/projects` + ProjectPicker + 侧栏过滤/移动 | ✓ |
| 6 | shadcn/ui + assistant-ui | 未引入，组件用 Tailwind 原语 | TODO |
| 7 | 流式聊天 | **已闭环** `/api/chat/stream` SSE + ChatPanel 边收边渲染（仿打字机） | ✓ |
| 8 | 首次启动 onboarding 向导 | **OnboardingBanner 已落地** —— 三步 checklist + Settings 直链 + localStorage dismiss；正式分步向导仍可后续打磨 | ✓ |
| 9 | Quick actions 缺：Risk list、Study guide、Flashcards、Audio/Video overview | **全部补齐**（Risks/Study guide/Flashcards/Audio/Video overview/Data table 都在条上） | ✓ |
| 10 | 文件拖拽上传 source | **已闭环** `/api/sources/upload` multipart + SourceList 拖拽区/文件选择器 | ✓ |
| 11 | conversationId 复用（多轮上下文） | **已闭环** UI ↔ chat API ↔ agent runtime ↔ adapter | ✓ |
| 12 | Phase 3 sidecar：Next.js standalone 包成 Tauri externalBin | **脚手架已落地** build-sidecar 脚本 + Rust 启动钩子 + 资源声明；仍依赖系统 Node、未做单文件打包 | 部分 |
| 13 | 任务重试 / 错误恢复 | **TaskStatusPanel 失败行有 Retry/Dismiss**；retry 复用 workspace-store 中保留的 kind/instructions 重新提交并替换 taskId | ✓ |
| 14 | 长任务后台 worker | 同进程轮询 | 低（MVP 可接受） |
| 15 | 操作审计日志、结构化日志 | **`audit-log.ts` 输出 ndjson** + 事件枚举 + WRACKSPURT_AUDIT_FILE 落盘；已挂到 notebooks/artifacts/chat 路由 | ✓ |
| 16 | 密钥安全存储（OS keyring） | SQLite 明文 + secret 标记 + redact 输出；Tauri 桌面应迁移到 keyring | 高优（桌面发布前必做） |
| 17 | 真实 pi-agent 多步规划 | **planner-executor 已落地**（LlmPlannerRuntime，Gemini JSON 规划，最多 4 步，无配置时回退规则式） | ✓ |

### 推荐下一步排序（更新）
1. ~~装 Rust + 跑通 `pnpm desktop` dev 模式~~ ✓。
2. ~~首屏 doctor 状态条~~ ✓。
3. ~~Slides 下载链路~~ ✓。
4. ~~本地文件上传 + 拖拽~~ ✓。
5. ~~流式聊天 SSE~~ ✓。
6. ~~Project 层级 UI~~ ✓。
7. ~~接入真实 pi-agent（planner-executor）~~ ✓ — 后续可扩展为反思/批评者循环、多工具组合。
8. ~~Sidecar 脚手架~~ ✓；~~崩溃自动重启~~ ✓ — 真正"开箱即用 .dmg/.msi"还需：(a) 单文件打包 Node + 携带 `@libsql/*` 平台 `.node`（评估 `@yao-pkg/pkg`，或在 Rust 侧改用 `rusqlite` 移除 Node 依赖）；(b) 端口冲突与多开应用清理。
9. ~~首屏 onboarding~~ ✓ — checklist 横幅；后续可升级为 Wizard。
10. ~~Quick actions 全集~~ ✓；~~任务失败 Retry~~ ✓；~~结构化审计日志~~ ✓。
11. **OS keyring** 集成（`tauri-plugin-stronghold` / `keyring-rs`）— 桌面发布前必做。设计稿需要：Tauri 端 IPC 命令（`get_secret`/`set_secret`），Next.js services 层在 desktop 环境优先读 keyring 再回退 SQLite，schema 加 `secret_in_keyring` 列做迁移。
12. **正式品牌图标** — 占位纯蓝色方块，发布前需设计资源后 `pnpm tauri icon` 重生。
13. shadcn/ui + assistant-ui 接入（视觉/无障碍升级）。
14. Profile 多账号顶栏 dropdown（Settings 已有字段；只是顶栏 quick switcher）。
