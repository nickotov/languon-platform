import React, { createContext, useContext } from 'react';
import type { TutorApi } from '../hooks/useTutor';
import type { AppUiState, Dock, SheetState } from '../types/app';

export type Platform = 'desktop' | 'mobile';

export interface TutorContextValue {
  tutor: TutorApi;
  ui: AppUiState;
  platform: Platform;
  setUi: (patch: Partial<AppUiState>) => void;
  setDock: (dock: Dock) => void;
  setSheet: (sheet: SheetState) => void;
  onSelectFromPage: () => void;
  onOpenNote: (noteId: string) => void;
  canWiden: boolean;
  composerRef: React.RefObject<HTMLTextAreaElement>;
  launcherRef: React.RefObject<HTMLButtonElement>;
}

const TutorContext = createContext<TutorContextValue | null>(null);

export function TutorProvider({ value, children }: { value: TutorContextValue; children: React.ReactNode }) {
  return <TutorContext.Provider value={value}>{children}</TutorContext.Provider>;
}

export function useTutorContext(): TutorContextValue {
  const ctx = useContext(TutorContext);
  if (!ctx) throw new Error('useTutorContext must be used within TutorProvider');
  return ctx;
}

