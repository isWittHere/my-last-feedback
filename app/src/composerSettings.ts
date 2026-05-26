export interface ComposerSettings {
  commandSearchIncludesDescription: boolean;
}

export const COMPOSER_SETTINGS_EVENT = "mlf-composer-settings-changed";

const STORAGE_KEY = "mlf-composer-settings";
const DEFAULT_COMPOSER_SETTINGS: ComposerSettings = {
  commandSearchIncludesDescription: true,
};

function normalizeSettings(value: Partial<ComposerSettings> | null | undefined): ComposerSettings {
  return {
    commandSearchIncludesDescription: value?.commandSearchIncludesDescription !== false,
  };
}

export function getComposerSettings(): ComposerSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_COMPOSER_SETTINGS;
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_COMPOSER_SETTINGS;
  }
}

export function saveComposerSettings(settings: ComposerSettings) {
  const normalized = normalizeSettings(settings);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized)); } catch {}
  try { window.dispatchEvent(new CustomEvent(COMPOSER_SETTINGS_EVENT, { detail: normalized })); } catch {}
}