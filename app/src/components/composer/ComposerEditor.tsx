import {
  forwardRef,
  useEffect,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type KeyboardEvent,
  type ClipboardEvent,
  type FormEvent,
} from "react";
import { parseComposerTextTokens } from "../../composer/composerTokens";
import type { PromptCommandOption } from "../../composer/promptCommands";
import { useFeedbackStore, type ResourceIconTheme } from "../../store/feedbackStore";
import { resolveCatppuccinResourceIcon, type CatppuccinIconFlavor } from "../CatppuccinResourceIcon";
import { useIsLightTheme } from "../useIsLightTheme";
import { PromptIcon } from "../PromptIcons";
import { Icon } from "../Icons";
import { COMPOSER_SETTINGS_EVENT, getComposerSettings, type ComposerSettings } from "../../composerSettings";

export interface ComposerEditorHandle {
  focus: () => void;
  setSelectionRange: (start: number, end: number) => void;
  insertText: (text: string) => void;
  syncValue: (nextValue: string, selection?: TextRange) => void;
  getSelectionRange: () => TextRange;
  getElement: () => HTMLDivElement | null;
}

interface TextRange {
  start: number;
  end: number;
}

interface SlashMenuState {
  query: string;
  start: number;
  end: number;
  top: number;
  left: number;
  maxHeight: number;
}

interface HistoryEntry {
  value: string;
  selection: TextRange;
}

interface CommandHint {
  command: string;
  description: string;
}

interface ComposerEditorProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>, selection: TextRange) => void;
  onPaste?: (event: ClipboardEvent<HTMLDivElement>) => void;
  onFocus?: () => void;
  readOnly?: boolean;
  placeholder?: string;
  placeholderContent?: ReactNode;
  className?: string;
  containerClassName?: string;
  style?: CSSProperties;
  projectDirectory?: string;
  commands?: PromptCommandOption[];
}

function tokenLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent?.length || 0;
  if (!(node instanceof HTMLElement)) return 0;
  if (node.dataset.composerRaw) return node.dataset.composerRaw.length;
  if (node.tagName === "BR") return 1;
  let total = 0;
  node.childNodes.forEach((child) => { total += tokenLength(child); });
  return total;
}

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
  if (!(node instanceof HTMLElement)) return "";
  if (node.dataset.composerRaw) return node.dataset.composerRaw;
  if (node.tagName === "BR") return "\n";
  let value = "";
  node.childNodes.forEach((child) => { value += serializeNode(child); });
  return value;
}

function serializeRoot(root: HTMLElement): string {
  let value = "";
  root.childNodes.forEach((child) => { value += serializeNode(child); });
  return value.replace(/\u00a0/g, " ");
}

function isBlankComposerValue(value: string): boolean {
  return value.replace(/\u00a0/g, " ").replace(/\r?\n/g, "").length === 0;
}

function normalizeBlankComposerValue(value: string): string {
  const normalizedValue = value.replace(/\u00a0/g, " ");
  return isBlankComposerValue(normalizedValue) ? "" : normalizedValue;
}

function offsetFromPosition(root: HTMLElement, container: Node, offset: number): number {
  let current = 0;
  let found: number | null = null;

  function visit(node: Node): boolean {
    if (node === container) {
      if (node.nodeType === Node.TEXT_NODE) {
        found = current + offset;
        return true;
      }
      let childOffset = 0;
      const children = Array.from(node.childNodes);
      for (let index = 0; index < Math.min(offset, children.length); index += 1) {
        childOffset += tokenLength(children[index]);
      }
      found = current + childOffset;
      return true;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      current += node.textContent?.length || 0;
      return false;
    }
    if (!(node instanceof HTMLElement)) return false;
    if (node.dataset.composerRaw) {
      if (node.contains(container)) {
        found = current + (offset > 0 ? node.dataset.composerRaw.length : 0);
        return true;
      }
      current += node.dataset.composerRaw.length;
      return false;
    }
    if (node.tagName === "BR") {
      current += 1;
      return false;
    }
    for (const child of Array.from(node.childNodes)) {
      if (visit(child)) return true;
    }
    return false;
  }

  visit(root);
  return found ?? current;
}

