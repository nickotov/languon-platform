import React from 'react';
import { RefreshCwIcon } from 'lucide-react';
import { Button } from '../Button';
import { Radio, RadioGroup } from '../Radio';
import { usePrototype } from '../../contexts/PrototypeContext';

export function ConflictPanel() {
  const { interview, setInterview, showToast } = usePrototype();
  if (!interview?.conflict) return null;
  const conflicts = interview.conflict;
  const allChosen = conflicts.every((c) => c.choice);

  const choose = (id: string, choice: 'saved' | 'draft') =>
    setInterview((iv) => (iv?.conflict ? { ...iv, conflict: iv.conflict.map((c) => (c.id === id ? { ...c, choice } : c)) } : iv));

  const apply = () =>
    setInterview((iv) => {
      if (!iv?.conflict) return iv;
      const draft = iv.conflict.reduce((d, c) => (c.choice === 'saved' ? c.apply(d) : d), iv.draft);
      showToast({ variant: 'success', title: 'Draft reconciled', description: 'Review the result before saving.' });
      return { ...iv, draft, conflict: null };
    });

  return (
    <section aria-labelledby="conflict-heading" className="rounded-2xl border border-warning-default bg-warning-subtle p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <RefreshCwIcon className="mt-0.5 h-5 w-5 shrink-0 text-warning-default" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 id="conflict-heading" className="text-base font-semibold text-text-primary">
            Your portrait changed elsewhere
          </h2>
          <p className="mt-1 text-sm text-text-primary">
            You saved changes on another device after this interview started. Choose what to keep for each item. Nothing is overwritten until you decide, and this draft stays available until you resolve it or it expires.
          </p>
          <div className="mt-4 space-y-3">
            {conflicts.map((c) => (
              <div key={c.id} className="rounded-xl border border-border-default bg-background-surface p-4">
                <RadioGroup label={c.field} value={c.choice ?? undefined} onChange={(v) => choose(c.id, v as 'saved' | 'draft')} variant="card" size="sm">
                  <Radio value="saved" description={c.savedOn}>
                    Keep latest saved: {c.saved}
                  </Radio>
                  <Radio value="draft" description="Proposed in this interview">
                    Use this draft: {c.proposed}
                  </Radio>
                </RadioGroup>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={apply} disabled={!allChosen}>
              Reconcile draft
            </Button>
            {!allChosen && <p className="text-sm text-text-secondary">Choose an option for each item to continue.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

