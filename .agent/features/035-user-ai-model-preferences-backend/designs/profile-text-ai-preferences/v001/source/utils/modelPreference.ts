import {
  defaultAutoModel,
  modelCatalog,
  unavailableReasons,
} from '../data/aiModels'
import {
  AUTO_CHOICE,
  type ModelIdentity,
  type ModelOption,
  type ModelPreferenceState,
  type ModelScenario,
  type SavedPreference,
  type SaveOutcome,
} from '../types/modelPreference'

export const AUTO_LABEL = 'Auto — use Languon’s default'

const SAVED_AT = '2026-09-28T10:20:00Z'

function identityOf(option: ModelOption): ModelIdentity {
  return { id: option.id, name: option.name, provider: option.provider }
}

function catalogEntry(id: string): ModelOption {
  const found = modelCatalog.find((option) => option.id === id)
  if (!found) throw new Error(`Unknown fixture model ${id}`)
  return found
}

export function savedAuto(): SavedPreference {
  return { choice: AUTO_CHOICE, savedModel: null, updatedAt: SAVED_AT }
}

export function savedModel(id: string): SavedPreference {
  return {
    choice: id,
    savedModel: identityOf(catalogEntry(id)),
    updatedAt: SAVED_AT,
  }
}

function withAvailability(
  id: string,
  available: boolean,
  reason?: string,
): ModelOption[] {
  return modelCatalog.map((option) =>
    option.id === id
      ? { ...option, available, unavailableReason: reason }
      : option,
  )
}

/** Builds the starting state for each reviewable scenario. */
export function seedModelPreference(
  scenario: ModelScenario,
): ModelPreferenceState {
  const base: ModelPreferenceState = {
    prefStatus: 'ready',
    catalogStatus: 'ready',
    catalog: modelCatalog,
    saved: savedAuto(),
    autoDefault: defaultAutoModel,
    draft: AUTO_CHOICE,
    saveStatus: 'idle',
    conflictBase: null,
    rejectedModel: null,
    online: true,
  }

  switch (scenario) {
    case 'explicit-saved':
      return { ...base, saved: savedModel('gemini-2-5-flash'), draft: 'gemini-2-5-flash' }
    case 'loading':
      return {
        ...base,
        prefStatus: 'loading',
        catalogStatus: 'loading',
        catalog: [],
        saved: null,
        autoDefault: null,
        draft: null,
      }
    case 'catalog-loading':
      return { ...base, catalogStatus: 'loading', catalog: [], autoDefault: null }
    case 'catalog-error':
      return {
        ...base,
        catalogStatus: 'error',
        catalog: [],
        autoDefault: null,
        saved: savedModel('gemini-2-5-flash'),
        draft: 'gemini-2-5-flash',
      }
    case 'no-models':
      return { ...base, catalog: [], autoDefault: null }
    case 'one-unavailable':
      return {
        ...base,
        catalog: withAvailability(
          'mistral-large-multilingual',
          false,
          unavailableReasons.providerDown,
        ),
        saved: savedModel('deepseek-chat'),
        draft: 'deepseek-chat',
      }
    case 'saved-unavailable':
      return {
        ...base,
        catalog: modelCatalog.filter((option) => option.id !== 'gemini-2-5-pro'),
        saved: savedModel('gemini-2-5-pro'),
        draft: 'gemini-2-5-pro',
      }
    case 'draft':
    case 'task-in-progress':
    case 'unsaved-navigation':
      return { ...base, draft: 'gemini-2-5-flash' }
    case 'saving':
      return { ...base, draft: 'gemini-2-5-flash', saveStatus: 'saving' }
    case 'saved-confirmation':
      return {
        ...base,
        saved: { ...savedModel('gemini-2-5-flash'), updatedAt: new Date().toISOString() },
        draft: 'gemini-2-5-flash',
        saveStatus: 'saved',
      }
    case 'save-network-error':
      return { ...base, draft: 'gemini-2-5-flash', saveStatus: 'network_error' }
    case 'save-rejected': {
      const rejected = catalogEntry('mistral-large-multilingual')
      return {
        ...base,
        catalog: withAvailability(
          rejected.id,
          false,
          unavailableReasons.changedDuringSave,
        ),
        draft: rejected.id,
        saveStatus: 'rejected',
        rejectedModel: identityOf(rejected),
      }
    }
    case 'conflict':
      return {
        ...base,
        saved: { ...savedModel('gemini-2-5-pro'), updatedElsewhere: true },
        conflictBase: AUTO_CHOICE,
        draft: 'gemini-2-5-flash',
        saveStatus: 'conflict',
      }
    case 'offline':
      return { ...base, draft: 'gemini-2-5-flash', online: false }
    default:
      return base
  }
}