function getSelectionRange(root: HTMLElement): TextRange {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return { start: 0, end: 0 };
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return { start: 0, end: 0 };
  const start = offsetFromPosition(root, range.startContainer, range.startOffset);
  const end = offsetFromPosition(root, range.endContainer, range.endOffset);
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

function positionFromOffset(root: HTMLElement, offset: number): { node: Node; offset: number } {
  let remaining = Math.max(0, offset);

  function find(node: Node): { node: Node; offset: number } | null {
    if (node.nodeType === Node.TEXT_NODE) {
      const length = node.textContent?.length || 0;
      if (remaining <= length) return { node, offset: remaining };
      remaining -= length;
      return null;
    }
    if (!(node instanceof HTMLElement)) return null;
    if (node.dataset.composerRaw) {
      const length = node.dataset.composerRaw.length;
      if (remaining <= length) {
        const parent = node.parentNode || root;
        const siblings = Array.from(parent.childNodes);
        const index = siblings.indexOf(node);
        return { node: parent, offset: index + (remaining > length / 2 ? 1 : 0) };
      }
      remaining -= length;
      return null;
    }
    const children = Array.from(node.childNodes);
    for (const child of children) {
      const found = find(child);
      if (found) return found;
    }
    return null;
  }

  return find(root) || { node: root, offset: root.childNodes.length };
}

function restoreSelection(root: HTMLElement, range: TextRange) {
  const selection = window.getSelection();
  if (!selection) return;
  const start = positionFromOffset(root, range.start);
  const end = positionFromOffset(root, range.end);
  const nextRange = document.createRange();
  nextRange.setStart(start.node, start.offset);
  nextRange.setEnd(end.node, end.offset);
  selection.removeAllRanges();
  selection.addRange(nextRange);
}

function clampTextRange(range: TextRange, length: number): TextRange {
  const start = Math.max(0, Math.min(range.start, length));
  const end = Math.max(start, Math.min(range.end, length));
  return { start, end };
}

function rectFromOffsets(root: HTMLElement, start: number, end: number): DOMRect | null {
  const safeEnd = Math.max(end, start + 1);
  const startPosition = positionFromOffset(root, start);
  const endPosition = positionFromOffset(root, safeEnd);
  const range = document.createRange();
  try {
    range.setStart(startPosition.node, startPosition.offset);
    range.setEnd(endPosition.node, endPosition.offset);
    const rect = range.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0 ? rect : null;
  } catch {
    return null;
  }
}

function displayResourceLabel(label: string): string {
  const normalized = label.replace(/\\/g, "/").replace(/\/+$/g, "");
  return normalized.split("/").filter(Boolean).pop() || label;
}

function appendTokenLabel(chip: HTMLElement, label: string) {
  const labelNode = document.createElement("span");
  labelNode.textContent = label;
  chip.appendChild(labelNode);
}

function createTokenChip(className: string, tokenType: string, raw: string, title?: string): HTMLSpanElement {
  const chip = document.createElement("span");
  chip.contentEditable = "false";
  chip.dataset.composerToken = tokenType;
  chip.dataset.composerRaw = raw;
  chip.className = className;
  if (title) chip.title = title;
  return chip;
}

function createChipIcon(kind: "file" | "folder" | "terminal"): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "11");
  svg.setAttribute("height", "11");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.classList.add("composer-token-chip-svg");
  if (kind === "folder") {
    svg.innerHTML = '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />';
  } else if (kind === "terminal") {
    svg.innerHTML = '<polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />';
  } else {
    svg.innerHTML = '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />';
  }
  return svg;
}

function createResourceChipIcon(token: Extract<ReturnType<typeof parseComposerTextTokens>[number], { type: "resourceLink" }>, resourceIconTheme: ResourceIconTheme, catppuccinFlavor: CatppuccinIconFlavor): Element {
  if (resourceIconTheme === "catppuccin") {
    const image = document.createElement("img");
    image.src = resolveCatppuccinResourceIcon({ name: token.label, relativePath: token.href, kind: token.kind }, false, catppuccinFlavor);
    image.alt = "";
    image.draggable = false;
    image.className = "composer-token-chip-svg composer-token-chip-img";
    image.setAttribute("aria-hidden", "true");
    return image;
  }
  return createChipIcon(token.kind === "folder" ? "folder" : "file");
}

