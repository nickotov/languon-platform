import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRightIcon, CoinsIcon } from 'lucide-react';
import { Radio, RadioGroup } from '../components/Radio';
import { Select } from '../components/Select';
import { PortraitStatusCard } from '../components/portrait/PortraitStatusCard';
import { usePrototype } from '../contexts/PrototypeContext';
import { INTERVIEW_LANGUAGES } from '../data/portraitOptions';
import type { LangCode } from '../types/portrait';

export function Settings() {
  const navigate = useNavigate();
  const { theme, setTheme, interfaceLanguage, setInterfaceLanguage, costMode, credits, portrait, interview } = usePrototype();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-6 sm:px-6 sm:py-10">
      <header>
        <h1 className="text-2xl font-semibold text-text-primary">Account & settings</h1>
        <p className="mt-1 text-sm text-text-secondary">Maya Chen · maya.chen@example.com</p>
      </header>

      <section aria-labelledby="prefs-heading" className="space-y-5 rounded-2xl border border-border-default bg-background-surface p-4 sm:p-6">
        <h2 id="prefs-heading" className="text-base font-semibold text-text-primary">
          Preferences
        </h2>
        <Select
          fullWidth
          label="Interface language"
          hint="The language of menus and buttons. It doesn’t change which languages you study or prefer for explanations."
          value={interfaceLanguage}
          onChange={(e) => setInterfaceLanguage(e.target.value as LangCode)}
          options={INTERVIEW_LANGUAGES.map((l) => ({ label: l.label, value: l.value }))}
        />
        <RadioGroup label="Appearance" value={theme} onChange={(v) => setTheme(v as 'light' | 'dark')} orientation="horizontal" variant="card" size="sm">
          <Radio value="light">Light</Radio>
          <Radio value="dark">Dark</Radio>
        </RadioGroup>
      </section>

      <section aria-labelledby="portrait-heading" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="portrait-heading" className="text-base font-semibold text-text-primary">
            Learner portrait
          </h2>
          {(portrait || interview) && (
            <button
              type="button"
              onClick={() => navigate('/portrait')}
              className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-primary-default outline-none hover:underline focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              Manage portrait
              <ChevronRightIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
        <PortraitStatusCard variant="settings" />
      </section>

      <section aria-labelledby="credits-heading">
        <h2 id="credits-heading" className="sr-only">
          Credits
        </h2>
        <button
          type="button"
          onClick={() => navigate('/settings/credits')}
          className="flex min-h-11 w-full items-center gap-3 rounded-2xl border border-border-default bg-background-surface p-4 text-left outline-none hover:bg-background-subtle focus-visible:ring-2 focus-visible:ring-border-focus sm:p-6"
        >
          <CoinsIcon className="h-5 w-5 text-text-secondary" aria-hidden="true" />
          <span className="flex-1">
            <span className="block font-medium text-text-primary">Credits</span>
            <span className="block text-sm text-text-secondary">
              {credits} credits · {costMode === 'paid' ? 'AI responses use credits' : 'Interviewer responses are currently free'}
            </span>
          </span>
          <ChevronRightIcon className="h-5 w-5 text-text-tertiary" aria-hidden="true" />
        </button>
      </section>
    </div>
  );
}

