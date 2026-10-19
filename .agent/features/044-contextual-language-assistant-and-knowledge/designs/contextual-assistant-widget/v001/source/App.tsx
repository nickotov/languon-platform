import React, { useEffect, useState } from 'react';
import type { Theme, Viewport } from './types/app';
import { scenarios } from './data/scenarios';
import { useMediaQuery } from './hooks/useMediaQuery';
import { Prototype } from './components/Prototype';
import { PhoneFrame } from './components/demo/PhoneFrame';

export function App() {
  const [scenarioId, setScenarioId] = useState('desktop');
  const [viewport, setViewport] = useState<Viewport>('desktop');
  const [theme, setTheme] = useState<Theme>('light');
  const [restart, setRestart] = useState(0);
  const realMobile = useMediaQuery('(max-width: 767px)');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const selectScenario = (id: string) => {
    const meta = scenarios.find((s) => s.id === id);
    if (!meta) return;
    setScenarioId(id);
    setTheme(meta.theme ?? 'light');
    if (meta.group === 'Desktop') setViewport('desktop');
    else if (meta.viewport) setViewport(viewport === 'mobile320' ? 'mobile320' : meta.viewport);
    setRestart((r) => r + 1);
  };

  const platform = realMobile || viewport !== 'desktop' ? 'mobile' : 'desktop';
  const framed = !realMobile && viewport !== 'desktop';

  const prototype = (
    <Prototype
      key={`${scenarioId}-${viewport}-${restart}-${platform}`}
      scenarioId={scenarioId}
      viewport={viewport}
      theme={theme}
      platform={platform}
      framed={framed}
      realMobile={realMobile}
      onScenario={selectScenario}
      onViewport={setViewport}
      onTheme={setTheme}
      onRestart={() => setRestart((r) => r + 1)}
    />
  );

  return (
    <div className="h-screen w-full overflow-hidden bg-background-canvas font-body text-text-primary antialiased">
      {framed ? <PhoneFrame width={viewport === 'mobile320' ? 320 : 390}>{prototype}</PhoneFrame> : prototype}
    </div>
  );
}

