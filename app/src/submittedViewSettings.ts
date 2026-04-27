export type SubmittedViewSectionId =
  | "userFeedback"
  | "slashExpansions"
  | "userRequirement"
  | "questions"
  | "gitAction"
  | "images"
  | "resourceLinks"
  | "testLogs"
  | "commandLogs"
  | "mlcReferences"
  | "webPreview"
  | "payloadRouting"
  | "system"
  | "other";

export interface SubmittedViewSectionConfig {
  id: SubmittedViewSectionId;
  labelKey: string;
  defaultLabel: string;
}

export interface SubmittedViewSettings {
  visibleSections: Record<SubmittedViewSectionId, boolean>;
  collapsedSections: Record<SubmittedViewSectionId, boolean>;
}

export const SUBMITTED_VIEW_SETTINGS_EVENT = "mlf-submitted-view-settings-changed";

const STORAGE_KEY = "mlf-submitted-view-settings";

export const SUBMITTED_VIEW_SECTION_CONFIGS: SubmittedViewSectionConfig[] = [
  { id: "userFeedback", labelKey: "settings.submittedSectionUserFeedback", defaultLabel: "User Feedback" },
  { id: "slashExpansions", labelKey: "settings.submittedSectionSlashExpansions", defaultLabel: "Slash command expansions" },
  { id: "userRequirement", labelKey: "settings.submittedSectionUserRequirement", defaultLabel: "User requirement" },
  { id: "questions", labelKey: "settings.submittedSectionQuestions", defaultLabel: "Questions and answers" },
  { id: "gitAction", labelKey: "settings.submittedSectionGitAction", defaultLabel: "Git action" },
  { id: "images", labelKey: "settings.submittedSectionImages", defaultLabel: "Images" },
  { id: "resourceLinks", labelKey: "settings.submittedSectionResourceLinks", defaultLabel: "Resource links" },
  { id: "testLogs", labelKey: "settings.submittedSectionTestLogs", defaultLabel: "Test logs" },
  { id: "commandLogs", labelKey: "settings.submittedSectionCommandLogs", defaultLabel: "Command logs" },
  { id: "mlcReferences", labelKey: "settings.submittedSectionMlcReferences", defaultLabel: "MLC references" },
  { id: "webPreview", labelKey: "settings.submittedSectionWebPreview", defaultLabel: "Web preview" },
  { id: "payloadRouting", labelKey: "settings.submittedSectionPayloadRouting", defaultLabel: "Payload routing" },
  { id: "system", labelKey: "settings.submittedSectionSystem", defaultLabel: "System" },
  { id: "other", labelKey: "settings.submittedSectionOther", defaultLabel: "Other content" },
];

const SECTION_IDS = SUBMITTED_VIEW_SECTION_CONFIGS.map((section) => section.id);

export const DEFAULT_SUBMITTED_VIEW_SETTINGS: SubmittedViewSettings = {
  visibleSections: Object.fromEntries(SECTION_IDS.map((id) => [id, true])) as Record<SubmittedViewSectionId, boolean>,
  collapsedSections: {
    userFeedback: false,
    slashExpansions: true,
    userRequirement: false,
    questions: false,
    gitAction: false,
    images: false,
    resourceLinks: false,
    testLogs: true,
    commandLogs: true,
    mlcReferences: true,
    webPreview: true,
    payloadRouting: true,
    system: true,
    other: false,
  },
};

function normalizeSettings(value: Partial<SubmittedViewSettings> | null | undefined): SubmittedViewSettings {
  return {
    visibleSections: {
      ...DEFAULT_SUBMITTED_VIEW_SETTINGS.visibleSections,
      ...(value?.visibleSections || {}),
    },
    collapsedSections: {
      ...DEFAULT_SUBMITTED_VIEW_SETTINGS.collapsedSections,
      ...(value?.collapsedSections || {}),
    },
  };
}

export function getSubmittedViewSettings(): SubmittedViewSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SUBMITTED_VIEW_SETTINGS;
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SUBMITTED_VIEW_SETTINGS;
  }
}

export function saveSubmittedViewSettings(settings: SubmittedViewSettings) {
  const normalized = normalizeSettings(settings);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized)); } catch {}
  try { window.dispatchEvent(new CustomEvent(SUBMITTED_VIEW_SETTINGS_EVENT, { detail: normalized })); } catch {}
}

export function identifySubmittedViewSection(title: string): SubmittedViewSectionId {
  const normalized = title.trim().toLowerCase().replace(/[:：]/g, "");
  if (!normalized) return "other";
  if (normalized.includes("slash command expansion")) return "slashExpansions";
  if (normalized.includes("user requirement")) return "userRequirement";
  if (normalized.includes("question") || normalized.includes("answer")) return "questions";
  if (normalized.includes("git action")) return "gitAction";
  if (normalized.includes("image")) return "images";
  if (normalized.includes("resource link") || normalized.includes("file link") || normalized.includes("attachment resource")) return "resourceLinks";
  if (normalized.includes("test log")) return "testLogs";
  if (normalized.includes("command log")) return "commandLogs";
  if (normalized.includes("mlc")) return "mlcReferences";
  if (normalized.includes("web preview") || normalized.includes("web attachment")) return "webPreview";
  if (normalized.includes("payload") || normalized.includes("routing")) return "payloadRouting";
  if (normalized.includes("system") || normalized.includes("reminder")) return "system";
  if (normalized.includes("user feedback") || normalized === "feedback") return "userFeedback";
  return "other";
}