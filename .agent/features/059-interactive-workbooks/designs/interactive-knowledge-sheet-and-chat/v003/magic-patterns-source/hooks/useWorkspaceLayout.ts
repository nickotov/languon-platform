import { useCallback, useEffect, useRef, useState } from 'react';
import type { LayoutMode } from '../types/document';

const KEY = 'languon.knowledge.layout.v1';
export const NAV_RAIL = 64;
export const MIN_CHAT = 340;
export const MAX_CHAT = 560;
export const MIN_DOC = 480;

interface Stored {
  mode: LayoutMode;
  width: number | null;
}

function read(): Stored | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored;
    return ['focus', 'split', 'chat'].includes(parsed.mode) ? parsed : null;
  } catch {
    return null;
  }
}

/** Layout mode and tutor width, remembered in the browser once the user changes them. */
export function useWorkspaceLayout(seedMode: LayoutMode, explicit: boolean) {
  const [stored] = useState(read);
  const [mode, setModeState] = useState<LayoutMode>(explicit || !stored ? seedMode : stored.mode);
  const [width, setWidthState] = useState<number | null>(stored?.width ?? null);
  const touched = useRef(false);

  useEffect(() => {
    if (!touched.current) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ mode, width }));
    } catch {
      /* storage unavailable */
    }
  }, [mode, width]);

  const setMode = useCallback((m: LayoutMode) => {
    touched.current = true;
    setModeState(m);
  }, []);

  const setWidth = useCallback((w: number | null) => {
    touched.current = true;
    setWidthState(w);
  }, []);

  return { mode, setMode, width, setWidth };
}

export interface ResolvedLayout {
  /** inline = beside the document, overlay = non-modal panel over it, none = hidden. */
  kind: 'inline' | 'overlay' | 'none';
  chatWidth: number;
  resizable: boolean;
  minWidth: number;
  maxWidth: number;
  allowChatMode: boolean;
}

/** Breakpoint rules for the tutor panel, given the width beside the nav rail. */
export function resolveLayout(areaWidth: number, mode: LayoutMode, width: number | null): ResolvedLayout {
  const vw = areaWidth + NAV_RAIL;
  const allowChatMode = vw >= 1024;
  const base = { resizable: false, minWidth: MIN_CHAT, maxWidth: MAX_CHAT, allowChatMode };
  if (mode === 'focus' || areaWidth === 0) return { ...base, kind: 'none', chatWidth: 0 };
  if (vw < 1024) return { ...base, kind: 'overlay', chatWidth: Math.min(380, areaWidth - 24) };
  const chatFocus = Math.max(MIN_CHAT, Math.min(Math.round(areaWidth * 0.6), areaWidth - MIN_DOC));
  if (mode === 'chat') return { ...base, kind: 'inline', chatWidth: chatFocus };
  if (vw < 1280) return { ...base, kind: 'inline', chatWidth: MIN_CHAT };
  const maxWidth = Math.max(MIN_CHAT, Math.min(MAX_CHAT, areaWidth - MIN_DOC));
  const fallback = vw < 1440 ? 360 : 400;
  const chatWidth = Math.max(MIN_CHAT, Math.min(width ?? fallback, maxWidth));
  return { ...base, kind: 'inline', chatWidth, resizable: true, maxWidth };
}

