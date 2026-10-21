import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeftIcon, CheckIcon, ChevronDownIcon, CornerUpRightIcon, EyeIcon, EyeOffIcon, PauseIcon } from 'lucide-react';
import { Button } from '../Button';
import { IconButton } from '../IconButton';
import { Select } from '../Select';
import { CORE_TOPICS, OPTIONAL_TOPICS, TOPIC_LABELS } from '../../data/interviewCopy';
import { INTERVIEW_LANGUAGES } from '../../data/portraitOptions';
import type { Interview, LangCode } from '../../types/portrait';

interface InterviewHeaderProps {
  interview: Interview;
  reviewCount: number;
  onExit: () => void;
  onPause: () => void;
  onReview: () => void;
  onLanguage: (l: LangCode) => void;
  busy: boolean;
  previewOpen: boolean;
  onTogglePreview: () => void;
}

export function InterviewHeader({ interview, reviewCount, onExit, onPause, onReview, onLanguage, busy, previewOpen, onTogglePreview }: InterviewHeaderProps) {
  const [expanded, setExpanded] = useState(false);
  const panelId = React.useId();
  const topics =
    interview.mode === 'update' || interview.topicStatus.interests || interview.topic === 'interests' || interview.topic === 'age'
      ? [...CORE_TOPICS, ...OPTIONAL_TOPICS]
      : CORE_TOPICS;
  const inQuestions = interview.phase === 'questions';
  const currentIndex = topics.indexOf(interview.topic);
  const handled = topics.filter((t) => interview.topicStatus[t]).length;
  const progressLabel = inQuestions
    ? `${TOPIC_LABELS[interview.topic]} · ${currentIndex + 1} of ${topics.length}`
    : `${handled} of ${topics.length} topics covered`;

  const languageSelect = (
    <Select
      size="sm"
      aria-label="Interview language"
      value={interview.language}
      onChange={(e) => onLanguage(e.target.value as LangCode)}
      options={INTERVIEW_LANGUAGES.map((l) => ({ label: l.label, value: l.value }))}
    />
  );

  return (
    <header className="sticky top-0 z-20 border-b border-border-default bg-background-surface">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-2 py-2 sm:gap-3 sm:px-4">
        <IconButton icon={<ArrowLeftIcon />} label="Leave interview (progress is kept)" variant="ghost" size="md" onClick={onExit} />

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold text-text-primary sm:text-base">
            {interview.mode === 'update' ? 'Update your portrait' : 'Learner portrait interview'}
          </h1>
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={() => setExpanded((v) => !v)}
            className="-ml-1 flex max-w-full items-center gap-2 rounded-md px-1 text-xs text-text-secondary outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            <span aria-hidden="true" className="flex shrink-0 items-center gap-1">
              {topics.map((t) => {
                const status = interview.topicStatus[t];
                const current = inQuestions && interview.topic === t;
                return (
                  <span
                    key={t}
                    className={`h-1.5 rounded-full transition-all duration-200 ${
                      current ? 'w-4 bg-primary-default' : status === 'answered' ? 'w-1.5 bg-success-default' : status === 'skipped' ? 'w-1.5 bg-text-tertiary' : 'w-1.5 bg-border-strong'
                    }`}
                  />
                );
              })}
            </span>
            <span className="truncate">{progressLabel}</span>
            <ChevronDownIcon className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
            <span className="sr-only">{expanded ? 'Hide topic details' : 'Show topic details'}</span>
          </button>
        </div>

        <div className="hidden w-32 sm:block">{languageSelect}</div>
        <IconButton
          icon={previewOpen ? <EyeOffIcon /> : <EyeIcon />}
          label={previewOpen ? 'Hide draft preview' : 'Show draft preview'}
          aria-pressed={previewOpen}
          variant="ghost"
          size="md"
          onClick={onTogglePreview}
          className={previewOpen ? 'text-primary-default' : undefined}
        />
        <IconButton icon={<PauseIcon />} label="Pause interview" variant="ghost" size="md" onClick={onPause} disabled={busy} />
        <Button onClick={onReview} variant="secondary" size="compact">
          <span className="sm:hidden">Review</span>
          <span className="hidden sm:inline">Review portrait</span>
          {reviewCount > 0 && (
            <span className="ml-1 rounded-md bg-primary-subtle px-1.5 text-xs font-semibold text-primary-default" aria-label={`${reviewCount} items in draft`}>
              {reviewCount}
            </span>
          )}
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            id={panelId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-border-default"
          >
            <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <ol className="flex flex-wrap items-center gap-x-4 gap-y-1" aria-label="Interview topics (all optional)">
                {topics.map((t) => {
                  const status = interview.topicStatus[t];
                  const current = inQuestions && interview.topic === t;
                  return (
                    <li
                      key={t}
                      aria-current={current ? 'step' : undefined}
                      className={`flex items-center gap-1 text-xs ${current ? 'font-semibold text-primary-default' : status ? 'text-text-secondary' : 'text-text-tertiary'}`}
                    >
                      {status === 'answered' && <CheckIcon className="h-3.5 w-3.5 text-success-default" aria-hidden="true" />}
                      {status === 'skipped' && <CornerUpRightIcon className="h-3.5 w-3.5" aria-hidden="true" />}
                      {!status && <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${current ? 'bg-primary-default' : 'bg-border-strong'}`} />}
                      <span>{TOPIC_LABELS[t]}</span>
                      <span className="sr-only">{status ? `, ${status}` : current ? ', current' : ''}</span>
                    </li>
                  );
                })}
              </ol>
              <p className="text-xs text-text-tertiary">Every topic is optional · nothing is saved until you approve it</p>
              <div className="flex items-center gap-2 sm:hidden">
                <span className="text-xs text-text-secondary">Interview language</span>
                <div className="flex-1">{languageSelect}</div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

