import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { FlaskConicalIcon, XIcon } from 'lucide-react';
import { Select } from '../Select';
import { Switch } from '../Switch';
import { EXISTING_CHAT, NEW_CHAT, usePrototype } from '../../contexts/PrototypeContext';
import { DEMO_INPUTS, SCENARIOS, SCREEN_LINKS } from '../../data/scenarios';
import type { AiStatus, LoadState } from '../../types/portrait';

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 border-t border-border-default pt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">{title}</h3>
      {children}
    </section>
  );
}

function Pill({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-11 rounded-xl border px-3 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${
        active ? 'border-primary-default bg-primary-subtle text-primary-default' : 'border-border-default text-text-primary hover:bg-background-subtle'
      }`}
    >
      {children}
    </button>
  );
}

export function ScenarioPanel() {
  const p = usePrototype();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        className="fixed bottom-4 right-4 z-50 flex min-h-11 items-center gap-2 rounded-full border-2 border-dashed border-warning-default bg-background-elevated px-4 text-sm font-medium text-text-primary shadow-lg outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
      >
        <FlaskConicalIcon className="h-4 w-4 text-warning-default" aria-hidden="true" />
        Prototype
      </button>
      <AnimatePresence>
        {open && (
          <motion.aside
            role="dialog"
            aria-label="Prototype scenario controls"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            onKeyDown={(e) => e.key === 'Escape' && close()}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l-2 border-dashed border-warning-default bg-background-elevated shadow-lg"
          >
            <div className="flex items-center justify-between gap-2 border-b border-border-default px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-text-primary">Prototype controls</p>
                <p className="text-xs text-text-secondary">Not part of the product. Simulates app-supplied states.</p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close prototype controls"
                autoFocus
                className="flex h-11 w-11 items-center justify-center rounded-xl text-text-secondary outline-none hover:bg-background-subtle focus-visible:ring-2 focus-visible:ring-border-focus"
              >
                <XIcon className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-8 pt-2">
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Portrait state</h3>
                <div className="grid grid-cols-2 gap-2">
                  {SCENARIOS.map((s) => (
                    <Pill
                      key={s.id}
                      active={p.scenario === s.id}
                      onClick={() => {
                        p.applyScenario(s.id);
                        navigate(s.route);
                      }}
                    >
                      <span className="block font-medium">{s.label}</span>
                      <span className="block text-xs text-text-secondary">{s.description}</span>
                    </Pill>
                  ))}
                </div>
              </section>

              <Group title="Cost (supplied by the app)">
                <div className="grid grid-cols-2 gap-2">
                  <Pill active={p.costMode === 'free'} onClick={() => p.setCostMode('free')}>
                    Free interview
                  </Pill>
                  <Pill active={p.costMode === 'paid'} onClick={() => p.setCostMode('paid')}>
                    Paid (credits)
                  </Pill>
                  <Pill active={p.credits === 0} onClick={() => p.setCredits(0)}>
                    Credits → 0
                  </Pill>
                  <Pill active={p.credits > 0} onClick={() => p.setCredits(48)}>
                    Credits → 48
                  </Pill>
                </div>
                <p className="text-xs text-text-tertiary">Switching free → paid shows a notice before the next paid request.</p>
              </Group>

              <Group title="AI responses">
                <Select
                  fullWidth
                  size="sm"
                  label="Next interviewer response"
                  value={p.aiStatus}
                  onChange={(e) => p.setAiStatus(e.target.value as AiStatus)}
                  options={[
                    { label: 'Succeeds', value: 'ok' },
                    { label: 'Model unavailable', value: 'unavailable' },
                    { label: 'Connection lost', value: 'offline' },
                    { label: 'Interrupted mid-response', value: 'interrupted' },
                    { label: 'Interview context limit', value: 'context' },
                  ]}
                />
              </Group>

              <Group title="Loading and failures">
                <Select
                  fullWidth
                  size="sm"
                  label="Portrait page load"
                  value={p.loadState}
                  onChange={(e) => p.setLoadState(e.target.value as LoadState)}
                  options={[
                    { label: 'Ready', value: 'ready' },
                    { label: 'Loading (2 s)', value: 'loading' },
                    { label: 'Load error', value: 'error' },
                  ]}
                />
                <Switch label="Save fails" checked={p.saveFails} onCheckedChange={p.setSaveFails} size="sm" />
                <Switch label="Delete fails" checked={p.deleteFails} onCheckedChange={p.setDeleteFails} size="sm" />
              </Group>

              <Group title="Learning chat">
                <div className="grid grid-cols-2 gap-2">
                  <Pill
                    active={!p.chat.isNew}
                    onClick={() => {
                      p.setChat(EXISTING_CHAT);
                      navigate('/texts/en-el-mercado');
                    }}
                  >
                    Existing chat
                  </Pill>
                  <Pill
                    active={p.chat.isNew}
                    onClick={() => {
                      p.setChat(NEW_CHAT);
                      navigate('/texts/en-el-mercado');
                    }}
                  >
                    New chat
                  </Pill>
                </div>
              </Group>

              <Group title="Demo interview messages">
                <p className="text-xs text-text-tertiary">Fills the interview chat composer. Nothing is sent until you press Send.</p>
                <div className="grid grid-cols-2 gap-2">
                  {DEMO_INPUTS.map((d) => (
                    <Pill
                      key={d.label}
                      onClick={() => {
                        if (!p.interview) p.startInterview('new');
                        p.setDemoComposerText(d.text);
                        navigate('/portrait/interview');
                        close();
                      }}
                    >
                      {d.label}
                    </Pill>
                  ))}
                </div>
              </Group>

              <Group title="Theme">
                <div className="grid grid-cols-2 gap-2">
                  <Pill active={p.theme === 'light'} onClick={() => p.setTheme('light')}>
                    Light
                  </Pill>
                  <Pill active={p.theme === 'dark'} onClick={() => p.setTheme('dark')}>
                    Dark
                  </Pill>
                </div>
              </Group>

              <Group title="Jump to screen">
                <div className="grid grid-cols-2 gap-2">
                  {SCREEN_LINKS.map((l) => (
                    <Pill key={l.route} onClick={() => navigate(l.route)}>
                      {l.label}
                    </Pill>
                  ))}
                </div>
              </Group>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}

