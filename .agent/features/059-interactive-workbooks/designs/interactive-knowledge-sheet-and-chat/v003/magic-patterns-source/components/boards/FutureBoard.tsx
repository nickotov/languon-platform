import React from 'react';
import { AudioLinesIcon, CheckIcon, FileTextIcon, MicIcon, TimerIcon, Volume2Icon, XIcon } from 'lucide-react';
import { BoardSection, BoardShell } from './BoardShell';

const conceptBadge = (
  <span className="rounded-full border border-dashed border-warning-default bg-warning-subtle px-2.5 py-0.5 text-xs font-semibold text-warning-default">Future concept · not in launch</span>
);

function Concept({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <figure className="rounded-2xl border-2 border-dashed border-border-strong bg-background-surface p-4">
      <figcaption className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-text-primary">{title}</span>
        <span className="rounded-full bg-background-subtle px-2 py-0.5 text-xs text-text-tertiary">Concept</span>
      </figcaption>
      {children}
    </figure>
  );
}

const step = (n: number, label: string, body: string) => (
  <li key={n} className="flex gap-2.5">
    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-dashed border-border-strong text-xs text-text-tertiary">{n}</span>
    <div>
      <p className="text-sm font-medium text-text-primary">{label}</p>
      <p className="text-xs leading-5 text-text-secondary">{body}</p>
    </div>
  </li>
);

/**
 * KS-23 extension concepts. Nothing here is enabled in the launch prototype: no microphone capture,
 * no pronunciation scoring, no question-difficulty setting.
 */
