import React, { useEffect, useId, useRef } from 'react'
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CoinsIcon,
  RefreshCwIcon,
  ServerOffIcon,
} from 'lucide-react'
import { Button } from '../Button'
import { SettingsSection } from '../profile/SettingsSection'
import { ModelOptionCard } from './ModelOptionCard'
import { ModelPickerSkeleton } from './ModelPickerSkeleton'
import { PreferenceAlerts } from './PreferenceAlerts'
import { PreferenceSummary } from './PreferenceSummary'
import { unavailableReasons } from '../../data/aiModels'
import {
  autoContext,
  availableCount,
  findOption,
} from '../../utils/modelPreference'
import { formatCredits } from '../../utils/format'
import { AUTO_CHOICE, type ModelOption } from '../../types/modelPreference'
import type { ModelPreferenceStore } from '../../hooks/useModelPreference'

interface ModelPreferenceSectionProps {
  store: ModelPreferenceStore
  creditsAvailable: number
  taskInProgress?: boolean
  onOpenCredits?: () => void
}

type RenderedOption = ModelOption & { availability: 'available' | 'unavailable' | 'unknown' }

export function ModelPreferenceSection({
  store,
  creditsAvailable,
  taskInProgress = false,
  onOpenCredits,
}: ModelPreferenceSectionProps) {
  const uid = useId().replace(/:/g, '')
  const groupName = `ai-model-${uid}`
  const legendId = `${groupName}-legend`
  const alertsRef = useRef<HTMLDivElement>(null)
  const { state, dirty } = store
  const saving = state.saveStatus === 'saving'
  const saved = state.saved

  // Move focus to the relevant problem region without jumping the page.
  useEffect(() => {
    if (
      state.saveStatus === 'network_error' ||
      state.saveStatus === 'rejected' ||
      state.saveStatus === 'conflict'
    ) {
      const region = alertsRef.current
      if (!region) return
      region.focus({ preventScroll: true })
      region.scrollIntoView({ block: 'nearest' })
    }
  }, [state.saveStatus])

  const options: RenderedOption[] = []
  const savedExplicit = saved && saved.choice !== AUTO_CHOICE ? saved : null

  if (state.catalogStatus === 'ready') {
    if (savedExplicit && !findOption(state, savedExplicit.choice) && savedExplicit.savedModel) {
      options.push({
        ...savedExplicit.savedModel,
        description: 'Your saved selection.',
        available: false,
        unavailableReason: unavailableReasons.removed,
        availability: 'unavailable',
      })
    }
    state.catalog.forEach((option) =>
      options.push({
        ...option,
        availability: option.available ? 'available' : 'unavailable',
      }),
    )
  } else if (state.catalogStatus === 'error' && savedExplicit?.savedModel) {
    options.push({
      ...savedExplicit.savedModel,
      description: 'Your saved selection. We’ll confirm availability once the list loads.',
      available: true,
      availability: 'unknown',
    })
  }

  const noModels = state.catalogStatus === 'ready' && availableCount(state) === 0
  const liveMessage =
    state.saveStatus === 'saving'
      ? 'Saving your AI model preference…'
      : state.saveStatus === 'saved'
        ? 'AI model preference saved.'
        : state.saveStatus === 'network_error'
          ? 'Your AI model preference was not saved.'
          : ''

  return (
    <SettingsSection
      id={groupName}
      title="AI model"
      description="Choose the model for new dictionary and sentence AI requests."
    >
      <div className="space-y-5">
        <p className="max-w-reading text-sm leading-relaxed text-text-secondary">
          Applies to dictionary text, sentence generation and AI translation
          checks. Audio and document reading aren’t affected. Tasks you’ve
          already started keep the model they began with, and existing
          sentences, attempts and scores don’t change.
        </p>

        <PreferenceSummary state={state} dirty={dirty} />

        <div
          ref={alertsRef}
          tabIndex={-1}
          className="radius-md space-y-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          <PreferenceAlerts store={store} taskInProgress={taskInProgress} />
        </div>

        {state.prefStatus === 'loading' ? (
          <ModelPickerSkeleton rows={3} label="Loading your AI model preference…" />
        ) : (
          <fieldset
            aria-labelledby={legendId}
            aria-busy={saving || state.catalogStatus === 'loading'}
            disabled={saving}
            className="min-w-0"
          >
            <legend id={legendId} className="mb-3 text-sm font-semibold text-text-primary">
              Model for new requests
            </legend>
            <div className="space-y-3">
              <ModelOptionCard
                groupName={groupName}
                value={AUTO_CHOICE}
                title="Auto — use Languon’s default"
                context={autoContext(state)}
                description="Languon picks an enabled default for you. It may switch to a different default later — your preference stays Auto."
                availability="available"
                checked={state.draft === AUTO_CHOICE}
                isSaved={dirty && saved?.choice === AUTO_CHOICE}
                onSelect={store.selectDraft}
              />

              {state.catalogStatus === 'loading' ? (
                <ModelPickerSkeleton rows={3} label="Loading available models…" />
              ) : null}

              {state.catalogStatus === 'error' ? (
                <div
                  role="alert"
                  className="radius-md flex flex-col gap-3 border border-danger-default bg-danger-subtle p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <p className="flex items-start gap-2 text-sm text-text-primary">
                    <AlertTriangleIcon
                      aria-hidden="true"
                      className="mt-0.5 h-4 w-4 shrink-0 text-danger-default"
                    />
                    <span>
                      <span className="font-semibold">Couldn’t load available models.</span>{' '}
                      Your saved preference is unchanged.
                    </span>
                  </p>
                  <Button
                    variant="secondary"
                    size="compact"
                    onClick={store.retryCatalog}
                    leadingIcon={<RefreshCwIcon aria-hidden="true" className="h-4 w-4" />}
                  >
                    Retry
                  </Button>
                </div>
              ) : null}

              {options.map((option) => (
                <ModelOptionCard
                  key={option.id}
                  groupName={groupName}
                  value={option.id}
                  title={option.name}
                  provider={option.provider}
                  description={option.description}
                  tasks={option.tasks}
                  availability={option.availability}
                  reason={option.unavailableReason}
                  checked={state.draft === option.id}
                  isSaved={dirty && saved?.choice === option.id}
                  disabled={option.availability === 'unavailable'}
                  onSelect={store.selectDraft}
                />
              ))}

              {noModels ? (
                <div className="radius-md flex flex-col items-start gap-3 border border-dashed border-border-strong bg-background-subtle p-4">
                  <p className="flex items-start gap-2 text-sm text-text-primary">
                    <ServerOffIcon
                      aria-hidden="true"
                      className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary"
                    />
                    <span>
                      <span className="font-semibold">No models are available right now.</span>{' '}
                      New AI requests can’t run until one is back, including with Auto. Your
                      preference is kept and stored practice still works.
                    </span>
                  </p>
                  <Button
                    variant="secondary"
                    size="compact"
                    onClick={store.retryCatalog}
                    leadingIcon={<RefreshCwIcon aria-hidden="true" className="h-4 w-4" />}
                  >
                    Check again
                  </Button>
                </div>
              ) : null}
            </div>
          </fieldset>
        )}

        <div
          className={`radius-md flex items-start gap-3 border p-4 ${
            creditsAvailable <= 0
              ? 'border-warning-default bg-warning-subtle'
              : 'border-border-default bg-background-subtle'
          }`}
        >
          <CoinsIcon
            aria-hidden="true"
            className={`mt-0.5 h-4 w-4 shrink-0 ${
              creditsAvailable <= 0 ? 'text-warning-default' : 'text-text-secondary'
            }`}
          />
          <div className="min-w-0 text-sm leading-relaxed text-text-secondary">
            {creditsAvailable <= 0 ? (
              <p className="font-semibold text-text-primary">
                You have 0 credits — you can still change this preference.
              </p>
            ) : null}
            <p>
              Changing your model is free. New AI requests may need credits;
              stored sentence practice, hints and reference answers stay
              available without an AI check. A reference answer is one valid
              translation, not a verdict on yours.
            </p>
            {onOpenCredits ? (
              <button
                type="button"
                onClick={onOpenCredits}
                className="radius-xs mt-1 inline-flex min-h-touch items-center font-medium text-primary-default underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              >
                View AI credits
                {creditsAvailable > 0 ? ` · ${formatCredits(creditsAvailable)} left` : ''}
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-border-default pt-4 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={store.save}
              loading={saving}
              disabled={!store.saveAllowed || state.saveStatus === 'conflict'}
            >
              {saving ? 'Saving…' : 'Save preference'}
            </Button>
            <Button
              variant="ghost"
              onClick={store.cancel}
              disabled={!dirty || saving}
            >
              Cancel changes
            </Button>
          </div>
          <p className="min-w-0 text-sm text-text-secondary" aria-hidden="true">
            {saving ? (
              'Saving your choice…'
            ) : state.saveStatus === 'saved' && !dirty ? (
              <span className="inline-flex items-center gap-1.5 text-success-default">
                <CheckCircle2Icon className="h-4 w-4" />
                Preference saved. New requests will use it.
              </span>
            ) : state.saveStatus === 'conflict' ? (
              'Review the change above before saving.'
            ) : !state.online && dirty ? (
              'Saving is available when you’re back online.'
            ) : dirty && state.draft && !findOption(state, state.draft)?.available && state.draft !== AUTO_CHOICE ? (
              'Choose an available option to save.'
            ) : dirty ? (
              'You have an unsaved change.'
            ) : (
              'No changes to save.'
            )}
          </p>
          <span className="sr-only" role="status" aria-live="polite">
            {liveMessage}
          </span>
        </div>
      </div>
    </SettingsSection>
  )
}

