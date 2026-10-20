import React, { useEffect, useState } from 'react';
import type { Theme } from './types/app';
import type { DocViewport } from './types/document';
import { docScenarios } from './data/documentScenarios';
import { useMediaQuery } from './hooks/useMediaQuery';
import { DocWorkspace } from './components/document/DocWorkspace';
import { PhoneFrame } from './components/demo/PhoneFrame';

export function App() {
  const [scenarioId, setScenarioId] = useState('saved-edits');
  const [viewport, setViewport] = useState<DocViewport>('desktop');
  const [theme, setTheme] = useState<Theme>('light');
  const [restart, setRestart] = useState(0);
  const realMobile = useMediaQuery('(max-width: 767px)');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const selectScenario = (id: string) => {
    const meta = docScenarios.find((s) => s.id === id);
    if (!meta) return;
    setScenarioId(id);
    setTheme(meta.dark ? 'dark' : 'light');
    setViewport(meta.viewport ?? (viewport === 'mobile' ? 'desktop' : viewport === 'narrow' ? 'desktop' : viewport));
    setRestart((r) => r + 1);
  };

  const mobile = realMobile || viewport === 'mobile';
  const framed = !realMobile && viewport === 'mobile';

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
        realMobile,
        onScenario: selectScenario,
        onViewport: setViewport,
        onTheme: setTheme,
        onRestart: () => setRestart((r) => r + 1),
      }}
    />
  );

  return (
    <div className="h-screen w-full overflow-hidden bg-background-canvas font-body text-text-primary antialiased">
      {framed ? (
        <PhoneFrame width={390}>{workspace}</PhoneFrame>
      ) : viewport === 'narrow' && !realMobile ? (
        <div className="flex h-full w-full items-center justify-center bg-background-subtle p-4">
          <div style={{ maxWidth: 1100 }} className="h-full w-full overflow-hidden rounded-xl border border-border-default shadow-lg">
            {workspace}
          </div>
        </div>
      ) : (
        workspace
      )}
    </div>
  );
}

