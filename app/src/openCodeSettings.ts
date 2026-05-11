import { useSyncExternalStore } from "react";
import type { AgentChoiceOption } from "./agent/types";
import type { OpenCodePermissionAction, OpenCodePermissionRule } from "./agent/opencode";

export type { OpenCodePermissionAction };
export type OpenCodePermissionSettingAction = OpenCodePermissionAction | "override";

export interface OpenCodeModelSettings extends AgentChoiceOption {
  enabled: boolean;
  favorite: boolean;
  lastSeenAt?: string;
}

export interface OpenCodeSettings {
  models: OpenCodeModelSettings[];
  preferredModelId?: string;
  defaultPermissionPreset: OpenCodePermissionPresetItem[];
}

export interface OpenCodePermissionPresetItem {
  permission: string;
  pattern?: string;
  action: OpenCodePermissionAction;
}

export type OpenCodePermissionPresetId = "default" | "controlledAuto" | "overrideAuto";

export interface OpenCodePermissionPresetDefinition {
  id: OpenCodePermissionPresetId;
  labelKey: string;
  defaultLabel: string;
  descriptionKey: string;
  defaultDescription: string;
  icon: string;
  rules: OpenCodePermissionRule[];
}

export interface OpenCodePermissionDefinition {
  permission: string;
  labelKey: string;
  defaultLabel: string;
  descriptionKey: string;
  defaultDescription: string;
  defaultAction: OpenCodePermissionAction;
  icon: string;
}

export const OPEN_CODE_PERMISSION_DEFINITIONS: OpenCodePermissionDefinition[] = [
  { permission: "glob", labelKey: "settings.openCodePermissionGlob", defaultLabel: "File matching", descriptionKey: "settings.openCodePermissionGlobDesc", defaultDescription: "Find files by pattern inside the workspace.", defaultAction: "allow", icon: "file" },
  { permission: "grep", labelKey: "settings.openCodePermissionGrep", defaultLabel: "Content search", descriptionKey: "settings.openCodePermissionGrepDesc", defaultDescription: "Search text in workspace files.", defaultAction: "allow", icon: "search" },
  { permission: "read", labelKey: "settings.openCodePermissionRead", defaultLabel: "Read files", descriptionKey: "settings.openCodePermissionReadDesc", defaultDescription: "Read files from the active workspace.", defaultAction: "allow", icon: "eye" },
  { permission: "list", labelKey: "settings.openCodePermissionList", defaultLabel: "List directories", descriptionKey: "settings.openCodePermissionListDesc", defaultDescription: "Inspect workspace directory structure.", defaultAction: "allow", icon: "list" },
  { permission: "edit", labelKey: "settings.openCodePermissionEdit", defaultLabel: "Modify files", descriptionKey: "settings.openCodePermissionEditDesc", defaultDescription: "Create, edit, or patch files.", defaultAction: "ask", icon: "edit" },
  { permission: "bash", labelKey: "settings.openCodePermissionBash", defaultLabel: "Command execution", descriptionKey: "settings.openCodePermissionBashDesc", defaultDescription: "Run shell commands through OpenCode.", defaultAction: "ask", icon: "terminal" },
  { permission: "task", labelKey: "settings.openCodePermissionTask", defaultLabel: "Subtasks", descriptionKey: "settings.openCodePermissionTaskDesc", defaultDescription: "Delegate work to OpenCode subagents.", defaultAction: "deny", icon: "checklist" },
  { permission: "webfetch", labelKey: "settings.openCodePermissionWebFetch", defaultLabel: "Read webpages", descriptionKey: "settings.openCodePermissionWebFetchDesc", defaultDescription: "Fetch external webpage content.", defaultAction: "ask", icon: "globe" },
  { permission: "websearch", labelKey: "settings.openCodePermissionWebSearch", defaultLabel: "Web search", descriptionKey: "settings.openCodePermissionWebSearchDesc", defaultDescription: "Search the web from OpenCode.", defaultAction: "ask", icon: "search" },
  { permission: "external_directory", labelKey: "settings.openCodePermissionExternalDirectory", defaultLabel: "External directories", descriptionKey: "settings.openCodePermissionExternalDirectoryDesc", defaultDescription: "Access files outside the active workspace.", defaultAction: "ask", icon: "folder" },
  { permission: "skill", labelKey: "settings.openCodePermissionSkill", defaultLabel: "Skills", descriptionKey: "settings.openCodePermissionSkillDesc", defaultDescription: "Load extra skill instructions.", defaultAction: "ask", icon: "book" },
];

