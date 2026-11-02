import type { ScenarioMeta } from '../types/app';

export const scenarios: ScenarioMeta[] = [
  { id: 'desktop', label: 'Text page · widget upper-right', group: 'Desktop' },
  { id: 'dock-left', label: 'Docked left · sidebar expanded', group: 'Desktop' },
  { id: 'dock-left-collapsed', label: 'Docked left · sidebar collapsed', group: 'Desktop' },
  { id: 'folded-responding', label: 'Folded while responding → ready', group: 'Desktop' },
  { id: 'selection', label: 'Selection → quote → question', group: 'Conversation' },
  { id: 'streaming', label: 'Long streaming answer', group: 'Conversation' },
  { id: 'dictionary', label: 'Dictionary comparison', group: 'Conversation' },
  { id: 'prefs-history', label: 'Preferences & history', group: 'Conversation' },
  { id: 'knowledge-draft', label: 'Knowledge draft review', group: 'Knowledge' },
  { id: 'note-conflict', label: 'Note update conflict', group: 'Knowledge' },
  { id: 'mobile-collapsed', label: 'Sheet collapsed', group: 'Mobile', viewport: 'mobile390' },
  { id: 'mobile-partial', label: 'Sheet partial height', group: 'Mobile', viewport: 'mobile390' },
  { id: 'mobile-full', label: 'Sheet expanded', group: 'Mobile', viewport: 'mobile390' },
  { id: 'mobile-keyboard', label: 'Keyboard open', group: 'Mobile', viewport: 'mobile390' },
  { id: 'error-reconnect', label: 'Reconnecting mid-answer', group: 'States' },
  { id: 'error-incomplete', label: 'Incomplete answer + Retry', group: 'States' },
  { id: 'error-credits', label: 'Insufficient credits', group: 'States' },
  { id: 'error-model', label: 'Model unavailable', group: 'States' },
  { id: 'error-source', label: 'Source no longer accessible', group: 'States' },
  { id: 'error-save', label: 'Draft save failed', group: 'States' },
  { id: 'dark', label: 'Dark mode', group: 'States', theme: 'dark' },
];

