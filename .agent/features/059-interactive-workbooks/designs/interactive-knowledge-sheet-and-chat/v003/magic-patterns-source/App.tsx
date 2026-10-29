import React, { useEffect, useState } from 'react';
import type { Theme } from './types/app';
import type { Direction, DocViewport } from './types/document';
import { docScenarios } from './data/documentScenarios';
import { useMediaQuery } from './hooks/useMediaQuery';
import { WorkspaceDirectionProvider } from './contexts/WorkspaceDirectionContext';
import { DocWorkspace } from './components/document/DocWorkspace';
import { PhoneFrame } from './components/demo/PhoneFrame';
import type { BoardId } from './components/document/DocPrototypeControls';
import { DesignBoards } from './components/boards/DesignBoards';

const FRAMED: Partial<Record<DocViewport, number>> = { narrow: 1100, tablet: 900 };

/** The AI-Native workspace (direction B) is the established shell the learning blocks extend. */
const direction: Direction = 'ai-native';

export function App() {
  const [scenarioId, setScenarioId] = useState('saved-edits');
  const [viewport, setViewport] = useState<DocViewport>('desktop');
  const [theme, setTheme] = useState<Theme>('light');
  const [restart, setRestart] = useState(0);
  const [board, setBoard] = useState<BoardId>('workspace');
  const realMobile = useMediaQuery('(max-width: 767px)');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const selectScenario = (id: string) => {
    const meta = docScenarios.find((s) => s.id === id);
    if (!meta) return;
    setScenarioId(id);
    setBoard('workspace');
    setTheme(meta.dark ? 'dark' : 'light');
    setViewport(meta.viewport ?? (viewport === 'mobile' ? 'desktop' : viewport));
    setRestart((r) => r + 1);
  };

  const mobile = realMobile || viewport === 'mobile';
  const framed = !realMobile && viewport === 'mobile';
  const frameWidth = !realMobile ? FRAMED[viewport] : undefined;

  const workspace = (
    <div className="relative h-full w-full">
    <DocWorkspace
      key={`${scenarioId}-${viewport}-${restart}-${mobile}`}
      scenarioId={scenarioId}
      mobile={mobile}
      framed={framed}
      controls={{
        scenarioId,
        viewport,
        theme,
        direction,
        realMobile,
        onScenario: selectScenario,
        onViewport: setViewport,
        onTheme: setTheme,
        onDirection: () => undefined,
        board,
        onBoard: setBoard,
        onRestart: () => setRestart((r) => r + 1),
      }}
    />
    {board !== 'workspace' && <DesignBoards board={board} mobile={mobile} />}
    </div>
  );

  return (
    <WorkspaceDirectionProvider direction={direction}>
      <div className="h-screen w-full overflow-hidden bg-background-canvas font-body text-text-primary antialiased">
        {framed ? (
          <PhoneFrame width={390}>{workspace}</PhoneFrame>
        ) : frameWidth ? (
          <div className="flex h-full w-full items-center justify-center bg-background-subtle p-4">
            <div style={{ maxWidth: frameWidth }} className="h-full w-full overflow-hidden rounded-xl border border-border-default shadow-lg">
              {workspace}
            </div>
          </div>
        ) : (
          workspace
        )}
      </div>
    </WorkspaceDirectionProvider>
  );
}

