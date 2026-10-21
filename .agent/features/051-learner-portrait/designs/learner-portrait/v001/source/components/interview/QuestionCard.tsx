import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRightIcon, CircleCheckIcon, SkipForwardIcon } from 'lucide-react';
import { Button } from '../Button';
import { Input } from '../Input';
import { CharCounter } from '../portrait/editor/CharCounter';
import { ChoiceChip } from '../portrait/editor/ChoiceChip';
import { CORE_TOPICS, INTERVIEW_COPY, OPTIONAL_TOPICS, TOPIC_LABELS } from '../../data/interviewCopy';
import { LIMITS } from '../../data/portraitOptions';
import type { Interview, TopicId } from '../../types/portrait';
import { QuestionFields } from './QuestionFields';
import { useInterviewEngine } from './useInterviewEngine';
import { useQuestionState } from './useQuestionState';

type Engine = ReturnType<typeof useInterviewEngine>;

interface QuestionCardProps {
  interview: Interview;
  engine: Engine;
  busy: boolean;
}

function Shell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section aria-label={label} className="rounded-2xl border border-border-default bg-background-surface p-4 shadow-sm sm:p-6">
      {children}
    </section>
  );
}

function TopicQuestion({ interview, engine, busy }: QuestionCardProps) {
  const q = useQuestionState(interview);
  const [tried, setTried] = useState(false);
  const counterId = React.useId();
  const copy = INTERVIEW_COPY[interview.language].questions[interview.topic];
  const built = q.build();
  const optional = OPTIONAL_TOPICS.includes(interview.topic);
  const customPlaceholder: Partial<Record<TopicId, string>> = {
    languages: 'e.g., I read comfortably but struggle to speak.',
    explanation: 'e.g., Mostly English, with short Spanish examples.',
    goals: 'e.g., Workplace conversation',
    style: 'e.g., Light humour is welcome.',
    needs: 'e.g., A quick check question after each new rule',
    interests: 'e.g., Board games',
  };

  const submit = () => {
    setTried(true);
    if (built.empty || q.customError) return;
    engine.submitAnswer(interview.topic, built.label, built.apply);
  };

  return (
    <Shell label="Current question">
      <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
        {TOPIC_LABELS[interview.topic]}
        {optional ? ' · Optional' : ''} · You can skip this
      </p>
      <h2 className="mt-1 text-lg font-semibold leading-snug text-text-primary">{copy.title}</h2>
      <p className="mt-1 text-sm text-text-secondary">{copy.help}</p>
      <div className="mt-4">
        <QuestionFields q={q} />
      </div>
      {interview.topic !== 'age' && (
        <div className="mt-4 space-y-1">
          <Input
            label="Your own answer (optional)"
            value={q.custom}
            placeholder={customPlaceholder[interview.topic]}
            error={q.customError}
            hint="Short answer for this question · up to 200 characters"
            aria-describedby={counterId}
            onChange={(e) => q.setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
          />
          <CharCounter id={counterId} value={q.custom} max={LIMITS.customAnswer} label="Custom answer" />
        </div>
      )}
      {tried && built.empty && (
        <p className="mt-3 text-sm text-danger-default" role="alert">
          Choose an answer or write your own — or skip this question.
        </p>
      )}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Button variant="ghost" leadingIcon={<SkipForwardIcon className="h-4 w-4" />} onClick={() => engine.skipTopic(interview.topic)} disabled={busy}>
          Skip
        </Button>
        <Button trailingIcon={<ArrowRightIcon className="h-4 w-4" />} onClick={submit} disabled={busy || Boolean(q.customError)}>
          Continue
        </Button>
      </div>
    </Shell>
  );
}

export function QuestionCard({ interview, engine, busy }: QuestionCardProps) {
  const navigate = useNavigate();

  if (interview.phase === 'questions') {
    return <TopicQuestion key={`${interview.topic}-${interview.language}`} interview={interview} engine={engine} busy={busy} />;
  }

  if (interview.phase === 'update-pick') {
    return (
      <Shell label="Choose what to update">
        <h2 className="text-lg font-semibold text-text-primary">What would you like to update?</h2>
        <p className="mt-1 text-sm text-text-secondary">Pick a topic. You can update more than one.</p>
        <div role="group" aria-label="Topics" className="mt-4 flex flex-wrap gap-2">
          {[...CORE_TOPICS, ...OPTIONAL_TOPICS].map((t) => (
            <ChoiceChip key={t} label={TOPIC_LABELS[t]} selected={false} disabled={busy} onToggle={() => engine.pickUpdateTopic(t, TOPIC_LABELS[t])} />
          ))}
        </div>
        <div className="mt-5 flex justify-end">
          <Button variant="secondary" onClick={() => navigate('/portrait/review')}>
            I’m done — review changes
          </Button>
        </div>
      </Shell>
    );
  }

  if (interview.phase === 'deeper-offer') {
    return (
      <Shell label="Optional deeper questions">
        <h2 className="text-lg font-semibold text-text-primary">Go a little deeper?</h2>
        <p className="mt-1 text-sm text-text-secondary">Interests and a broad age range help pick relevant examples. Both are optional.</p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => navigate('/portrait/review')}>
            No thanks, review portrait
          </Button>
          <Button onClick={() => engine.chooseDeeper(true)}>Yes, go deeper</Button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell label="Interview complete">
      <div className="flex items-start gap-3">
        <CircleCheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-success-default" aria-hidden="true" />
        <div>
          <h2 className="text-lg font-semibold text-text-primary">That’s everything for now</h2>
          <p className="mt-1 text-sm text-text-secondary">Review your draft before anything is saved. You can still use the chat below to add details.</p>
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button onClick={() => navigate('/portrait/review')}>Review portrait</Button>
      </div>
    </Shell>
  );
}

