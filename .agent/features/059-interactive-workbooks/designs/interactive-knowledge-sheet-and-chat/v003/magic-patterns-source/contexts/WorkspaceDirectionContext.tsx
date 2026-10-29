import React, { createContext, useContext } from 'react';
import type { Direction } from '../types/document';

const DirectionContext = createContext<Direction>('ai-native');

export function WorkspaceDirectionProvider({ direction, children }: { direction: Direction; children: React.ReactNode }) {
  return <DirectionContext.Provider value={direction}>{children}</DirectionContext.Provider>;
}

/** Which design direction the workspace renders: A minimal, B AI-native, C editorial. */
export function useDirection(): Direction {
  return useContext(DirectionContext);
}