export function findOption(
  state: ModelPreferenceState,
  id: string,
): ModelOption | undefined {
  return state.catalog.find((option) => option.id === id)
}

/** Friendly label for any choice, including one that left the catalog. */
export function choiceLabel(state: ModelPreferenceState, id: string): string {
  if (id === AUTO_CHOICE) return AUTO_LABEL
  const option = findOption(state, id)
  if (option) return option.name
  if (state.saved?.savedModel?.id === id) return state.saved.savedModel.name
  if (state.rejectedModel?.id === id) return state.rejectedModel.name
  return 'Previously selected model'
}

export function choiceProvider(
  state: ModelPreferenceState,
  id: string,
): string | null {
  if (id === AUTO_CHOICE) return null
  const option = findOption(state, id)
  if (option) return option.provider
  if (state.saved?.savedModel?.id === id) return state.saved.savedModel.provider
  return null
}

export function isSelectable(state: ModelPreferenceState, id: string): boolean {
  if (id === AUTO_CHOICE) return true
  return Boolean(findOption(state, id)?.available)
}

export function isDirty(state: ModelPreferenceState): boolean {
  return Boolean(
    state.saved && state.draft !== null && state.draft !== state.saved.choice,
  )
}

export function canSave(state: ModelPreferenceState): boolean {
  return (
    state.prefStatus === 'ready' &&
    state.online &&
    state.saveStatus !== 'saving' &&
    state.draft !== null &&
    isDirty(state) &&
    isSelectable(state, state.draft)
  )
}

export function availableCount(state: ModelPreferenceState): number {
  return state.catalog.filter((option) => option.available).length
}

/** Human-readable description of what Auto resolves to right now. */
export function autoContext(state: ModelPreferenceState): string {
  if (state.catalogStatus === 'loading') return 'Checking which model Auto uses…'
  if (state.catalogStatus === 'error')
    return 'Can’t check which model Auto uses right now.'
  if (availableCount(state) === 0)
    return 'No model is available for Auto right now.'
  if (state.autoDefault)
    return `Currently uses ${state.autoDefault.name} (${state.autoDefault.provider}).`
  return 'The current default isn’t available to show right now.'
}

/** Saved explicit choice that is now unavailable or absent from the list. */
export function savedChoiceUnavailable(state: ModelPreferenceState): boolean {
  const choice = state.saved?.choice
  if (!choice || choice === AUTO_CHOICE || state.catalogStatus !== 'ready')
    return false
  const option = findOption(state, choice)
  return !option || !option.available
}

function commit(state: ModelPreferenceState): ModelPreferenceState {
  const draft = state.draft ?? AUTO_CHOICE
  const option = findOption(state, draft)
  return {
    ...state,
    saved: {
      choice: draft,
      savedModel: option ? identityOf(option) : null,
      updatedAt: new Date().toISOString(),
    },
    saveStatus: 'saved',
    conflictBase: null,
    rejectedModel: null,
  }
}

export function resolveSave(
  state: ModelPreferenceState,
  outcome: SaveOutcome,
): ModelPreferenceState {
  const draft = state.draft ?? AUTO_CHOICE

  if (outcome === 'network-error') return { ...state, saveStatus: 'network_error' }

  if (outcome === 'rejected-unavailable' && draft !== AUTO_CHOICE) {
    const option = findOption(state, draft)
    return {
      ...state,
      catalog: state.catalog.map((item) =>
        item.id === draft
          ? {
              ...item,
              available: false,
              unavailableReason: unavailableReasons.changedDuringSave,
            }
          : item,
      ),
      saveStatus: 'rejected',
      rejectedModel: option ? identityOf(option) : null,
    }
  }

  if (outcome === 'conflict' && state.saved) {
    const startedFrom = state.saved.choice
    const candidates = [
      ...state.catalog.filter((item) => item.available).map((item) => item.id),
      AUTO_CHOICE,
    ].filter((id) => id !== draft && id !== startedFrom)
    const latest = candidates[candidates.length > 1 ? 1 : 0] ?? AUTO_CHOICE
    const option = findOption(state, latest)
    return {
      ...state,
      saved: {
        choice: latest,
        savedModel: option ? identityOf(option) : null,
        updatedAt: new Date().toISOString(),
        updatedElsewhere: true,
      },
      conflictBase: startedFrom,
      saveStatus: 'conflict',
    }
  }

  return commit(state)
}

export function loadedCatalogState(
  state: ModelPreferenceState,
): ModelPreferenceState {
  return {
    ...state,
    catalogStatus: 'ready',
    catalog: modelCatalog,
    autoDefault: defaultAutoModel,
  }
}

