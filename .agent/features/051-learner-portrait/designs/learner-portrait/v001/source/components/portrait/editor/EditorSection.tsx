import React from 'react';

interface EditorSectionProps {
  id: string;
  title: string;
  description?: string;
  optional?: boolean;
  count?: number;
  children: React.ReactNode;
}

export function EditorSection({ id, title, description, optional, count, children }: EditorSectionProps) {
  return (
    <section aria-labelledby={`${id}-title`} className="rounded-2xl border border-border-default bg-background-surface p-4 sm:p-6">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <h3 id={`${id}-title`} className="text-base font-semibold text-text-primary">
            {title}
            {optional && <span className="ml-2 text-sm font-normal text-text-tertiary">Optional</span>}
          </h3>
          {description && <p className="mt-1 text-sm text-text-secondary">{description}</p>}
        </div>
        {typeof count === 'number' && (
          <span className="text-xs text-text-tertiary">{count === 0 ? 'Nothing added' : `${count} item${count === 1 ? '' : 's'}`}</span>
        )}
      </header>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

