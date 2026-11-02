export type MapStatus = 'Built' | 'Partial' | 'Concept' | 'Board';

export interface MapRow {
  id: string;
  topic: string;
  where: string;
  status: MapStatus;
  note?: string;
}

/** KS-01–KS-23 → where each requirement lives in the prototype. */
export const requirementsMap: MapRow[] = [
  { id: 'KS-01', topic: 'Context & goal', where: 'Workspace · AI-Native shell kept; blocks added into the sheet', status: 'Built' },
  { id: 'KS-02', topic: 'Workspace & navigation', where: 'Layout switch (Focus / Split / Chat), workbook line, mobile Document / Tutor tabs', status: 'Built' },
  { id: 'KS-03', topic: 'Draft, recovery, Save', where: 'Top bar save status · States board › Private recovery vs Save', status: 'Built', note: 'Sheets with only blocks can be saved.' },
  { id: 'KS-04', topic: 'Shared authoring chrome', where: 'BlockFrame + BlockMenu · side dialog / bottom sheet editor · Learner preview', status: 'Built' },
  { id: 'KS-05', topic: 'What the AI knows', where: 'Chat header context line, passage & reference chips', status: 'Built' },
  { id: 'KS-06', topic: 'Chat lifecycle & credits', where: 'Live: queued → reading → preparing → streaming, stop, retry · States board › Credits', status: 'Partial', note: 'Credit confirmation, insufficient credits and capacity are shown on the States board, not wired into the composer.' },
  { id: 'KS-07', topic: 'Review → Apply → Save', where: 'Scenario 2 · ProposalCard + full review · States board › Proposals', status: 'Built' },
  { id: 'KS-08', topic: 'Four presentation contexts', where: 'Blocks board (all six families × four contexts)', status: 'Board' },
  { id: 'KS-09', topic: 'Video block', where: 'Saved sheet · Video editor · Video unavailable scenario', status: 'Built', note: 'Demo clip has no speech, so no transcript.' },
  { id: 'KS-10', topic: 'Vocabulary block', where: 'Saved sheet · editor · Train preview · Save to dictionary…', status: 'Built' },
  { id: 'KS-11', topic: 'Bilingual text block', where: 'Saved sheet · editor · private translation (signed-in reader) · Save to Texts…', status: 'Built' },
  { id: 'KS-12', topic: 'Audio comprehension', where: 'Saved sheet · Audio editor (upload, generated speech, transcript timings)', status: 'Built', note: 'Recording is simulated with the browser voice.' },
  { id: 'KS-13', topic: 'Grammar block', where: 'Saved sheet · Grammar editor', status: 'Built' },
  { id: 'KS-14', topic: 'Exercises & feedback', where: 'Inline exercises in sheet, audio questions, learner preview', status: 'Built' },
  { id: 'KS-15', topic: 'Personal progress', where: 'Reader views · Mark complete · Updated since completion', status: 'Partial', note: 'Progress-loading state on the States board only.' },
  { id: 'KS-16', topic: 'Copying & library dialogs', where: 'Copy with media… · Save to dictionary / Texts · Insert from library', status: 'Built' },
  { id: 'KS-17', topic: 'Ordered workbook', where: 'Workbook line + outline with reorder', status: 'Partial', note: 'Workbook copy/delete flows not designed.' },
  { id: 'KS-18', topic: 'Sharing & roles', where: 'Sharing scenarios: signed-in, anonymous, updated, revoked, mobile', status: 'Built' },
  { id: 'KS-19', topic: 'State board', where: 'States board', status: 'Board' },
  { id: 'KS-20', topic: 'Visual, responsive, a11y', where: 'Dark theme scenario · 1100 / 900 / 390 viewports', status: 'Partial', note: '320 px pass and a full keyboard audit remain.' },
  { id: 'KS-21', topic: 'Required frames', where: 'Prototype panel scenarios + boards', status: 'Built' },
  { id: 'KS-22', topic: 'Atomic AI field actions', where: 'Vocabulary editor › Check translation / Generate Russian translation', status: 'Built', note: 'Other families reuse the mechanism later.' },
  { id: 'KS-23', topic: 'Future concepts', where: 'Future board', status: 'Concept' },
];

