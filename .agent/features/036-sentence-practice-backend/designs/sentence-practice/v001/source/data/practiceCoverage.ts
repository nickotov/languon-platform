export interface PracticeCoverageRow {
  id: string
  title: string
  where: string
}

export const practiceCoverage: PracticeCoverageRow[] = [
  { id: 'SP-01', title: 'Entry and setup', where: 'Learn menu → Sentence practice (owner, reader, anonymous); gallery 1–7' },
  { id: 'SP-02', title: 'Ownership, saved reuse, progress', where: 'Shared reader setup, saved-first reuse, outdated sentence, progress strip; gallery 5, 19, 21' },
  { id: 'SP-03', title: 'Active sentence and hints', where: 'Live practice; gallery 9 (one/repeated/multiple/phrase/long/Japanese/Arabic)' },
  { id: 'SP-04', title: 'Draft and default AI check', where: 'Live practice; gallery 10–11, 14' },
  { id: 'SP-05', title: 'AI result and corrections', where: 'Live check; gallery 12 and 25 (Russian feedback)' },
  { id: 'SP-06', title: 'Free manual reference', where: 'Show reference answer — free; gallery 13–14' },
  { id: 'SP-07', title: 'Async work and recovery', where: 'Review aids for outcomes; gallery 8, 11, 15–18' },
  { id: 'SP-08', title: 'Personal history and summary', where: 'Learn → My practice history, Summary button; gallery 20–21' },
  { id: 'SP-09', title: 'Full screen, dialog, continuity', where: 'Start in full screen / dialog, toggle, leave confirmation; gallery 22–24' },
  { id: 'SP-10', title: 'State inventory', where: 'This page, items 1–25' },
  { id: 'SP-11', title: 'Accessibility', where: 'All screens; gallery 25 notes' },
]

export const practiceOpenQuestions: string[] = [
  'Flashcard convention for Escape was not available to us. Assumed: Escape first leaves browser full screen, then switches to the dialog; only Close ends practice. Please confirm against the existing flashcard practice.',
  'AI preferences is shown as a placeholder sheet layered over practice; the real profile screen and whether it can open in place need confirmation.',
  'The answer limit is assumed to be 400 characters; replace with the backend value.',
  'Sign-in recovery is simulated in place; confirm the real redirect returns to the shared dictionary and reopens the Learn menu.',
  'Leaving with a running job: we state it isn’t cancelled and its result is saved if it finishes. Confirm the backend records results for jobs whose UI was closed.',
  'Flashcards is shown as a disabled menu item because that flow is outside this prototype.',
]