function renderComposerDom(root: HTMLElement, tokens: ReturnType<typeof parseComposerTextTokens>, resourceIconTheme: ResourceIconTheme, catppuccinFlavor: CatppuccinIconFlavor) {
  const fragment = document.createDocumentFragment();
  for (const token of tokens) {
    if (token.type === "resourceLink") {
      const chip = createTokenChip("composer-token-chip composer-token-chip-resource", "resourceLink", token.raw, token.href);
      chip.appendChild(createResourceChipIcon(token, resourceIconTheme, catppuccinFlavor));
      appendTokenLabel(chip, displayResourceLabel(token.label));
      fragment.appendChild(chip);
    } else if (token.type === "slashCommand" && token.matched) {
      const chip = createTokenChip("composer-token-chip composer-token-chip-command", "slashCommand", token.raw, `/${token.command}`);
      chip.appendChild(createChipIcon("terminal"));
      appendTokenLabel(chip, token.command);
      fragment.appendChild(chip);
    } else if (token.type === "color") {
      const chip = createTokenChip("composer-token-chip composer-token-chip-color", "color", token.value, token.value);
      const swatch = document.createElement("span");
      swatch.className = "composer-token-chip-swatch";
      swatch.style.background = token.value;
      chip.appendChild(swatch);
      appendTokenLabel(chip, token.value);
      fragment.appendChild(chip);
    } else {
      fragment.appendChild(document.createTextNode(token.type === "slashCommand" ? token.raw : token.value));
    }
  }
  root.replaceChildren(fragment);
}

function commandHintForValue(value: string, commands: PromptCommandOption[]): CommandHint | null {
  const match = /^\/([\p{L}\p{N}_-]+)\s*$/u.exec(value);
  if (!match) return null;
  const commandId = match[1]?.toLowerCase();
  if (!commandId) return null;
  const command = commands.find((candidate) => candidate.id.toLowerCase() === commandId);
  if (!command) return null;
  const description = command.description.trim();
  return description ? { command: command.id.toLowerCase(), description } : null;
}

