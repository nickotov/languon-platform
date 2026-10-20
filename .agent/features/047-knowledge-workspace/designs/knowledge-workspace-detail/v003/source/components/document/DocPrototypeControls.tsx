import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDownIcon, FlaskConicalIcon, RotateCcwIcon } from 'lucide-react';
import { docScenarios } from '../../data/documentScenarios';
import type { DocFlags, DocViewport } from '../../types/document';
import type { Theme } from '../../types/app';

export interface DocPrototypeControlsProps {
  scenarioId: string;
  viewport: DocViewport;
  theme: Theme;
  realMobile: boolean;
  onScenario: (id: string) => void;
  onViewport: (v: DocViewport) => void;
  onTheme: (t: Theme) => void;
  onRestart: () => void;
  flags: DocFlags;
  onFlags: (patch: Partial<DocFlags>) => void;
  lowLimits: boolean;
  onLowLimits: (on: boolean) => void;
}

const groups = Array.from(new Set(docScenarios.map((s) => s.group)));

/** Prototype-only scenario switcher, visually separate from the product UI. */
export function DocPrototypeControls(p: DocPrototypeControlsProps) {
  const [open, setOpen] = useState(false);
  const seg = (active: boolean) =>
    `flex-1 rounded-md px-2 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 ${
      active ? 'bg-neutral-50 text-neutral-900' : 'text-neutral-300 hover:bg-neutral-800'
    }`;
  const toggles: { label: string; on: boolean; set: (on: boolean) => void }[] = [
    { label: 'Next Save fails', on: p.flags.saveFails, set: (on) => p.onFlags({ saveFails: on }) },
    { label: 'Revision history fails to load', on: p.flags.historyFails, set: (on) => p.onFlags({ historyFails: on }) },
    { label: 'Offline (recovery on this device)', on: p.flags.recoveryMode === 'offline', set: (on) => p.onFlags({ recoveryMode: on ? 'offline' : 'online' }) },
    { label: 'Recovery server error', on: p.flags.recoveryMode === 'error', set: (on) => p.onFlags({ recoveryMode: on ? 'error' : 'online' }) },
    { label: 'Low limits (1,500 / 2,000 chars)', on: p.lowLimits, set: p.onLowLimits },
  ];

  return createPortal(
    <div className={`fixed z-50 ${p.realMobile ? 'right-2 top-16' : 'bottom-4 right-4'}`}>
      {open ? (
        <div role="region" aria-label="Prototype controls" className="flex w-72 flex-col overflow-hidden rounded-2xl border border-neutral-700 bg-neutral-900 text-neutral-50 shadow-lg">
          <div className="flex items-start justify-between gap-2 border-b border-neutral-700 px-3.5 py-3">
            <div>
              <p className="text-sm font-semibold">Prototype controls</p>
              <p className="text-xs text-neutral-400">Not part of the product UI</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Hide prototype controls" className="rounded-md p-1.5 text-neutral-300 hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300">
              <ChevronDownIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3.5 py-3" style={{ maxHeight: '64vh' }}>
            <div>
              <p className="mb-1.5 text-xs font-medium text-neutral-400">Viewport</p>
              <div className="flex gap-1 rounded-lg bg-neutral-800 p-1">
                {(['desktop', 'narrow', 'mobile'] as DocViewport[]).map((v) => (
                  <button key={v} type="button" disabled={p.realMobile} onClick={() => p.onViewport(v)} aria-pressed={p.viewport === v} className={seg(p.viewport === v)}>
                    {v === 'desktop' ? 'Full' : v === 'narrow' ? '1100' : '390'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-neutral-400">Theme</p>
              <div className="flex gap-1 rounded-lg bg-neutral-800 p-1">
                {(['light', 'dark'] as Theme[]).map((t) => (
                  <button key={t} type="button" onClick={() => p.onTheme(t)} aria-pressed={p.theme === t} className={seg(p.theme === t)}>
                    {t === 'light' ? 'Light' : 'Dark'}
                  </button>
                ))}
              </div>
            </div>
            {groups.map((g) => (
              <div key={g}>
                <p className="mb-1 text-xs font-medium text-neutral-400">{g}</p>
                <ul className="space-y-0.5">
                  {docScenarios
                    .filter((s) => s.group === g)
                    .map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => p.onScenario(s.id)}
                          aria-current={p.scenarioId === s.id ? 'true' : undefined}
                          className={`w-full rounded-md px-2 py-1.5 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 ${
                            p.scenarioId === s.id ? 'bg-primary-600 text-neutral-50' : 'text-neutral-200 hover:bg-neutral-800'
                          }`}
                        >
                          {s.label}
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
            <div>
              <p className="mb-1 text-xs font-medium text-neutral-400">Simulate</p>
              {toggles.map((t) => (
                <label key={t.label} className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800">
                  {t.label}
                  <input type="checkbox" checked={t.on} onChange={(e) => t.set(e.target.checked)} className="accent-primary-500" />
                </label>
              ))}
            </div>
          </div>
          <div className="border-t border-neutral-700 px-3.5 py-2.5">
            <button type="button" onClick={p.onRestart} className="inline-flex items-center gap-1.5 text-xs text-neutral-300 hover:text-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300">
              <RotateCcwIcon className="h-3.5 w-3.5" aria-hidden="true" /> Restart scenario
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-9 max-w-xs items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-900 px-3 text-xs font-medium text-neutral-50 shadow-md hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
        >
          <FlaskConicalIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">Prototype · {docScenarios.find((s) => s.id === p.scenarioId)?.label}</span>
        </button>
      )}
    </div>,
    document.body,
  );
}

