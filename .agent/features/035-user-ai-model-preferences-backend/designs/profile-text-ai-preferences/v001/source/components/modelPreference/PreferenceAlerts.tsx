import React from 'react'
import { WifiOffIcon } from 'lucide-react'
import { Button } from '../Button'
import { InlineAlert } from '../InlineAlert'
import {
  choiceLabel,
  savedChoiceUnavailable,
} from '../../utils/modelPreference'
import { AUTO_CHOICE } from '../../types/modelPreference'
import type { ModelPreferenceStore } from '../../hooks/useModelPreference'

interface PreferenceAlertsProps {
  store: ModelPreferenceStore
  taskInProgress: boolean
}

function ComparisonRow({
  label,
  value,
  emphasis,
}: {
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <div className="radius-sm min-w-0 border border-border-default bg-background-surface p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
        {label}
      </p>
      <p
        className={`mt-1 break-words text-sm ${
          emphasis ? 'font-semibold text-text-primary' : 'text-text-primary'
        }`}
      >
        {value}
      </p>
    </div>
  )
}

export function PreferenceAlerts({ store, taskInProgress }: PreferenceAlertsProps) {
  const { state, dirty } = store
  const saving = state.saveStatus === 'saving'

  return (
    <>
      {!state.online ? (
        <InlineAlert
          tone="warning"
          title="You’re offline"
          icon={<WifiOffIcon aria-hidden="true" className="h-4 w-4" />}
          actions={
            <Button
              variant="secondary"
              size="compact"
              onClick={() => store.setOnline(true)}
            >
              Check connection
            </Button>
          }
        >
          {dirty
            ? 'Your choice is kept on this page only. It isn’t saved yet and will be lost if you reload or close the page. Save it when you’re back online.'
            : 'You can review your preference, but saving needs a connection.'}
        </InlineAlert>
      ) : null}

      {state.saveStatus === 'conflict' && state.saved && state.draft ? (
        <InlineAlert
          tone="warning"
          title="Your preference changed elsewhere. Review the latest choice before saving."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="compact"
                onClick={store.acceptLatest}
              >
                Use latest
              </Button>
              {state.draft !== state.saved.choice ? (
                <Button
                  size="compact"
                  onClick={store.save}
                  disabled={!store.saveAllowed}
                >
                  Save my choice instead
                </Button>
              ) : null}
            </div>
          }
        >
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <ComparisonRow
              label="Latest saved (another tab or device)"
              value={choiceLabel(state, state.saved.choice)}
              emphasis
            />
            <ComparisonRow
              label="Your unsaved choice"
              value={choiceLabel(state, state.draft)}
            />
          </div>
          {state.conflictBase ? (
            <p className="mt-2 text-sm">
              You started from {choiceLabel(state, state.conflictBase)}.
            </p>
          ) : null}
        </InlineAlert>
      ) : null}

      {state.saveStatus === 'network_error' ? (
        <InlineAlert
          tone="error"
          title="Preference not saved"
          actions={
            <Button
              variant="secondary"
              size="compact"
              onClick={store.save}
              disabled={!store.saveAllowed}
            >
              Retry save
            </Button>
          }
        >
          We couldn’t reach Languon. Your choice is still selected — try again
          when your connection is stable.
        </InlineAlert>
      ) : null}

      {state.saveStatus === 'rejected' && state.rejectedModel ? (
        <InlineAlert
          tone="error"
          title={`${state.rejectedModel.name} is no longer available`}
          actions={
            <Button
              variant="secondary"
              size="compact"
              onClick={() => store.selectDraft(AUTO_CHOICE)}
            >
              Choose Auto
            </Button>
          }
        >
          We refreshed the list of models. Choose Auto or another available
          model, then save again. Nothing else in your profile was changed.
        </InlineAlert>
      ) : null}

      {savedChoiceUnavailable(state) &&
      state.saved &&
      state.saveStatus !== 'conflict' ? (
        <InlineAlert
          tone="warning"
          title="Your selection is currently unavailable"
          actions={
            state.draft === state.saved.choice ? (
              <Button
                variant="secondary"
                size="compact"
                onClick={() => store.selectDraft(AUTO_CHOICE)}
                disabled={saving}
              >
                Choose Auto
              </Button>
            ) : null
          }
        >
          New requests can’t use {choiceLabel(state, state.saved.choice)} right
          now. We’ve kept it as your preference — choose Auto or another
          available model to keep AI requests running.
        </InlineAlert>
      ) : null}

      {taskInProgress ? (
        <InlineAlert tone="info" title="An AI task is in progress">
          This change applies to future requests. Your current task keeps its
          original model.
        </InlineAlert>
      ) : null}
    </>
  )
}