function slashTrigger(value: string, caret: number): { query: string; start: number; end: number } | null {
  const before = value.slice(0, caret);
  const match = /(^|[\s([{])\/([\p{L}\p{N}_-]*)$/u.exec(before);
  if (!match) return null;
  const prefix = match[1] || "";
  const query = match[2] || "";
  return { query, start: before.length - query.length - 1, end: before.length + prefix.length - prefix.length };
}

function commandMatchRank(command: PromptCommandOption, query: string, settings: ComposerSettings): number | null {
  if (!query) return 0;
  const normalized = query.toLowerCase();
  const id = command.id.toLowerCase();
  const name = command.name.toLowerCase();
  const description = command.description.toLowerCase();
  if (id.startsWith(normalized) || name.startsWith(normalized)) return 1;
  if (id.includes(normalized) || name.includes(normalized)) return 2;
  if (settings.commandSearchIncludesDescription && description.includes(normalized)) return 3;
  return null;
}

function highlightedCommandLabel(label: string, query: string) {
  if (!query) return label;
  const normalizedLabel = label.toLowerCase();
  const normalizedQuery = query.toLowerCase();
  const start = normalizedLabel.indexOf(normalizedQuery);
  if (start < 0) return label;
  const end = start + query.length;
  return (
    <>
      {label.slice(0, start)}
      <span className="composer-slash-match">{label.slice(start, end)}</span>
      {label.slice(end)}
    </>
  );
}

function shouldHidePlaceholderForKey(event: KeyboardEvent<HTMLDivElement>): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  if (event.key === "Process") return true;
  return event.key.length === 1;
}

export const ComposerEditor = forwardRef<ComposerEditorHandle, ComposerEditorProps>(function ComposerEditor({
  value,
  onChange,
  onKeyDown,
  onPaste,
  onFocus,
  readOnly,
  placeholder,
  placeholderContent,
  className,
  containerClassName,
  style,
  projectDirectory,
  commands = [],
}, forwardedRef) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const normalizedValue = normalizeBlankComposerValue(value);
  const valueRef = useRef(normalizedValue);
  const composingRef = useRef(false);
  const pendingSelectionRef = useRef<TextRange | null>(null);
  const suppressSlashMenuRef = useRef<{ value: string; minCaret: number; maxCaret: number } | null>(null);
  const historyRef = useRef<HistoryEntry[]>([{ value: normalizedValue, selection: { start: normalizedValue.length, end: normalizedValue.length } }]);
  const historyIndexRef = useRef(0);
  const lastHistoryValueRef = useRef(normalizedValue);
  const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null);
  const [activeCommandIndex, setActiveCommandIndex] = useState(0);
  const [isComposing, setIsComposing] = useState(false);
  const [isTransientInputActive, setIsTransientInputActive] = useState(false);
  const [composerSettings, setComposerSettings] = useState<ComposerSettings>(getComposerSettings);
  const resourceIconTheme = useFeedbackStore((state) => state.resourceIconTheme);
  const catppuccinFlavor: CatppuccinIconFlavor = useIsLightTheme() ? "latte" : "mocha";
  valueRef.current = normalizedValue;

  const setHintSuppressed = useCallback((value: boolean) => {
    const container = containerRef.current;
    if (container) {
      if (value) container.dataset.hintSuppressed = "true";
      else delete container.dataset.hintSuppressed;
    }
    setIsTransientInputActive(value);
  }, []);

  const showPlaceholder = (placeholderContent !== undefined || !!placeholder) && isBlankComposerValue(normalizedValue) && !isComposing && !isTransientInputActive;
  const commandHint = useMemo(
    () => isComposing || isTransientInputActive ? null : commandHintForValue(normalizedValue, commands),
    [commands, isComposing, isTransientInputActive, normalizedValue],
  );

  const commandSet = useMemo(() => new Set(commands.map((command) => command.id)), [commands]);
  const tokens = useMemo(
    () => parseComposerTextTokens(normalizedValue, { knownCommands: commandSet, projectDirectory }),
    [commandSet, normalizedValue, projectDirectory],
  );
  const visibleCommands = useMemo(() => {
    if (!slashMenu) return [];
    return commands
      .map((command, index) => ({ command, index, rank: commandMatchRank(command, slashMenu.query, composerSettings) }))
      .filter((item): item is { command: PromptCommandOption; index: number; rank: number } => item.rank !== null)
      .sort((left, right) => left.rank - right.rank || left.index - right.index)
      .map((item) => item.command)
      .slice(0, 8);
  }, [commands, composerSettings, slashMenu]);

  useEffect(() => {
    if (normalizedValue === lastHistoryValueRef.current) return;
    historyRef.current = [{ value: normalizedValue, selection: { start: normalizedValue.length, end: normalizedValue.length } }];
    historyIndexRef.current = 0;
    lastHistoryValueRef.current = normalizedValue;
  }, [normalizedValue]);

  useEffect(() => {
    const handleSettingsChanged = (event: Event) => {
      const detail = (event as CustomEvent<ComposerSettings>).detail;
      setComposerSettings(detail || getComposerSettings());
    };
    window.addEventListener(COMPOSER_SETTINGS_EVENT, handleSettingsChanged);
    return () => window.removeEventListener(COMPOSER_SETTINGS_EVENT, handleSettingsChanged);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const suppressForKeyboardInput = (event: globalThis.KeyboardEvent) => {
      if (readOnly) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "Process" || event.key.length === 1) setHintSuppressed(true);
    };
    const suppressForBeforeInput = (event: Event) => {
      if (readOnly) return;
      const inputEvent = event as InputEvent;
      if (inputEvent.isComposing || inputEvent.inputType === "insertCompositionText" || inputEvent.inputType === "insertText") {
        setHintSuppressed(true);
      }
    };
    const suppressForComposition = () => {
      if (!readOnly) setHintSuppressed(true);
    };

    root.addEventListener("keydown", suppressForKeyboardInput, true);
    root.addEventListener("beforeinput", suppressForBeforeInput, true);
    root.addEventListener("compositionstart", suppressForComposition, true);
    root.addEventListener("compositionupdate", suppressForComposition, true);
    return () => {
      root.removeEventListener("keydown", suppressForKeyboardInput, true);
      root.removeEventListener("beforeinput", suppressForBeforeInput, true);
      root.removeEventListener("compositionstart", suppressForComposition, true);
      root.removeEventListener("compositionupdate", suppressForComposition, true);
    };
  }, [readOnly, setHintSuppressed]);

  const pushHistoryEntry = useCallback((nextValue: string, selection: TextRange) => {
    const current = historyRef.current[historyIndexRef.current];
    if (current?.value === nextValue) {
      historyRef.current[historyIndexRef.current] = { value: nextValue, selection };
      return;
    }
    const nextHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    nextHistory.push({ value: nextValue, selection });
    if (nextHistory.length > 120) nextHistory.shift();
    historyRef.current = nextHistory;
    historyIndexRef.current = nextHistory.length - 1;
    lastHistoryValueRef.current = nextValue;
  }, []);

  const commitValue = useCallback((nextValue: string, selection?: TextRange, recordHistory = true) => {
    const normalizedNextValue = normalizeBlankComposerValue(nextValue);
    const normalizedSelection = selection ? clampTextRange(selection, normalizedNextValue.length) : undefined;
    if (normalizedSelection) pendingSelectionRef.current = normalizedSelection;
    const previousValue = valueRef.current;
    valueRef.current = normalizedNextValue;
    lastHistoryValueRef.current = normalizedNextValue;
    if (!composingRef.current) setHintSuppressed(false);
    if (recordHistory && normalizedSelection) pushHistoryEntry(normalizedNextValue, normalizedSelection);
    if (normalizedNextValue !== previousValue) onChange(normalizedNextValue);
  }, [onChange, pushHistoryEntry, setHintSuppressed]);

  const updateSlashMenu = useCallback(() => {
    const root = rootRef.current;
    if (!root || readOnly) {
      setSlashMenu(null);
      return;
    }
    const selection = getSelectionRange(root);
    if (selection.start !== selection.end) {
      setSlashMenu(null);
      return;
    }
    const currentValue = serializeRoot(root);
    const suppression = suppressSlashMenuRef.current;
    if (suppression) {
      if (suppression.value === currentValue && selection.start >= suppression.minCaret && selection.start <= suppression.maxCaret) {
        setSlashMenu(null);
        return;
      }
      if (suppression.value !== currentValue || selection.start > suppression.maxCaret) suppressSlashMenuRef.current = null;
    }
    const trigger = slashTrigger(currentValue, selection.start);
    if (!trigger) {
      setSlashMenu(null);
      return;
    }
    const windowSelection = window.getSelection();
    const range = windowSelection?.rangeCount ? windowSelection.getRangeAt(0) : null;
    const triggerRect = rectFromOffsets(root, trigger.start, trigger.end);
    const caretRect = range?.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    const anchorRect = triggerRect || (caretRect && (caretRect.width > 0 || caretRect.height > 0) ? caretRect : null) || rootRect;
    const anchorTop = anchorRect.top;
    setSlashMenu({
      query: trigger.query,
      start: trigger.start,
      end: selection.end,
      top: anchorTop - 6,
      left: Math.max(8, Math.min(anchorRect.left, window.innerWidth - 328)),
      maxHeight: Math.max(120, Math.min(240, anchorTop - 16)),
    });
    setActiveCommandIndex(0);
  }, [readOnly]);

  const replaceRange = useCallback((start: number, end: number, text: string, options: { updateSlashMenu?: boolean } = {}) => {
    const root = rootRef.current;
    const currentSelection = root ? getSelectionRange(root) : { start, end };
    const safeStart = Math.max(0, Math.min(start, valueRef.current.length));
    const safeEnd = Math.max(safeStart, Math.min(end, valueRef.current.length));
    const nextValue = valueRef.current.slice(0, safeStart) + text + valueRef.current.slice(safeEnd);
    const normalizedNextValue = normalizeBlankComposerValue(nextValue);
    const nextCaret = normalizedNextValue.length === 0 ? 0 : safeStart + text.length;
    commitValue(normalizedNextValue, { start: nextCaret, end: nextCaret });
    if (root) {
      renderComposerDom(root, parseComposerTextTokens(normalizedNextValue, { knownCommands: commandSet, projectDirectory }), resourceIconTheme, catppuccinFlavor);
      restoreSelection(root, { start: nextCaret, end: nextCaret });
    }
    if (options.updateSlashMenu !== false && root && currentSelection.start === currentSelection.end) requestAnimationFrame(updateSlashMenu);
  }, [catppuccinFlavor, commandSet, commitValue, projectDirectory, resourceIconTheme, updateSlashMenu]);

  const applyHistory = useCallback((direction: -1 | 1) => {
    const nextIndex = historyIndexRef.current + direction;
    const entry = historyRef.current[nextIndex];
    if (!entry) return false;
    historyIndexRef.current = nextIndex;
    commitValue(entry.value, entry.selection, false);
    const root = rootRef.current;
    if (root) {
      renderComposerDom(root, parseComposerTextTokens(entry.value, { knownCommands: commandSet, projectDirectory }), resourceIconTheme, catppuccinFlavor);
      restoreSelection(root, entry.selection);
    }
    requestAnimationFrame(updateSlashMenu);
    return true;
  }, [catppuccinFlavor, commandSet, commitValue, projectDirectory, resourceIconTheme, updateSlashMenu]);

  const insertText = useCallback((text: string) => {
    const root = rootRef.current;
    const selection = root ? getSelectionRange(root) : { start: valueRef.current.length, end: valueRef.current.length };
    replaceRange(selection.start, selection.end, text);
  }, [replaceRange]);

  const selectCommand = useCallback((command: PromptCommandOption) => {
    if (!slashMenu) return;
    const commandText = `/${command.id.trim()} `;
    const suffix = valueRef.current.slice(slashMenu.end);
    const whitespaceAfterCommand = /^\s+/.exec(suffix)?.[0].length || 0;
    const nextValue = valueRef.current.slice(0, slashMenu.start) + commandText + valueRef.current.slice(slashMenu.end + whitespaceAfterCommand);
    const nextCaret = slashMenu.start + commandText.length;
    suppressSlashMenuRef.current = {
      value: nextValue,
      minCaret: slashMenu.start + commandText.trimEnd().length,
      maxCaret: nextCaret,
    };
    replaceRange(slashMenu.start, slashMenu.end + whitespaceAfterCommand, commandText, { updateSlashMenu: false });
    setSlashMenu(null);
    setActiveCommandIndex(0);
  }, [replaceRange, slashMenu]);

  const selectionAroundToken = useCallback((selection: TextRange, direction: "backward" | "forward"): TextRange | null => {
    if (selection.start !== selection.end) return null;
    const token = tokens.find((candidate) => {
      if (candidate.type !== "resourceLink" && candidate.type !== "slashCommand" && candidate.type !== "color") return false;
      return direction === "backward" ? candidate.end === selection.start : candidate.start === selection.start;
    });
    return token ? { start: token.start, end: token.end } : null;
  }, [tokens]);

  const handleBeforeInput = useCallback((event: FormEvent<HTMLDivElement>) => {
    const nativeEvent = event.nativeEvent as InputEvent;
    if (nativeEvent.isComposing || nativeEvent.inputType === "insertCompositionText") {
      composingRef.current = true;
      setIsComposing(true);
      setHintSuppressed(true);
      setSlashMenu(null);
      return;
    }
    if (readOnly || composingRef.current) return;
    const root = rootRef.current;
    if (!root) return;
    const selection = getSelectionRange(root);

    if (nativeEvent.inputType === "historyUndo" || nativeEvent.inputType === "historyRedo") {
      event.preventDefault();
      applyHistory(nativeEvent.inputType === "historyUndo" ? -1 : 1);
      return;
    }

    if (nativeEvent.inputType === "insertText" || nativeEvent.inputType === "insertCompositionText") {
      if (!nativeEvent.data) return;
      event.preventDefault();
      replaceRange(selection.start, selection.end, nativeEvent.data);
      return;
    }

    if (nativeEvent.inputType === "insertParagraph" || nativeEvent.inputType === "insertLineBreak") {
      event.preventDefault();
      replaceRange(selection.start, selection.end, "\n");
      return;
    }

    if (nativeEvent.inputType === "deleteContentBackward" || nativeEvent.inputType === "deleteWordBackward") {
      event.preventDefault();
      const tokenSelection = selectionAroundToken(selection, "backward");
      if (tokenSelection) {
        replaceRange(tokenSelection.start, tokenSelection.end, "");
        return;
      }
      if (selection.start !== selection.end) {
        replaceRange(selection.start, selection.end, "");
        return;
      }
      if (selection.start > 0) replaceRange(selection.start - 1, selection.start, "");
      return;
    }

    if (nativeEvent.inputType === "deleteContentForward" || nativeEvent.inputType === "deleteWordForward") {
      event.preventDefault();
      const tokenSelection = selectionAroundToken(selection, "forward");
      if (tokenSelection) {
        replaceRange(tokenSelection.start, tokenSelection.end, "");
        return;
      }
      if (selection.start !== selection.end) {
        replaceRange(selection.start, selection.end, "");
        return;
      }
      if (selection.start < valueRef.current.length) replaceRange(selection.start, selection.start + 1, "");
    }
  }, [applyHistory, readOnly, replaceRange, selectionAroundToken, setHintSuppressed]);

  useImperativeHandle(forwardedRef, () => ({
    focus: () => rootRef.current?.focus(),
    setSelectionRange: (start, end) => {
      pendingSelectionRef.current = { start, end };
      requestAnimationFrame(() => {
        const root = rootRef.current;
        if (!root) return;
        if (document.activeElement !== root) root.focus();
        restoreSelection(root, { start, end });
      });
    },
    insertText,
    syncValue: (nextValue, selection = { start: nextValue.length, end: nextValue.length }) => {
      const normalizedNextValue = normalizeBlankComposerValue(nextValue);
      const normalizedSelection = clampTextRange(selection, normalizedNextValue.length);
      valueRef.current = normalizedNextValue;
      lastHistoryValueRef.current = normalizedNextValue;
      pendingSelectionRef.current = normalizedSelection;
      const root = rootRef.current;
      if (!root) return;
      renderComposerDom(root, parseComposerTextTokens(normalizedNextValue, { knownCommands: commandSet, projectDirectory }), resourceIconTheme, catppuccinFlavor);
      if (document.activeElement !== root) root.focus();
      restoreSelection(root, normalizedSelection);
      requestAnimationFrame(updateSlashMenu);
    },
    getSelectionRange: () => rootRef.current ? getSelectionRange(rootRef.current) : { start: 0, end: 0 },
    getElement: () => rootRef.current,
  }), [catppuccinFlavor, commandSet, insertText, projectDirectory, resourceIconTheme, updateSlashMenu]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const activeSelection = document.activeElement === root ? getSelectionRange(root) : null;
    renderComposerDom(root, tokens, resourceIconTheme, catppuccinFlavor);
    const pending = pendingSelectionRef.current;
    pendingSelectionRef.current = null;
    const nextSelection = pending || activeSelection;
    if (!nextSelection) return;
    if (document.activeElement !== root) root.focus();
    restoreSelection(root, clampTextRange(nextSelection, normalizedValue.length));
  }, [catppuccinFlavor, normalizedValue.length, resourceIconTheme, tokens]);

  const handleInput = useCallback(() => {
    const root = rootRef.current;
    if (!root || composingRef.current) return;
    const selection = getSelectionRange(root);
    commitValue(serializeRoot(root), selection);
    setHintSuppressed(false);
    requestAnimationFrame(updateSlashMenu);
  }, [commitValue, setHintSuppressed, updateSlashMenu]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    const selection = root ? getSelectionRange(root) : { start: 0, end: 0 };
    if (!readOnly && shouldHidePlaceholderForKey(event)) {
      setHintSuppressed(true);
    }

    if (!readOnly && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      applyHistory(event.shiftKey ? 1 : -1);
      return;
    }

    if (!readOnly && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
      event.preventDefault();
      applyHistory(1);
      return;
    }

    if (slashMenu && visibleCommands.length > 0) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        setActiveCommandIndex((current) => {
          const delta = event.key === "ArrowDown" ? 1 : -1;
          return (current + delta + visibleCommands.length) % visibleCommands.length;
        });
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        selectCommand(visibleCommands[activeCommandIndex] || visibleCommands[0]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setSlashMenu(null);
        return;
      }
    }

    onKeyDown?.(event, selection);
  }, [activeCommandIndex, applyHistory, onKeyDown, readOnly, selectCommand, setHintSuppressed, slashMenu, visibleCommands]);

  const handleKeyUp = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (slashMenu && ["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    requestAnimationFrame(updateSlashMenu);
  }, [slashMenu, updateSlashMenu]);

  const handlePaste = useCallback((event: ClipboardEvent<HTMLDivElement>) => {
    onPaste?.(event);
    if (event.defaultPrevented) return;
    const text = event.clipboardData.getData("text/plain");
    if (!text) return;
    event.preventDefault();
    insertText(text);
  }, [insertText, onPaste]);

  return (
    <div ref={containerRef} className={`composer-editor-root${containerClassName ? ` ${containerClassName}` : ""}`} data-hint-suppressed={isTransientInputActive ? "true" : undefined} style={{ minHeight: style?.minHeight, height: style?.height }}>
      {showPlaceholder || commandHint ? (
        <div className="composer-editor-hint-layer" aria-hidden="true">
          {showPlaceholder ? <div className="composer-editor-placeholder">{placeholderContent ?? placeholder}</div> : null}
          {!showPlaceholder && commandHint ? <div className="composer-command-hint">{commandHint.description}</div> : null}
        </div>
      ) : null}
      <div
        ref={rootRef}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-readonly={readOnly || undefined}
        data-composer-input="true"
        data-empty={isBlankComposerValue(normalizedValue) ? "true" : undefined}
        className={`composer-editor ${className || ""}`.trim()}
        style={style}
        onKeyDownCapture={(event) => {
          if (!readOnly && shouldHidePlaceholderForKey(event)) setHintSuppressed(true);
        }}
        onBeforeInputCapture={(event) => {
          if (readOnly) return;
          const nativeEvent = event.nativeEvent as InputEvent;
          if (nativeEvent.isComposing || nativeEvent.inputType === "insertCompositionText" || nativeEvent.inputType === "insertText") {
            setHintSuppressed(true);
          }
        }}
        onCompositionStartCapture={() => {
          if (!readOnly) setHintSuppressed(true);
        }}
        onCompositionUpdateCapture={() => {
          if (!readOnly) setHintSuppressed(true);
        }}
        onBeforeInput={handleBeforeInput}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onFocus={() => {
          onFocus?.();
          requestAnimationFrame(updateSlashMenu);
        }}
        onClick={() => requestAnimationFrame(updateSlashMenu)}
        onKeyUp={handleKeyUp}
        onCompositionStart={() => {
          composingRef.current = true;
          setIsComposing(true);
          setHintSuppressed(true);
          setSlashMenu(null);
        }}
        onCompositionUpdate={() => {
          composingRef.current = true;
          setIsComposing(true);
          setHintSuppressed(true);
          setSlashMenu(null);
        }}
        onCompositionEnd={() => {
          composingRef.current = false;
          setIsComposing(false);
          setHintSuppressed(false);
          handleInput();
        }}
      />
      {slashMenu && visibleCommands.length > 0 ? (
        <div className="composer-slash-menu" style={{ top: slashMenu.top, left: slashMenu.left, maxHeight: slashMenu.maxHeight }}>
          {visibleCommands.map((command, index) => (
            (() => {
              const label = command.name || `/${command.id}`;
              return (
            <button
              key={command.id}
              type="button"
              className={`composer-slash-item${index === activeCommandIndex ? " active" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectCommand(command)}
            >
              <span className="composer-slash-icon">{command.icon ? <PromptIcon name={command.icon} size={13} /> : <Icon name="terminal" size={13} />}</span>
              <span className="composer-slash-main">
                <span className="composer-slash-name" title={label}>{highlightedCommandLabel(label, slashMenu.query)}</span>
                {command.description ? <span className="composer-slash-description">{command.description}</span> : null}
              </span>
            </button>
              );
            })()
          ))}
        </div>
      ) : null}
    </div>
  );
});
