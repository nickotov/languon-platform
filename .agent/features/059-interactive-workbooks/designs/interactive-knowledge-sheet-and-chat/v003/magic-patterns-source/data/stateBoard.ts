export type StateTone = 'neutral' | 'progress' | 'success' | 'warning' | 'danger' | 'private';

export interface StateTile {
  label: string;
  tone: StateTone;
  title: string;
  body?: string;
  actions?: { label: string; primary?: boolean }[];
}

export interface StateGroup {
  id: string;
  title: string;
  note?: string;
  tiles: StateTile[];
}

/** KS-19 recovery and availability states. Copy is the product copy; actions show what the person can do next. */
export const stateGroups: StateGroup[] = [
  {
    id: 'st-sheet',
    title: 'Sheet loading',
    tiles: [
      { label: 'Empty', tone: 'neutral', title: 'Start writing, or add a block', body: 'Add block · Insert from library. Starter suggestions disappear once there’s material.' },
      { label: 'Loading', tone: 'progress', title: 'Opening “Le ménage et les tâches”…' },
      { label: 'Recoverable error', tone: 'danger', title: 'This sheet didn’t open', body: 'Your recovered edits are safe on the server.', actions: [{ label: 'Try again', primary: true }, { label: 'Back to Knowledge' }] },
      { label: 'Ready', tone: 'success', title: 'Saved 14:02', body: 'Shared readers see this version.' },
    ],
  },
  {
    id: 'st-draft',
    title: 'Private recovery vs explicit Save',
    note: 'Recovery keeps working edits private. Only Save updates the material shared readers see.',
    tiles: [
      { label: 'Recovering', tone: 'progress', title: 'Unsaved changes · recovering privately', body: 'Not visible to readers until you Save.' },
      { label: 'Recovery failed', tone: 'warning', title: 'Recovery paused — edits kept in this tab', body: 'Keep this tab open, or Save now.', actions: [{ label: 'Save now', primary: true }, { label: 'Retry recovery' }] },
      { label: 'Save failed', tone: 'danger', title: 'Couldn’t save', body: 'Nothing was lost. Readers still see the 14:02 version.', actions: [{ label: 'Retry', primary: true }] },
      { label: 'Version conflict', tone: 'warning', title: 'Edited on another device', body: 'Both versions are kept. Compare them before choosing.', actions: [{ label: 'Compare', primary: true }, { label: 'Keep both' }] },
    ],
  },
  {
    id: 'st-select',
    title: 'Selection, dragging and menus',
    tiles: [
      { label: 'Prose selection', tone: 'neutral', title: 'Ask · Explain · Correct · Translate · …', body: 'Only for a non-empty prose selection. A caret or a selected block never shows it.' },
      { label: 'Whole-block selection', tone: 'neutral', title: 'Indigo outline around “Chores from class”', body: 'Alt+↑/↓ moves it. Delete removes it with Undo. Answers inside are untouched.' },
      { label: 'Dragging', tone: 'neutral', title: 'Drop here — between “Grammar” and “Bilingual text”', body: 'The moving block dims; one insertion line shows where it lands.' },
      { label: 'Settings menu', tone: 'neutral', title: 'Edit · Copy · Duplicate · Move · Train · Save to dictionary… · Delete', body: 'Unavailable positions say why (“Already first”).' },
    ],
  },
  {
    id: 'st-ai',
    title: 'Tutor request lifecycle',
    note: 'The request belongs to the server: closing chat or changing layout doesn’t start a new one. Only Stop ends it.',
    tiles: [
      { label: 'Queued', tone: 'progress', title: 'Waiting to start…' },
      { label: 'Reading', tone: 'progress', title: 'Reading your sheet…', body: 'Snapshot of the whole sheet, including unsaved edits.' },
      { label: 'Preparing blocks', tone: 'progress', title: 'Preparing vocabulary…' },
      { label: 'Stopped', tone: 'neutral', title: 'You stopped this reply — showing what arrived.', actions: [{ label: 'Retry' }] },
      { label: 'Interrupted', tone: 'warning', title: 'The connection dropped — showing what arrived.', body: 'Your question and attachments are kept in the composer.', actions: [{ label: 'Retry', primary: true }] },
      { label: 'Output limit', tone: 'neutral', title: 'The reply reached its length limit.', body: 'Continue is a new request and uses credits.', actions: [{ label: 'Continue' }] },
      { label: 'Source changed', tone: 'neutral', title: 'Sheet updated since this reply', body: 'Earlier replies stay linked to the material they answered.' },
    ],
  },
  {
    id: 'st-credits',
    title: 'Credits and availability',
    note: 'The person asking pays. Prepared answers, hints, playback and saving prepared material are free.',
    tiles: [
      { label: 'Confirm before sending', tone: 'warning', title: 'Low allowance: about 3 credits left', body: 'This request may use up to 2. Replies may be shorter than usual.', actions: [{ label: 'Send', primary: true }, { label: 'Cancel' }] },
      { label: 'Insufficient credits', tone: 'danger', title: 'Not enough credits for this request', body: 'Your question is kept. Prepared answers and hints still work.', actions: [{ label: 'View balance', primary: true }] },
      { label: 'AI temporarily unavailable', tone: 'warning', title: 'The tutor is unavailable right now', body: 'Nothing was charged. Your question is kept.', actions: [{ label: 'Try again' }] },
      { label: 'High demand', tone: 'warning', title: 'The tutor is busy — your request is waiting', body: 'It starts automatically; you can keep writing.' },
      { label: 'Too large to send', tone: 'danger', title: 'The sheet and attachments are over the limit', body: '41,200 of 40,000 characters. Select a passage, or remove a copied reference.' },
    ],
  },
  {
    id: 'st-media',
    title: 'Content and media availability',
    tiles: [
      { label: 'Missing translation', tone: 'warning', title: 'No English translation was prepared for this text.' },
      { label: 'Missing transcript', tone: 'neutral', title: 'No transcript — questions can’t point to a passage.' },
      { label: 'Video unavailable', tone: 'warning', title: 'This video may have been removed or made private.', actions: [{ label: 'Open on source site' }] },
      { label: 'Upload failed', tone: 'danger', title: 'Upload failed. Your other changes are kept.', actions: [{ label: 'Retry', primary: true }] },
      { label: 'Speech unavailable', tone: 'warning', title: 'Speech isn’t available for this item right now.', actions: [{ label: 'Retry' }] },
    ],
  },
  {
    id: 'st-nav',
    title: 'Navigation, copies and revisions',
    tiles: [
      { label: 'Unsaved navigation', tone: 'warning', title: 'Leave with unsaved changes?', body: 'Your edits stay recoverable, but readers won’t see them.', actions: [{ label: 'Save and leave', primary: true }, { label: 'Leave' }, { label: 'Stay' }] },
      { label: 'Stale copy destination', tone: 'warning', title: '“Dans la cuisine” was deleted after this list opened.', body: 'Nothing was copied. Choose another destination.' },
      { label: 'Revision restore', tone: 'warning', title: 'Restore the 4 May version?', body: 'Your current unsaved edits are kept as a revision first.', actions: [{ label: 'Restore', primary: true }, { label: 'Cancel' }] },
    ],
  },
  {
    id: 'st-practice',
    title: 'Private practice states',
    note: 'Opening isn’t an attempt; seeing an answer isn’t answering correctly.',
    tiles: [
      { label: 'Progress loading', tone: 'progress', title: 'Loading your answers…', body: 'Hint and Show answer wait until they can be recorded.' },
      { label: 'Answered · not checked', tone: 'private', title: 'Your free-text answer is saved', body: 'Not marked right or wrong until you check it.' },
      { label: 'Hint used', tone: 'private', title: 'Relevant passage', body: '“Non, désolée, pour ça il faut aller au supermarché.” · Replay 0:19' },
      { label: 'Valid alternative', tone: 'success', title: 'Correct · different wording', body: 'Your sentence is natural; the prepared answer is another option.' },
      { label: 'Needs revision', tone: 'warning', title: 'Close — check the article', body: '“Ménage” is masculine: le ménage.' },
      { label: 'AI check unavailable', tone: 'neutral', title: 'AI check is unavailable right now', body: 'Your answer is kept — compare it with the prepared answer.', actions: [{ label: 'Show answer' }] },
    ],
  },
  {
    id: 'st-access',
    title: 'Sharing and access',
    tiles: [
      { label: 'Anonymous reader', tone: 'neutral', title: 'Read and practise — progress isn’t saved', actions: [{ label: 'Sign in', primary: true }] },
      { label: 'Signed-in reader', tone: 'private', title: 'Your answers and translations are private to you', actions: [{ label: 'Make a copy to edit' }] },
      { label: 'Updated since completion', tone: 'warning', title: 'Completed · Updated since you completed it' },
      { label: 'Access revoked', tone: 'neutral', title: 'This link no longer works', body: 'No excerpts are kept. Copies you made earlier remain in your Knowledge.' },
    ],
  },
];

