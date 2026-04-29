"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";

export type Lang = "en" | "zh";

const STORAGE_KEY = "wrackspurt:lang";

function readInitial(): Lang {
  if (typeof window === "undefined") return "en";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "en" || v === "zh") return v;
    const browser = window.navigator.language?.toLowerCase() ?? "";
    return browser.startsWith("zh") ? "zh" : "en";
  } catch {
    return "en";
  }
}

interface LangStore {
  lang: Lang;
  setLang: (l: Lang) => void;
}

export const useLangStore = create<LangStore>((set) => ({
  lang: readInitial(),
  setLang: (lang) => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, lang);
        document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
      } catch {
        /* ignore */
      }
    }
    set({ lang });
  },
}));

/* ---------------------------------------------------------------------- */
/* Dictionary — keep flat. Add keys as you touch components.              */
/* ---------------------------------------------------------------------- */

type Dict = Record<string, string>;

const en: Dict = {
  // Workspace recents (used by switcher + toasts)
  "launcher.recent": "Recent",
  "launcher.missing": "missing",
  "launcher.failedOpen": "Failed to open workspace.",
  "launcher.opened": "Opened {name}",

  // Workspace shell
  "shell.providers": "Settings",
  "shell.newWorkspace": "+ New workspace…",
  "shell.newPrompt": "Absolute path of the new workspace folder:",
  "shell.noRecents": "No other workspaces yet.",

  // Provider dialog
  "provider.title": "Model providers",
  "provider.intro":
    "Configure your Google Gemini API key. The key is stored locally in the SQLite settings table.",
  "provider.configured": "configured",
  "provider.saveTest": "Save & test",
  "provider.saving": "Saving…",
  "provider.nothingToSave": "Nothing to save — edit a field first.",
  "provider.saveFailed": "Save failed.",
  "provider.pingFailed": "Ping failed",
  "provider.connected": "{label}: connected.",
  "provider.activeSet": "Active provider: {id}",
  "provider.modelPlaceholder": "Model (default: {model})",
  "provider.endpointPlaceholder": "Endpoint (default: {endpoint})",
  "provider.apiKeyPlaceholder": "API key",
  "provider.apiKeyStored": "••• stored ({hint})",
  "provider.gemini.help": "AI Studio key (https://aistudio.google.com/app/apikey).",
  "provider.openai.help":
    "OpenAI key, or any OpenAI-compatible API key (Together, Groq, vLLM, …).",
  "provider.copilot.help":
    "Copilot Chat token from a Copilot proxy (PackyCode, copilot-api). Personal subscriptions: extract via gh-copilot CLI.",

  // File explorer
  "files.header": "Workspace",
  "files.refresh": "Refresh",
  "files.empty": "No files yet — ask the agent to create something.",

  // Chat
  "chat.empty": "Just describe what you want — the agent picks the right skill.",
  "chat.placeholder": "Type a message — Cmd/Ctrl+Enter to send",
  "chat.send": "Send",
  "chat.sending": "…",
  "chat.thinking": "Thinking…",
  "chat.requestFailed": "Request failed ({status})",
  "chat.providerMissing": "No model API key configured — chat is disabled.",
  "chat.providerMissingPh": "Configure an API key in Settings to start chatting.",
  "chat.openSettings": "Open Settings",
  "chat.reasoning": "Reasoning ({n} steps)",
  "chat.artifactsHeader": "Generated {n} artifact(s)",

  // Settings page
  "settingsPage.title": "Settings",
  "settingsPage.home": "← Home",

  // LanguageSwitch
  "lang.switch": "Language",
};

const zh: Dict = {
  "launcher.recent": "最近",
  "launcher.missing": "已不存在",
  "launcher.failedOpen": "打开 workspace 失败。",
  "launcher.opened": "已打开 {name}",

  "shell.providers": "设置",
  "shell.newWorkspace": "+ 新建 workspace…",
  "shell.newPrompt": "请输入新 workspace 文件夹的绝对路径：",
  "shell.noRecents": "还没有其他 workspace。",

  "provider.title": "模型 Provider",
  "provider.intro":
    "配置 Google Gemini 的 API key。Key 仅保存在本地 SQLite 设置表里。",
  "provider.configured": "已配置",
  "provider.saveTest": "保存并测试",
  "provider.saving": "保存中…",
  "provider.nothingToSave": "没有可保存的修改 —— 请先编辑字段。",
  "provider.saveFailed": "保存失败。",
  "provider.pingFailed": "连通性测试失败",
  "provider.connected": "{label}：已连通。",
  "provider.activeSet": "当前 Provider：{id}",
  "provider.modelPlaceholder": "模型名（默认：{model}）",
  "provider.endpointPlaceholder": "Endpoint（默认：{endpoint}）",
  "provider.apiKeyPlaceholder": "API Key",
  "provider.apiKeyStored": "••• 已保存（{hint}）",
  "provider.gemini.help": "AI Studio 上申请的 key（https://aistudio.google.com/app/apikey）。",
  "provider.openai.help":
    "OpenAI 官方 key，或任意 OpenAI 兼容服务（Together、Groq、vLLM 等）的 key。",
  "provider.copilot.help":
    "Copilot Chat token；可以来自 PackyCode、copilot-api 等代理；个人订阅可通过 gh-copilot CLI 抽取。",

  "files.header": "工作区",
  "files.refresh": "刷新",
  "files.empty": "还没有任何文件 —— 说明需求后 Agent 会生成。",

  "chat.empty": "直接告诉 Agent 你想要什么 —— 它会自动选择合适的 skill。",
  "chat.placeholder": "输入消息 —— Cmd/Ctrl+Enter 发送",
  "chat.send": "发送",
  "chat.sending": "…",
  "chat.thinking": "思考中…",
  "chat.requestFailed": "请求失败（{status}）",
  "chat.providerMissing": "未配置模型 API key，聊天已禁用。",
  "chat.providerMissingPh": "请在设置中配置 API key 以开始聊天。",
  "chat.openSettings": "打开设置",
  "chat.reasoning": "思考过程（{n} 步）",
  "chat.artifactsHeader": "已生成 {n} 个产物",

  "settingsPage.title": "设置",
  "settingsPage.home": "← 返回首页",

  "lang.switch": "语言",
};

const DICTS: Record<Lang, Dict> = { en, zh };

function format(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => {
    const v = vars[k];
    return v === undefined || v === null ? `{${k}}` : String(v);
  });
}

/**
 * Hook for translating a key. Re-renders on language change.
 */
export function useT() {
  const lang = useSyncExternalStore(
    (cb) => useLangStore.subscribe(cb),
    () => useLangStore.getState().lang,
    () => "en" as Lang,
  );
  return (key: string, vars?: Record<string, string | number>): string => {
    const dict = DICTS[lang] ?? en;
    return format(dict[key] ?? en[key] ?? key, vars);
  };
}