const OPEN_CODE_EXTREME_BASH_ASK_PATTERNS = [
  "rm -rf /",
  "rm -rf /*",
  "rm -fr /",
  "rm -fr /*",
  "rm -rf ~",
  "rm -rf ~/*",
  "Remove-Item C:/*",
  "Remove-Item C:/**",
  "git reset *",
  "git clean *",
  "git checkout *",
  "git switch *",
  "sudo *",
  "su *",
  "curl *",
  "wget *",
  "iwr *",
  "irm *",
  "npm publish *",
  "pnpm publish *",
  "yarn publish *",
  "docker system *",
  "docker volume *",
  "docker image prune *",
  "terraform apply *",
  "terraform destroy *",
  "pulumi up *",
  "pulumi destroy *",
  "kubectl apply *",
  "kubectl delete *",
];

const OPEN_CODE_CONTROLLED_BASH_ASK_PATTERNS = [
  "rm *",
  "rmdir *",
  "del *",
  "Remove-Item *",
  "chmod *",
  "chown *",
  ...OPEN_CODE_EXTREME_BASH_ASK_PATTERNS,
];

function rule(permission: string, action: OpenCodePermissionAction, pattern = "*"): OpenCodePermissionRule {
  return { permission, pattern, action };
}

function bashRules(mode: "controlled" | "override"): OpenCodePermissionRule[] {
  const patterns = mode === "controlled" ? OPEN_CODE_CONTROLLED_BASH_ASK_PATTERNS : OPEN_CODE_EXTREME_BASH_ASK_PATTERNS;
  return [rule("bash", "allow"), ...patterns.map((pattern) => rule("bash", "ask", pattern))];
}

export const OPEN_CODE_PERMISSION_PRESETS: OpenCodePermissionPresetDefinition[] = [
  {
    id: "default",
    labelKey: "settings.openCodePermissionPresetDefault",
    defaultLabel: "Default",
    descriptionKey: "settings.openCodePermissionPresetDefaultDesc",
    defaultDescription: "Ask before edits, commands, web access, and skills; deny subtasks; ask for external directories.",
    icon: "shield",
    rules: OPEN_CODE_PERMISSION_DEFINITIONS.map((item) => rule(item.permission, item.defaultAction)),
  },
  {
    id: "controlledAuto",
    labelKey: "settings.openCodePermissionPresetControlledAuto",
    defaultLabel: "Controlled auto",
    descriptionKey: "settings.openCodePermissionPresetControlledAutoDesc",
    defaultDescription: "Allow routine work while asking before destructive shell commands.",
    icon: "zap",
    rules: [
      rule("glob", "allow"),
      rule("grep", "allow"),
      rule("read", "allow"),
      rule("list", "allow"),
      rule("edit", "allow"),
      ...bashRules("controlled"),
      rule("task", "deny"),
      rule("webfetch", "allow"),
      rule("websearch", "allow"),
      rule("external_directory", "allow"),
      rule("skill", "allow"),
    ],
  },
  {
    id: "overrideAuto",
    labelKey: "settings.openCodePermissionPresetOverrideAuto",
    defaultLabel: "Override auto",
    descriptionKey: "settings.openCodePermissionPresetOverrideAutoDesc",
    defaultDescription: "Allow routine destructive file operations while still asking before extreme-risk commands.",
    icon: "rocket",
    rules: [
      rule("glob", "allow"),
      rule("grep", "allow"),
      rule("read", "allow"),
      rule("list", "allow"),
      rule("edit", "allow"),
      ...bashRules("override"),
      rule("task", "deny"),
      rule("webfetch", "allow"),
      rule("websearch", "allow"),
      rule("external_directory", "allow"),
      rule("skill", "allow"),
    ],
  },
];

const STORAGE_KEY = "mlfb-opencode-settings-v1";
const CHANGE_EVENT = "mlfb-opencode-settings-changed";

const DEFAULT_SETTINGS: OpenCodeSettings = {
  models: [],
  preferredModelId: undefined,
  defaultPermissionPreset: OPEN_CODE_PERMISSION_PRESETS[0].rules,
};

