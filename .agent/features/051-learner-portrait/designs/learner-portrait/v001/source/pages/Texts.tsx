import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRightIcon, FileTextIcon } from 'lucide-react';
import { texts } from '../data/library';

export function Texts() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <h1 className="text-2xl font-semibold text-text-primary">Texts</h1>
      <ul className="mt-6 space-y-3">
        {texts.map((t) => {
          const linked = t.slug === 'en-el-mercado';
          return (
            <li key={t.slug}>
              <button
                type="button"
                disabled={!linked}
                onClick={() => navigate(`/texts/${t.slug}`)}
                className="flex min-h-11 w-full items-center gap-3 rounded-2xl border border-border-default bg-background-surface p-4 text-left outline-none hover:bg-background-subtle focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-default disabled:hover:bg-background-surface"
              >
                <FileTextIcon className="h-5 w-5 text-text-tertiary" aria-hidden="true" />
                <span className="flex-1">
                  <span className="block font-medium text-text-primary">{t.title}</span>
                  <span className="block text-sm text-text-secondary">{t.meta}</span>
                </span>
                {linked && <ChevronRightIcon className="h-5 w-5 text-text-tertiary" aria-hidden="true" />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

