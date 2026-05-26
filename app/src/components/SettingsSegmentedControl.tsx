import type { ReactNode } from "react";

export type SettingsSegmentedVariant = "default" | "allow" | "override" | "ask" | "deny" | "danger";

export interface SettingsSegmentedOption {
  id: string;
  label: string;
  icon?: ReactNode;
  variant?: SettingsSegmentedVariant;
  ariaLabel?: string;
  disabled?: boolean;
}

interface SettingsSegmentedControlProps {
  options: SettingsSegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
}

export function SettingsSegmentedControl({ options, value, onChange, ariaLabel, className = "", disabled = false }: SettingsSegmentedControlProps) {
  return (
    <div className={`settings-segmented-control${className ? ` ${className}` : ""}`} role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const active = value === option.id;
        const optionDisabled = disabled || option.disabled;
        return (
          <button
            key={option.id}
            type="button"
            className={`settings-segmented-option settings-segmented-option-${option.variant || "default"}${active ? " active" : ""}`}
            onClick={() => onChange(option.id)}
            disabled={optionDisabled}
            aria-pressed={active}
            aria-label={option.ariaLabel || option.label}
          >
            {option.icon}
            <span className="settings-segmented-label">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}