let cachedRaw: string | null = null;
let cachedSettings: OpenCodeSettings = DEFAULT_SETTINGS;

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeModel(model: unknown): OpenCodeModelSettings | null {
  if (!model || typeof model !== "object") return null;
  const value = model as Partial<OpenCodeModelSettings>;
  if (typeof value.id !== "string" || !value.id) return null;
  return {
    id: value.id,
    label: typeof value.label === "string" && value.label ? value.label : value.id,
    description: typeof value.description === "string" && value.description ? value.description : undefined,
    contextLimit: typeof value.contextLimit === "number" && Number.isFinite(value.contextLimit) && value.contextLimit > 0 ? value.contextLimit : undefined,
    enabled: Boolean(value.enabled),
    favorite: Boolean(value.favorite),
    lastSeenAt: typeof value.lastSeenAt === "string" ? value.lastSeenAt : undefined,
  };
}

function normalizePermissionAction(action: unknown, fallback: OpenCodePermissionAction): OpenCodePermissionAction {
  return action === "allow" || action === "ask" || action === "deny" ? action : fallback;
}

function normalizePermissionPreset(value: unknown): OpenCodePermissionPresetItem[] {
  const rules: OpenCodePermissionPresetItem[] = [];
  const wildcardByPermission = new Map<string, OpenCodePermissionAction>();
  if (Array.isArray(value)) {
    for (const item of value) {
      if (!item || typeof item !== "object") continue;
      const parsed = item as Partial<OpenCodePermissionPresetItem>;
      if (typeof parsed.permission !== "string" || !parsed.permission) continue;
      const definition = OPEN_CODE_PERMISSION_DEFINITIONS.find((entry) => entry.permission === parsed.permission);
      const action = normalizePermissionAction(parsed.action, definition?.defaultAction || "ask");
      const pattern = typeof parsed.pattern === "string" && parsed.pattern ? parsed.pattern : "*";
      rules.push({ permission: parsed.permission, pattern, action });
      if (pattern === "*") wildcardByPermission.set(parsed.permission, action);
    }
  }
  for (const definition of OPEN_CODE_PERMISSION_DEFINITIONS) {
    if (!wildcardByPermission.has(definition.permission)) {
      rules.unshift({ permission: definition.permission, pattern: "*", action: definition.defaultAction });
    }
  }
  return rules;
}

function normalizeSettings(value: unknown): OpenCodeSettings {
  if (!value || typeof value !== "object") return DEFAULT_SETTINGS;
  const parsed = value as Partial<OpenCodeSettings>;
  const models = Array.isArray(parsed.models)
    ? parsed.models.map(normalizeModel).filter((model): model is OpenCodeModelSettings => Boolean(model))
    : [];
  const preferredModelId = typeof parsed.preferredModelId === "string" && parsed.preferredModelId ? parsed.preferredModelId : undefined;
  const defaultPermissionPreset = normalizePermissionPreset(parsed.defaultPermissionPreset);
  return { models, preferredModelId, defaultPermissionPreset };
}

export function getOpenCodeSettings(): OpenCodeSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === cachedRaw) return cachedSettings;
    cachedRaw = raw;
    cachedSettings = raw ? normalizeSettings(JSON.parse(raw)) : DEFAULT_SETTINGS;
    return cachedSettings;
  } catch {
    cachedSettings = DEFAULT_SETTINGS;
    return cachedSettings;
  }
}

