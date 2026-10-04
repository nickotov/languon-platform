import React from 'react'
import { ArrowRightIcon, BanIcon, PencilLineIcon } from 'lucide-react'
import { Badge } from '../Badge'
import { Skeleton } from '../Skeleton'
import {
  autoContext,
  choiceLabel,
  choiceProvider,
  savedChoiceUnavailable,
} from '../../utils/modelPreference'
import { formatDate } from '../../utils/format'
import {
  AUTO_CHOICE,
  type ModelPreferenceState,
} from '../../types/modelPreference'

interface PreferenceSummaryProps {
  state: ModelPreferenceState
  dirty: boolean
}

function savedWhen(iso: string): string {
  return Date.now() - new Date(iso).getTime() < 60_000 ? 'just now' : `on ${formatDate(iso)}`
}

export function PreferenceSummary({ state, dirty }: PreferenceSummaryProps) {
  if (state.prefStatus === 'loading' || !state.saved) {
    return (
      <div className="radius-md border border-border-default bg-background-subtle p-4">
        <Skeleton variant="text" width={120} height={12} />
        <div className="mt-2">
          <Skeleton variant="text" width="55%" height={18} />
        </div>
        <div className="mt-2">
          <Skeleton variant="text" width="40%" />
        </div>
      </div>
    )
  }

  const saved = state.saved
  const provider = choiceProvider(state, saved.choice)
  const unavailable = savedChoiceUnavailable(state)

  return (
    <div className="radius-md border border-border-default bg-background-subtle p-4">
      <dl className="space-y-3">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
            Saved preference
            {saved.updatedElsewhere ? ' · changed on another device' : ''}
          </dt>
          <dd className="mt-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="break-words text-base font-semibold text-text-primary">
                {choiceLabel(state, saved.choice)}
              </span>
              {unavailable ? (
                <Badge
                  tone="warning"
                  size="sm"
                  icon={<BanIcon aria-hidden="true" className="h-3 w-3" />}
                >
                  Currently unavailable
                </Badge>
              ) : null}
            </span>
            <span className="mt-0.5 block break-words text-sm text-text-secondary">
              {saved.choice === AUTO_CHOICE
                ? autoContext(state)
                : `${provider ?? 'Provider not shown'} · saved ${savedWhen(
                    saved.updatedAt,
                  )}`}
            </span>
          </dd>
        </div>

        {dirty && state.draft ? (
          <div className="border-t border-border-default pt-3">
            <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-text-tertiary">
              <PencilLineIcon aria-hidden="true" className="h-3.5 w-3.5" />
              Unsaved change
            </dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <span className="break-words text-text-secondary">
                {choiceLabel(state, saved.choice)}
              </span>
              <ArrowRightIcon
                aria-label="changes to"
                className="h-4 w-4 shrink-0 text-text-tertiary rtl:rotate-180"
              />
              <span className="break-words font-semibold text-text-primary">
                {choiceLabel(state, state.draft)}
              </span>
              <Badge tone="warning" size="sm" withDot>
                Not saved
              </Badge>
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  )
}

