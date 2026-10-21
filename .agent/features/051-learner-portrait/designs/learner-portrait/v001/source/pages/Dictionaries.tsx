import React from 'react';
import { BookOpenIcon } from 'lucide-react';
import { dictionaries } from '../data/library';

export function Dictionaries() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <h1 className="text-2xl font-semibold text-text-primary">Dictionaries</h1>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {dictionaries.map((d) => (
          <li key={d.title} className="flex items-start gap-3 rounded-2xl border border-border-default bg-background-surface p-4">
            <BookOpenIcon className="mt-0.5 h-5 w-5 text-text-tertiary" aria-hidden="true" />
            <div>
              <p className="font-medium text-text-primary">{d.title}</p>
              <p className="text-sm text-text-secondary">{d.meta}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

