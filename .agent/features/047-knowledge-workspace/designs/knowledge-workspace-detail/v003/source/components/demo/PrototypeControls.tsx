import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDownIcon, FlaskConicalIcon, RotateCcwIcon } from 'lucide-react';
import { scenarios } from '../../data/scenarios';
import type { Theme, Viewport } from '../../types/app';

export interface SimulationToggle {
  id: string;
  label: string;
  on: boolean;
  onToggle: () => void;
}

interface PrototypeControlsProps {
  scenarioId: string;
  viewport: Viewport;
  theme: Theme;
  onScenario: (id: string) => void;
  onViewport: (v: Viewport) => void;
  onTheme: (t: Theme) => void;
  onRestart: () => void;
  onSourceUpdate: () => void;
  toggles: SimulationToggle[];
  realMobile: boolean;
}

const groups = Array.from(new Set(scenarios.map((s) => s.group)));

/** Prototype-only scenario switcher. Visually separate from the product UI. */
export function PrototypeControls(props: PrototypeControlsProps) {
  const [open, setOpen] = useState(false);
  const { scenarioId, viewport, theme, realMobile } = props;

  const seg = (active: boolean) =>
    `flex-1 rounded-md px-2 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 ${
      active ? 'bg-neutral-50 text-neutral-900' : 'text-neutral-300 hover:bg-neutral-800'
    }`;

  return createPortal(
    <div className={`fixed z-50 ${realMobile ? 'right-2 top-16' : 'bottom-4 right-4'}`}>
      {open ? (
        <div className="flex max-h-screen w-72 flex-col overflow-hidden rounded-2xl border border-neutral-700 bg-neutral-900 text-neutral-50 shadow-lg" role="region" aria-label="Prototype controls">
          <div className="flex items-start justify-between gap-2 border-b border-neutral-700 px-3.5 py-3">
            <div>
              <p className="text-sm font-semibold">Prototype controls</p>
              <p className="text-xs text-neutral-400">Not part of the product UI</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Hide prototype controls"
              className="rounded-md p-1.5 text-neutral-300 hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
            >
              <ChevronDownIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3.5 py-3" style={{ maxHeight: '62vh' }}>
            <div>
              <p className="mb-1.5 text-xs font-medium text-neutral-400">Viewport</p>
              <div className="flex gap-1 rounded-lg bg-neutral-800 p-1">
                {(['desktop', 'mobile390', 'mobile320'] as Viewport[]).map((v) => (
                  <button key={v} type="button" disabled={realMobile} onClick={() => props.onViewport(v)} className={seg(viewport === v)} aria-pressed={viewport === v}>
                    {v === 'desktop' ? 'Desktop' : v === 'mobile390' ? '390' : '320'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-neutral-400">Theme</p>
              <div className="flex gap-1 rounded-lg bg-neutral-800 p-1">
                {(['light', 'dark'] as Theme[]).map((t) => (
                  <button key={t} type="button" onClick={() => props.onTheme(t)} className={seg(theme === t)} aria-pressed={theme === t}>
                    {t === 'light' ? 'Light' : 'Dark'}
                  </button>
                ))}
              </div>
            </div>
            {groups.map((g) => (
              <div key={g}>
                <p className="mb-1 text-xs font-medium text-neutral-400">{g}</p>
                <ul className="space-y-0.5">
                  {scenarios
                    .filter((s) => s.group === g)
                    .map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => props.onScenario(s.id)}
                          aria-current={scenarioId === s.id ? 'true' : undefined}
                          className={`w-full rounded-md px-2 py-1.5 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 ${
                            scenarioId === s.id ? 'bg-primary-600 text-neutral-50' : 'text-neutral-200 hover:bg-neutral-800'
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
              <button type="button" onClick={props.onSourceUpdate} className="w-full rounded-md px-2 py-1.5 text-left text-xs text-neutral-200 hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300">
                Saved source changed elsewhere
              </button>
              {props.toggles.map((t) => (
                <label key={t.id} className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800">
                  {t.label}
                  <input type="checkbox" checked={t.on} onChange={t.onToggle} className="accent-primary-500" />
                </label>
              ))}
            </div>
          </div>
          <div className="border-t border-neutral-700 px-3.5 py-2.5">
            <button type="button" onClick={props.onRestart} className="inline-flex items-center gap-1.5 text-xs text-neutral-300 hover:text-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300">
              <RotateCcwIcon className="h-3.5 w-3.5" aria-hidden="true" /> Restart scenario
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-900 px-3 text-xs font-medium text-neutral-50 shadow-md hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
        >
          <FlaskConicalIcon className="h-3.5 w-3.5" aria-hidden="true" />
          Prototype · {scenarios.find((s) => s.id === scenarioId)?.label}
        </button>
      )}
    </div>,
    document.body,
  );
}

