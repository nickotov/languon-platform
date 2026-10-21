import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, PlusIcon } from 'lucide-react';
import { Button } from '../components/Button';
import { usePrototype } from '../contexts/PrototypeContext';

export function CreditSettings() {
  const navigate = useNavigate();
  const { credits, setCredits, showToast } = usePrototype();
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6 sm:px-6 sm:py-10">
      <Button variant="ghost" size="compact" leadingIcon={<ArrowLeftIcon className="h-4 w-4" />} onClick={() => navigate(-1)}>
        Back
      </Button>
      <h1 className="text-2xl font-semibold text-text-primary">Credits</h1>
      <section className="rounded-2xl border border-border-default bg-background-surface p-4 sm:p-6" aria-labelledby="balance">
        <h2 id="balance" className="text-sm text-text-secondary">
          Current balance
        </h2>
        <p className="mt-1 text-3xl font-semibold tabular-nums text-text-primary">{credits}</p>
        <p className="mt-2 text-sm text-text-secondary">AI chat responses use credits under your current plan. Manual editing and saving never do.</p>
        <div className="mt-4">
          <Button
            leadingIcon={<PlusIcon className="h-4 w-4" />}
            onClick={() => {
              setCredits(credits + 20);
              showToast({ variant: 'success', title: '20 credits added' });
            }}
          >
            Add 20 credits
          </Button>
        </div>
      </section>
    </div>
  );
}