export function FutureBoard({ mobile }: { mobile: boolean }) {
  return (
    <BoardShell
      mobile={mobile}
      title="Future capabilities"
      badge={conceptBadge}
      subtitle="Reserved extension patterns for later releases. They use dashed outlines and never appear as enabled controls in the launch workspace. Levels, labels, languages and assessment policy are still to be defined."
    >
      <BoardSection title="Pronunciation · listen vs practise">
        <div className="grid gap-4 lg:grid-cols-2">
          <Concept title="Two separate actions on a word">
            <div className="flex items-center gap-3 rounded-xl bg-background-subtle px-3 py-3">
              <span lang="fr" className="text-base font-medium text-text-primary">
                carrelage
              </span>
              <span className="text-xs text-text-tertiary">[kaʁ.laʒ]</span>
              <span className="flex-1" />
              <span className="inline-flex h-8 items-center gap-1.5 rounded-md bg-background-surface px-2 text-xs font-medium text-text-primary">
                <Volume2Icon className="h-3.5 w-3.5" aria-hidden="true" /> Listen · available now
              </span>
              <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-dashed border-border-strong px-2 text-xs font-medium text-text-tertiary" aria-disabled="true">
                <MicIcon className="h-3.5 w-3.5" aria-hidden="true" /> Practise · future
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-text-secondary">Playing a model pronunciation never assesses the learner. Assessment would be a separate, explicit, private attempt.</p>
          </Concept>
          <Concept title="Possible practice flow">
            <ol className="space-y-2.5">
              {step(1, 'Ask for microphone access', 'Explain why and that the recording stays private.')}
              {step(2, 'Record or submit audio', 'Clear start/stop; the learner can discard before sending.')}
              {step(3, 'Processing', 'Honest progress label, no time estimate.')}
              {step(4, 'What was recognised', 'Show recognised speech where available — no phoneme highlighting promised.')}
              {step(5, 'Constructive feedback', 'Short suggestions in the explanation language; no invented score scale.')}
              {step(6, 'Try again', 'Each attempt is private and never edits the sheet.')}
            </ol>
          </Concept>
        </div>
      </BoardSection>

      <BoardSection title="Listening & video comprehension · transcript + description">
        <div className="grid gap-4 lg:grid-cols-2">
          <Concept title="Author editor · source basis">
            <p className="mb-2 text-xs font-medium text-text-tertiary">Questions are generated only from material the author provides</p>
            <ul className="space-y-1.5 text-sm">
              <li className="flex items-center gap-2 text-text-primary">
                <FileTextIcon className="h-4 w-4 text-text-tertiary" aria-hidden="true" /> Transcript · 5 lines <CheckIcon className="h-3.5 w-3.5 text-success-default" aria-label="provided" />
              </li>
              <li className="flex items-center gap-2 text-text-primary">
                <AudioLinesIcon className="h-4 w-4 text-text-tertiary" aria-hidden="true" /> Author description of the scene <CheckIcon className="h-3.5 w-3.5 text-success-default" aria-label="provided" />
              </li>
              <li className="flex items-center gap-2 text-text-primary">
                <TimerIcon className="h-4 w-4 text-text-tertiary" aria-hidden="true" /> Timestamps <CheckIcon className="h-3.5 w-3.5 text-success-default" aria-label="provided" />
              </li>
            </ul>
            <p className="mt-3 rounded-lg bg-background-subtle px-3 py-2 text-xs leading-5 text-text-secondary">
              The description adds context; it doesn’t mean the AI looked at video frames or listened to audio. If the transcript is missing, the editor asks for it instead of inventing grounded questions.
            </p>
          </Concept>
          <Concept title="Generated question set · reviewed before Apply">
            <ol className="space-y-3 text-sm">
              {[
                ['Recall', 'Que veut acheter la cliente ?', 'du poisson', '0:00'],
                ['Inference', 'Pourquoi le marchand propose-t-il le cabillaud ?', 'Parce qu’il est frais aujourd’hui.', '0:06'],
                ['Interpretation', 'Comment la cliente réagit-elle au refus ? Citez le texte.', '« D’accord. Je prends le cabillaud, alors. »', '0:26'],
              ].map(([level, q, a, t]) => (
                <li key={level} className="border-l-2 border-dashed border-border-strong pl-3">
                  <p className="text-xs font-semibold text-text-tertiary">
                    {level} <span className="font-normal">· illustrative label</span>
                  </p>
                  <p lang="fr" className="text-text-primary">
                    {q}
                  </p>
                  <p className="text-xs text-text-secondary">
                    Reference: <span lang="fr">{a}</span> · passage {t}
                  </p>
                </li>
              ))}
            </ol>
          </Concept>
        </div>
      </BoardSection>

      <BoardSection title="Question difficulty · optional authoring parameter">
        <Concept title="Inside question-generation settings only — not a course level">
          <div role="group" aria-label="Question difficulty (concept, disabled)" className="inline-flex rounded-lg bg-background-subtle p-0.5 opacity-70">
            {['Direct recall', 'Inference', 'Interpretation'].map((l, i) => (
              <span key={l} aria-disabled="true" className={`rounded-md px-3 py-1.5 text-xs font-medium ${i === 1 ? 'bg-background-surface text-text-primary shadow-sm' : 'text-text-secondary'}`}>
                {l}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs leading-5 text-text-secondary">Would change the proposed question set and be visible during review. No grades, prerequisites or course generation.</p>
        </Concept>
      </BoardSection>

      <BoardSection title="Out of scope for launch">
        <ul className="grid gap-2 text-sm text-text-secondary sm:grid-cols-2 lg:grid-cols-3">
          {[
            'Course or lesson generation',
            'Workbook-wide AI context',
            'Grades, prerequisites, teacher dashboards',
            'Saving grammar to a library',
            'Automatic remote-video understanding',
            'Microphone recording & pronunciation assessment',
            'Arbitrary embed code',
            'External Quizlet integration',
            'Public discovery or social feeds',
          ].map((t) => (
            <li key={t} className="flex items-start gap-2">
              <XIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
              {t}
            </li>
          ))}
        </ul>
      </BoardSection>
    </BoardShell>
  );
}

