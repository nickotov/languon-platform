import type { ModelIdentity, ModelOption } from '../types/modelPreference'

/**
 * Illustrative prototype fixtures. The real catalog is dynamic and supplied by
 * the product; names, descriptions and availability here are examples only.
 */
export const modelCatalog: ModelOption[] = [
  {
    id: 'deepseek-chat',
    name: 'DeepSeek Chat',
    provider: 'DeepSeek',
    description:
      'General-purpose model for word explanations, example sentences and translation feedback.',
    tasks: { dictionary: true, sentences: true, translationCheck: true },
    available: true,
  },
  {
    id: 'gemini-2-5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'Google',
    description:
      'Google’s Gemini model, suited to short dictionary entries and sentence drafts.',
    tasks: { dictionary: true, sentences: true, translationCheck: true },
    available: true,
  },
  {
    id: 'gemini-2-5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'Google',
    description:
      'Writes longer, more detailed usage notes for dictionary entries and sentences.',
    tasks: { dictionary: true, sentences: true, translationCheck: false },
    available: true,
  },
  {
    id: 'mistral-large-multilingual',
    name: 'Mistral Large Multilingual (Extended Context Preview)',
    provider: 'Mistral AI · hosted in the European Union',
    description:
      'Multilingual model with broad coverage of European languages and longer example passages.',
    tasks: { dictionary: true, sentences: true, translationCheck: true },
    available: true,
  },
]

/** What Auto resolves to in the fixtures, when that information is supplied. */
export const defaultAutoModel: ModelIdentity = {
  id: 'deepseek-chat',
  name: 'DeepSeek Chat',
  provider: 'DeepSeek',
}

export const unavailableReasons = {
  providerDown:
    'Temporarily unavailable — the provider isn’t responding. Choose Auto or another model for now.',
  removed: 'No longer offered in Languon’s current model list.',
  changedDuringSave: 'Became unavailable while you were choosing.',
}