export function saveOpenCodeSettings(settings: OpenCodeSettings) {
  const normalized = normalizeSettings(settings);
  const raw = JSON.stringify(normalized);
  cachedRaw = raw;
  cachedSettings = normalized;
  try { localStorage.setItem(STORAGE_KEY, raw); } catch {}
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function openCodePermissionPresetToRules(preset: OpenCodePermissionPresetItem[]): OpenCodePermissionRule[] {
  return normalizePermissionPreset(preset).map((item) => ({ permission: item.permission, pattern: item.pattern || "*", action: item.action }));
}

export function getOpenCodeDefaultPermissionRules(): OpenCodePermissionRule[] {
  return openCodePermissionPresetToRules(getOpenCodeSettings().defaultPermissionPreset);
}

export function getOpenCodePermissionPresetRules(presetId: OpenCodePermissionPresetId): OpenCodePermissionRule[] {
  const preset = OPEN_CODE_PERMISSION_PRESETS.find((item) => item.id === presetId) || OPEN_CODE_PERMISSION_PRESETS[0];
  return preset.rules.map((item) => ({ ...item }));
}

export function openCodePermissionActionToRules(permission: string, action: OpenCodePermissionSettingAction): OpenCodePermissionRule[] {
  if (permission === "bash" && action === "override") return bashRules("override");
  const resolvedAction: OpenCodePermissionAction = action === "override" ? "allow" : action;
  return [rule(permission, resolvedAction)];
}

function permissionRuleKey(rule: OpenCodePermissionRule): string {
  return `${rule.permission}\u0000${rule.pattern}\u0000${rule.action}`;
}

function wildcardMatches(value: string, pattern: string): boolean {
  if (pattern === "*") return true;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(value);
}

export function evaluateOpenCodePermissionRuleAction(rules: OpenCodePermissionRule[], permission: string, pattern: string): OpenCodePermissionAction {
  for (let index = rules.length - 1; index >= 0; index -= 1) {
    const rule = rules[index];
    if (wildcardMatches(permission, rule.permission) && wildcardMatches(pattern, rule.pattern)) return rule.action;
  }
  return "ask";
}

function presetMatchesEffectiveRules(rules: OpenCodePermissionRule[], preset: OpenCodePermissionPresetDefinition): boolean {
  const presetRules = preset.rules.map((item) => ({ ...item }));
  const patternsByPermission = new Map<string, Set<string>>();
  for (const definition of OPEN_CODE_PERMISSION_DEFINITIONS) {
    patternsByPermission.set(definition.permission, new Set(["*"]));
  }
  for (const rule of presetRules) {
    const patterns = patternsByPermission.get(rule.permission) || new Set<string>();
    patterns.add(rule.pattern);
    patternsByPermission.set(rule.permission, patterns);
  }
  for (const [permission, patterns] of patternsByPermission.entries()) {
    for (const pattern of patterns) {
      if (evaluateOpenCodePermissionRuleAction(rules, permission, pattern) !== evaluateOpenCodePermissionRuleAction(presetRules, permission, pattern)) return false;
    }
  }
  return true;
}

export function getOpenCodePermissionPresetId(rules: OpenCodePermissionPresetItem[] | OpenCodePermissionRule[] | undefined): OpenCodePermissionPresetId | undefined {
  const normalized = openCodePermissionPresetToRules(rules || []);
  const normalizedKeys = normalized.map(permissionRuleKey).join("\u0001");
  const exact = OPEN_CODE_PERMISSION_PRESETS.find((preset) => preset.rules.map(permissionRuleKey).join("\u0001") === normalizedKeys)?.id;
  if (exact) return exact;
  const tail = OPEN_CODE_PERMISSION_PRESETS.find((preset) => {
    if (normalized.length < preset.rules.length) return false;
    const tailRules = normalized.slice(-preset.rules.length);
    return tailRules.map(permissionRuleKey).join("\u0001") === preset.rules.map(permissionRuleKey).join("\u0001");
  })?.id;
  if (tail) return tail;
  return OPEN_CODE_PERMISSION_PRESETS.find((preset) => presetMatchesEffectiveRules(normalized, preset))?.id;
}

function bashModeFromRules(rules: OpenCodePermissionRule[]): OpenCodePermissionSettingAction | undefined {
  let wildcardIndex = -1;
  let wildcardAction: OpenCodePermissionAction | undefined;
  for (let index = rules.length - 1; index >= 0; index -= 1) {
    const item = rules[index];
    if (item.permission === "bash" && item.pattern === "*") {
      wildcardIndex = index;
      wildcardAction = item.action;
      break;
    }
  }
  if (!wildcardAction) return undefined;
  if (wildcardAction !== "allow") return wildcardAction;
  const tail = rules.slice(wildcardIndex + 1).filter((item) => item.permission === "bash" && item.pattern !== "*");
  const tailKeys = tail.map(permissionRuleKey).join("\u0001");
  if (tailKeys === bashRules("override").slice(1).map(permissionRuleKey).join("\u0001")) return "override";
  return "allow";
}

export function getOpenCodePermissionPresetAction(preset: OpenCodePermissionPresetItem[] | undefined, permission: string): OpenCodePermissionSettingAction {
  const definition = OPEN_CODE_PERMISSION_DEFINITIONS.find((item) => item.permission === permission);
  const normalized = openCodePermissionPresetToRules(preset || []);
  if (permission === "bash") return bashModeFromRules(normalized) || definition?.defaultAction || "ask";
  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    const item = normalized[index];
    if (item.permission === permission && item.pattern === "*") return item.action;
  }
  return definition?.defaultAction || "ask";
}

