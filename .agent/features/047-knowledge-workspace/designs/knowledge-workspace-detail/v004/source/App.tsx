import React, { useEffect, useState } from 'react';
import type { Theme } from './types/app';
import type { Direction, DocViewport } from './types/document';
import { docScenarios } from './data/documentScenarios';
import { useMediaQuery } from './hooks/useMediaQuery';
import { WorkspaceDirectionProvider } from './contexts/WorkspaceDirectionContext';
import { DocWorkspace } from './components/document/DocWorkspace';
import { PhoneFrame } from './components/demo/PhoneFrame';

interface AppProps {
  /** Which design direction to show: A Refined Minimal, B AI-Native Workspace, C Content-First Editorial. */
  designDirection?: 'minimal' | 'ai-native' | 'editorial';
}

const FRAMED: Partial<Record<DocViewport, number>> = { narrow: 1100, tablet: 900 };

export function App({ designDirection = 'ai-native' }: AppProps) {
  const [scenarioId, setScenarioId] = useState('saved-edits');
  const [viewport, setViewport] = useState<DocViewport>('desktop');
  const [theme, setTheme] = useState<Theme>('light');
  const [direction, setDirection] = useState<Direction>(designDirection);
  const [restart, setRestart] = useState(0);
  const realMobile = useMediaQuery('(max-width: 767px)');

  useEffect(() => setDirection(designDirection), [designDirection]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const selectScenario = (id: string) => {
    const meta = docScenarios.find((s) => s.id === id);
    if (!meta) return;
    setScenarioId(id);
    setTheme(meta.dark ? 'dark' : 'light');
    setViewport(meta.viewport ?? (viewport === 'mobile' ? 'desktop' : viewport));
    setRestart((r) => r + 1);
  };

  const mobile = realMobile || viewport === 'mobile';
  const framed = !realMobile && viewport === 'mobile';
  const frameWidth = !realMobile ? FRAMED[viewport] : undefined;

  const workspace = (
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
        onDirection: setDirection,
        onRestart: () => setRestart((r) => r + 1),
      }}
    />
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

