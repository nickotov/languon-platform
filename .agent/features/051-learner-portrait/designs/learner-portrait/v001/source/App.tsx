import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { PrototypeProvider } from './contexts/PrototypeContext';
import { AppShell } from './components/shell/AppShell';
import { ScenarioPanel } from './components/prototype/ScenarioPanel';
import { ToastHost } from './components/ToastHost';
import { Home } from './pages/Home';
import { Dictionaries } from './pages/Dictionaries';
import { Texts } from './pages/Texts';
import { Knowledge } from './pages/Knowledge';
import { LearningChat } from './pages/LearningChat';
import { Settings } from './pages/Settings';
import { CreditSettings } from './pages/CreditSettings';
import { PortraitOverview } from './pages/PortraitOverview';
import { PortraitIntro } from './pages/PortraitIntro';
import { PortraitInterview } from './pages/PortraitInterview';
import { PortraitManual } from './pages/PortraitManual';
import { PortraitReview } from './pages/PortraitReview';

export function App() {
  return (
    <BrowserRouter>
      <PrototypeProvider>
        <Routes>
          <Route path="/portrait/interview" element={<PortraitInterview />} />
          <Route element={<AppShell />}>
            <Route path="/" element={<Home />} />
            <Route path="/dictionaries" element={<Dictionaries />} />
            <Route path="/texts" element={<Texts />} />
            <Route path="/texts/:slug" element={<LearningChat />} />
            <Route path="/knowledge" element={<Knowledge />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/settings/credits" element={<CreditSettings />} />
            <Route path="/portrait" element={<PortraitOverview />} />
            <Route path="/portrait/intro" element={<PortraitIntro />} />
            <Route path="/portrait/manual" element={<PortraitManual />} />
            <Route path="/portrait/review" element={<PortraitReview />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
        <ToastHost />
        <ScenarioPanel />
      </PrototypeProvider>
    </BrowserRouter>
  );
}