export function setOpenCodeDefaultPermissionPreset(presetId: OpenCodePermissionPresetId): OpenCodeSettings {
  const current = getOpenCodeSettings();
  const next = {
    ...current,
    defaultPermissionPreset: getOpenCodePermissionPresetRules(presetId),
  };
  saveOpenCodeSettings(next);
  return next;
}

export function setOpenCodeDefaultPermissionAction(permission: string, action: OpenCodePermissionSettingAction): OpenCodeSettings {
  const current = getOpenCodeSettings();
  const next = {
    ...current,
    defaultPermissionPreset: [
      ...normalizePermissionPreset(current.defaultPermissionPreset).filter((item) => item.permission !== permission),
      ...openCodePermissionActionToRules(permission, action),
    ],
  };
  saveOpenCodeSettings(next);
  return next;
}

export function syncOpenCodeModels(models: AgentChoiceOption[], currentModelId?: string): OpenCodeSettings {
  const current = getOpenCodeSettings();
  const previousById = new Map(current.models.map((model) => [model.id, model]));
  const seenAt = nowIso();
  const nextModels = models.map((model) => {
    const previous = previousById.get(model.id);
    return {
      id: model.id,
      label: model.label || model.id,
      description: model.description,
      contextLimit: model.contextLimit ?? previous?.contextLimit,
      enabled: previous ? previous.enabled : model.id === currentModelId,
      favorite: previous ? previous.favorite : model.id === currentModelId,
      lastSeenAt: seenAt,
    };
  });

  const hasEnabledModel = nextModels.some((model) => model.enabled);
  const normalizedModels = hasEnabledModel || nextModels.length === 0
    ? nextModels
    : nextModels.map((model, index) => ({ ...model, enabled: model.id === currentModelId || (!currentModelId && index === 0), favorite: model.id === currentModelId }));

  const preferredModelId = current.preferredModelId && normalizedModels.some((model) => model.id === current.preferredModelId)
    ? current.preferredModelId
    : currentModelId || normalizedModels.find((model) => model.enabled)?.id;
  const next = { ...current, models: normalizedModels, preferredModelId };
  saveOpenCodeSettings(next);
  return next;
}

export function setOpenCodeModelEnabled(modelId: string, enabled: boolean): OpenCodeSettings {
  const current = getOpenCodeSettings();
  const nextModels = current.models.map((model) => model.id === modelId ? { ...model, enabled } : model);
  const preferredModelId = enabled ? current.preferredModelId || modelId : current.preferredModelId === modelId ? nextModels.find((model) => model.enabled && model.id !== modelId)?.id : current.preferredModelId;
  const next = { ...current, models: nextModels, preferredModelId };
  saveOpenCodeSettings(next);
  return next;
}

export function setOpenCodeModelFavorite(modelId: string, favorite: boolean): OpenCodeSettings {
  const current = getOpenCodeSettings();
  const next = {
    ...current,
    models: current.models.map((model) => model.id === modelId ? { ...model, favorite, enabled: favorite ? true : model.enabled } : model),
  };
  saveOpenCodeSettings(next);
  return next;
}

export function setOpenCodePreferredModel(modelId: string): OpenCodeSettings {
  const current = getOpenCodeSettings();
  const next = {
    ...current,
    preferredModelId: modelId,
    models: current.models.map((model) => model.id === modelId ? { ...model, enabled: true } : model),
  };
  saveOpenCodeSettings(next);
  return next;
}

export function getEnabledOpenCodeModels(sessionModels: AgentChoiceOption[] = [], currentModelId?: string): AgentChoiceOption[] {
  const settings = getOpenCodeSettings();
  const sessionById = new Map(sessionModels.map((model) => [model.id, model]));
  const enabled = settings.models
    .filter((model) => model.enabled || model.id === currentModelId)
    .map((model) => ({ ...model, ...(sessionById.get(model.id) || {}) }));

  if (enabled.length > 0) return enabled;

  if (currentModelId) {
    const currentModel = sessionById.get(currentModelId);
    if (currentModel) return [currentModel];
  }
  return sessionModels.slice(0, 1);
}

function subscribe(listener: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

export function useOpenCodeSettings(): OpenCodeSettings {
  return useSyncExternalStore(subscribe, getOpenCodeSettings, () => DEFAULT_SETTINGS);
}