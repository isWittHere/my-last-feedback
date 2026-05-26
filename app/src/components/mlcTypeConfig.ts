export const MLC_TYPE_TABS = [
  { value: "all", label: "All" },
  { value: "coding", label: "Coding", icon: "code", color: "#4fc3f7", lightColor: "#0079dc" },
  { value: "debug", label: "Debug", icon: "bug", color: "#ef5350", lightColor: "#d32f2f" },
  { value: "planning", label: "Planning", icon: "checklist", color: "#66bb6a", lightColor: "#009207" },
  { value: "spec", label: "Spec", icon: "file-text", color: "#ab47bc", lightColor: "#8e24aa" },
  { value: "knowledge", label: "Knowledge", icon: "book", color: "#e48900", lightColor: "#d77600" },
];

export function getMlcTypeConfig(type: string) {
  return MLC_TYPE_TABS.find((tab) => tab.value === type);
}

export function getMlcTypeColor(type: string, isLightTheme: boolean): string | undefined {
  const config = getMlcTypeConfig(type);
  return isLightTheme ? config?.lightColor : config?.color;
}

export function getMlcTypeLabel(type: string): string {
  return getMlcTypeConfig(type)?.label || type || "General";
}
