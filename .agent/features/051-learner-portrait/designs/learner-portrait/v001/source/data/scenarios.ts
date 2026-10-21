import type { ScenarioId } from '../contexts/PrototypeContext';

export const SCENARIOS: { id: ScenarioId; label: string; description: string; route: string }[] = [
  { id: 'none', label: 'No portrait', description: 'First-time learner', route: '/' },
  { id: 'unfinished', label: 'Unfinished interview', description: 'Paused Oct 18 · expires Nov 1', route: '/' },
  { id: 'saved-off', label: 'Saved · not used', description: 'Approved, use is off', route: '/portrait' },
  { id: 'in-use', label: 'In use', description: 'Approved and enabled', route: '/portrait' },
  { id: 'expired', label: 'Expired interview', description: 'Draft expired, portrait kept', route: '/portrait' },
  { id: 'conflict', label: 'Stale-draft conflict', description: 'Changed on phone after draft began', route: '/portrait/review' },
  { id: 'large', label: 'Large portrait', description: 'Many facts, trimmed summary', route: '/portrait' },
];

export const DEMO_INPUTS: { label: string; text: string }[] = [
  { label: 'Clarification', text: 'What does examples first mean?' },
  { label: 'Conversational answer', text: 'Honestly I can read Spanish menus and articles fine, but I freeze when I have to speak with colleagues on calls.' },
  { label: 'Diagnosis mentioned', text: 'I have ADHD so long explanations make me lose focus.' },
  { label: 'Unrelated request', text: 'Can you write me an email to my landlord about the heating?' },
  { label: 'Switch to Spanish', text: '¿Podemos seguir en español? Switch to Spanish please.' },
  { label: 'Over 1,000 characters', text: 'I want to explain my whole learning history. '.repeat(24).trim() },
];

export const SCREEN_LINKS = [
  { label: 'Home card', route: '/' },
  { label: 'Settings section', route: '/settings' },
  { label: 'Introduction', route: '/portrait/intro' },
  { label: 'Interview', route: '/portrait/interview' },
  { label: 'Manual form', route: '/portrait/manual' },
  { label: 'Draft review', route: '/portrait/review' },
  { label: 'Portrait management', route: '/portrait' },
  { label: 'Learning-chat settings', route: '/texts/en-el-mercado' },
  { label: 'Knowledge', route: '/knowledge' },
];

