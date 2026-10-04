import React from 'react';
import { BanIcon, CheckCircle2Icon } from 'lucide-react';
import { Badge } from '../Badge';
import type { ModelTaskSupport } from '../../types/modelPreference';
export type OptionAvailability = 'available' | 'unavailable' | 'unknown';
interface ModelOptionCardProps {
  groupName: string;
  value: string;
  title: string;
  provider?: string | null;
  description?: React.ReactNode;
  /** Secondary context line, e.g. what Auto currently resolves to. */
  context?: React.ReactNode;
  tasks?: ModelTaskSupport;
  availability: OptionAvailability;
  reason?: string;
  checked: boolean;
  /** Marks the saved option while a different draft is selected. */
  isSaved: boolean;
  disabled?: boolean;
  onSelect: (value: string) => void;
}
const TASK_LABELS: {
  key: keyof ModelTaskSupport;
  label: string;
}[] = [{
  key: 'dictionary',
  label: 'Dictionary'
}, {
  key: 'sentences',
  label: 'Sentences'
}, {
  key: 'translationCheck',
  label: 'Translation checks'
}];
export function ModelOptionCard({
  groupName,
  value,
  title,
  provider,
  description,
  context,
  tasks,
  availability,
  reason,
  checked,
  isSaved,
  disabled = false,
  onSelect
}: ModelOptionCardProps) {
  const inputId = `${groupName}-${value}`;
  const detailId = `${inputId}-detail`;
  const unavailable = availability === 'unavailable';
  const notFor = tasks ? TASK_LABELS.filter(task => !tasks[task.key]).map(task => task.label) : [];
  const worksFor = tasks ? TASK_LABELS.filter(task => tasks[task.key]).map(task => task.label) : [];
  const surface = checked ? unavailable ? 'border-warning-default bg-warning-subtle' : 'border-primary-default bg-primary-subtle' : unavailable ? 'border-border-default border-dashed bg-background-subtle' : 'border-border-default bg-background-surface hover:border-border-strong';
  return <label htmlFor={inputId} className={`radius-md min-h-touch flex items-start gap-3 border p-4 transition-colors duration-150 focus-within:ring-2 focus-within:ring-border-focus focus-within:ring-offset-2 focus-within:ring-offset-background-surface ${surface} ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
      <input id={inputId} type="radio" name={groupName} value={value} checked={checked} disabled={disabled} onChange={() => onSelect(value)} aria-describedby={detailId} className={`mt-0.5 h-5 w-5 shrink-0 accent-primary-default focus:outline-none ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`} />
      <span className="min-w-0 flex-1 text-start">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={`break-words text-sm font-semibold ${unavailable ? 'text-text-secondary' : 'text-text-primary'}`}>
            {title}
          </span>
          {checked && !unavailable ? <Badge tone="info" size="sm" icon={<CheckCircle2Icon aria-hidden="true" className="h-3 w-3" />}>
              Selected
            </Badge> : null}
          {isSaved ? <Badge tone="neutral" size="sm">
              Saved
            </Badge> : null}
          {unavailable ? <Badge tone="warning" size="sm" icon={<BanIcon aria-hidden="true" className="h-3 w-3" />}>
              Unavailable
            </Badge> : null}
          {availability === 'unknown' ? <Badge tone="neutral" size="sm" icon={<div aria-hidden="true" className="h-3 w-3" />}>
              Availability unknown
            </Badge> : null}
        </span>

        <span id={detailId} className="block">
          {provider ? <span className="mt-0.5 block break-words text-sm text-text-secondary">
              {provider}
            </span> : null}
          {context ? <span className="mt-1 block break-words text-sm text-text-secondary">
              {context}
            </span> : null}
          {description ? <span className="mt-1.5 block break-words text-sm leading-relaxed text-text-secondary">
              {description}
            </span> : null}
          {worksFor.length > 0 ? <span className="mt-2 block text-xs text-text-tertiary">
              Works for: {worksFor.join(' · ')}
              {notFor.length > 0 ? <span className="block sm:inline">
                  <span className="hidden sm:inline"> — </span>
                  Not available for: {notFor.join(', ')}
                </span> : null}
            </span> : null}
          {unavailable && reason ? <span className="mt-2 flex items-start gap-1.5 text-sm text-text-primary">
              <BanIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-warning-default" />
              <span className="break-words">{reason}</span>
            </span> : null}
        </span>
      </span>
    </label>;
}
