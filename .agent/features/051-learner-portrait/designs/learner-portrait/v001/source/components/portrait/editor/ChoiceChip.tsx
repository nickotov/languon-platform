import React from 'react';
import { CheckIcon, PlusIcon } from 'lucide-react';

interface ChoiceChipProps {
  label: string;
  selected: boolean;
  onToggle: () => void;
  disabled?: boolean;
  /** 'checkbox' for multi-select groups, 'radio' for single choice. */
  role?: 'checkbox' | 'radio';
}

export function ChoiceChip({ label, selected, onToggle, disabled, role = 'checkbox' }: ChoiceChipProps) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={selected}
      disabled={disabled}
      onClick={onToggle}
      className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background-surface disabled:cursor-not-allowed disabled:opacity-50 ${
        selected
          ? 'border-primary-default bg-primary-subtle text-primary-default'
          : 'border-border-default bg-background-surface text-text-primary hover:border-border-strong hover:bg-background-subtle'
      }`}
    >
      {selected ? (
        <CheckIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
      ) : (
        <PlusIcon className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
      )}
      <span className="text-left">{label}</span>
    </button>
  );
}

interface ChipGroupProps {
  legend: string;
  description?: string;
  children: React.ReactNode;
  error?: string;
  hideLegend?: boolean;
  role?: 'group' | 'radiogroup';
}

export function ChipGroup({ legend, description, children, error, hideLegend, role = 'group' }: ChipGroupProps) {
  const id = React.useId();
  return (
    <div role={role} aria-labelledby={`${id}-l`} aria-describedby={description || error ? `${id}-d` : undefined}>
      <p id={`${id}-l`} className={hideLegend ? 'sr-only' : 'mb-1 text-sm font-medium text-text-primary'}>
        {legend}
      </p>
      {(description || error) && (
        <p id={`${id}-d`} className={`mb-2 text-sm ${error ? 'text-danger-default' : 'text-text-secondary'}`} role={error ? 'alert' : undefined}>
          {error ?? description}
        </p>
      )}
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

