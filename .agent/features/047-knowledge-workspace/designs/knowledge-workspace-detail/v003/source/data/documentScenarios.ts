import type { DocScenario } from '../types/document';

export const docScenarios: DocScenario[] = [
  { id: 'new', label: '1 · New Untitled draft', group: 'Document' },
  { id: 'saved-edits', label: '2 · Saved + unsaved edits, chat docked', group: 'Document' },
  { id: 'chat-half', label: 'Narrow desktop · chat at half width', group: 'Layout', viewport: 'narrow' },
  { id: 'chat-closed', label: 'Chat closed', group: 'Layout' },
  { id: 'chat-floating', label: 'Chat detached (floating)', group: 'Layout' },
  { id: 'proposal', label: '3 · AI proposal review', group: 'Tutor' },
  { id: 'proposal-changed', label: '3b · Target changed → compare', group: 'Tutor' },
  { id: 'limits', label: 'Character limit errors', group: 'Tutor' },
  { id: 'conflict', label: '4 · Two devices edited the draft', group: 'States' },
  { id: 'history', label: '5 · Revision history & restore', group: 'States' },
  { id: 'loading', label: 'Loading document', group: 'States' },
  { id: 'load-error', label: 'Couldn’t open document', group: 'States' },
  { id: 'mobile-closed', label: 'Mobile · chat closed', group: 'Mobile', viewport: 'mobile' },
  { id: 'mobile-open', label: 'Mobile · chat sheet open', group: 'Mobile', viewport: 'mobile' },
  { id: 'dark', label: 'Dark mode', group: 'Theme', dark: true },
];

