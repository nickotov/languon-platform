export type Dock = 'left' | 'right';
export type SheetState = 'collapsed' | 'partial' | 'full';
export type Viewport = 'desktop' | 'mobile390' | 'mobile320';
export type Theme = 'light' | 'dark';

/** Sentinel height meaning "fill the available vertical space". */
export const FULL_HEIGHT = 10000;

export interface AppUiState {
  page: string;
  sidebarCollapsed: boolean;
  dock: Dock;
  wide: boolean;
  /** Custom desktop widget height in px; null = default, FULL_HEIGHT = all available space. */
  widgetHeight: number | null;
  sheet: SheetState;
  selectMode: boolean;
  keyboardOpen: boolean;
  hasUnsavedEdits: boolean;
  showTranslation: boolean;
}

export interface Autoplay {
  send?: boolean;
  foldAfterMs?: number;
  focusComposer?: boolean;
}

export interface ScenarioMeta {
  id: string;
  label: string;
  group: string;
  viewport?: Viewport;
  theme?: Theme;
}

