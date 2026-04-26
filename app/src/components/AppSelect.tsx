import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icons";

export interface AppSelectOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  icon?: string;
}

interface AppSelectProps<T extends string> {
  value: T;
  options: ReadonlyArray<AppSelectOption<T>>;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  tooltip?: string | null;
}

export function AppSelect<T extends string>({ value, options, onChange, ariaLabel, className, tooltip }: AppSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) || options[0];

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className={`app-select${className ? ` ${className}` : ""}`} ref={ref}>
      <button
        type="button"
        className={`app-select-trigger${open ? " open" : ""}`}
        onClick={() => setOpen((current) => !current)}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-tooltip={tooltip || undefined}
      >
        <span className="app-select-value">
          {selected?.icon ? <Icon name={selected.icon} size={12} /> : null}
          {selected?.label ?? "-"}
        </span>
        <Icon name="chevron-down" size={9} className="app-disclosure-icon" />
      </button>
      {open ? (
        <div className="app-select-panel" role="listbox" aria-label={ariaLabel}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`app-select-option${option.value === value ? " selected" : ""}`}
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.icon ? <Icon name={option.icon} size={13} /> : null}
              <span className="app-select-option-text">
                <span className="app-select-option-label">{option.label}</span>
                {option.description ? <span className="app-select-option-desc">{option.description}</span> : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}