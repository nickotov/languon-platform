import React from 'react';
import { CircleMinusIcon, CirclePlusIcon, PencilIcon } from 'lucide-react';
import type { DiffEntry } from '../../utils/portraitItems';

const META = {
  added: { label: 'Added', icon: CirclePlusIcon, cls: 'text-success-default' },
  changed: { label: 'Changed', icon: PencilIcon, cls: 'text-info-default' },
  removed: { label: 'Removed', icon: CircleMinusIcon, cls: 'text-danger-default' },
} as const;

export function UpdateDiff({ entries }: { entries: DiffEntry[] }) {
  return (
    <section aria-labelledby="diff-heading" className="rounded-2xl border border-border-default bg-background-surface p-4 sm:p-6">
      <h2 id="diff-heading" className="text-base font-semibold text-text-primary">
        Changes from your saved portrait
      </h2>
      <p className="mt-1 text-sm text-text-secondary">Your saved portrait stays active until you save this update.</p>
      {entries.length === 0 ? (
        <p className="mt-4 rounded-xl bg-background-subtle p-3 text-sm text-text-secondary">No changes yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border-default">
          {entries.map((e, i) => {
            const m = META[e.kind];
            const Icon = m.icon;
            return (
              <li key={`${e.group}-${i}`} className="flex items-start gap-3 py-3">
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${m.cls}`} aria-hidden="true" />
                <div className="min-w-0 text-sm">
                  <p className="text-text-primary">
                    <span className={`font-medium ${m.cls}`}>{m.label}</span>
                    <span className="text-text-tertiary"> · {e.group}</span>
                  </p>
                  <p className={`break-words ${e.kind === 'removed' ? 'text-text-secondary line-through' : 'text-text-primary'}`}>{e.text}</p>
                  {e.before && <p className="break-words text-text-tertiary">Was: {e.before}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

