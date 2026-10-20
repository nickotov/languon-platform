import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { XIcon } from 'lucide-react';
import type { AppUiState, Dock, SheetState, Theme, Viewport } from '../types/app';
import type { Attachment, DictionaryCard } from '../types/tutor';
import { useTutor } from '../hooks/useTutor';
import { useElementSize } from '../hooks/useMediaQuery';
import { TutorProvider } from '../contexts/TutorContext';
import type { TutorContextValue } from '../contexts/TutorContext';
import { buildScenario } from '../utils/scenarioSetup';
import { DICT_SOURCE_ID, TEXT_SOURCE_ID, cardAttachment, getSourceInfo, noteSourceId } from '../data/sources';
import { Sidebar } from './shell/Sidebar';
import { Topbar } from './shell/Topbar';
import { MobileTopbar } from './shell/MobileTopbar';
import { TutorWidget } from './tutor/TutorWidget';
import { TutorSheet } from './tutor/TutorSheet';
import { SelectionToolbar } from './source/SelectionToolbar';
import { SimulatedKeyboard } from './demo/SimulatedKeyboard';
import { PrototypeControls } from './demo/PrototypeControls';
import { TextPage } from '../pages/TextPage';
import { DictionaryPage } from '../pages/DictionaryPage';
import { NotePage } from '../pages/NotePage';

const KEYBOARD_H = 252;

interface PrototypeProps {
  scenarioId: string;
  viewport: Viewport;
  theme: Theme;
  platform: 'desktop' | 'mobile';
  framed: boolean;
  realMobile: boolean;
  onScenario: (id: string) => void;
  onViewport: (v: Viewport) => void;
  onTheme: (t: Theme) => void;
  onRestart: () => void;
}

export function Prototype(props: PrototypeProps) {
  const { scenarioId, platform, framed } = props;
  const seed = useMemo(() => buildScenario(scenarioId, Date.now()), [scenarioId]);
  const tutor = useTutor(seed.tutor);
  const [ui, setUiState] = useState<AppUiState>(seed.ui);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const area = useElementSize(areaRef);
  const [vvInset, setVvInset] = useState(0);
  const mobile = platform === 'mobile';

  const setUi = useCallback((patch: Partial<AppUiState>) => setUiState((u) => ({ ...u, ...patch })), []);
  const setDock = useCallback((dock: Dock) => setUi({ dock }), [setUi]);

  const setSheet = useCallback(
    (sheet: SheetState) => {
      if (sheet === 'collapsed') {
        tutor.fold();
        return;
      }
      setUi({ sheet });
      tutor.expand();
    },
    [setUi, tutor],
  );

  const focusComposer = () => window.requestAnimationFrame(() => window.requestAnimationFrame(() => composerRef.current?.focus()));

  const attachFromPage = (attachment: Attachment) => {
    if (tutor.active.sourceId !== ui.page) tutor.openForSource(ui.page);
    tutor.addAttachment(attachment);
    tutor.expand();
    if (tutor.state.view !== 'chat') tutor.setView('chat');
    if (ui.selectMode) setUi({ selectMode: false });
    focusComposer();
  };

  const navigate = (sourceId: string) => {
    setUi({ page: sourceId, selectMode: false });
    tutor.pageChanged(sourceId);
  };

  const openTutor = () => {
    if (mobile) setSheet(ui.sheet === 'collapsed' ? 'partial' : ui.sheet);
    else tutor.expand();
    if (!mobile) focusComposer();
  };

  useEffect(() => {
    const timers: number[] = [];
    const ap = seed.autoplay;
    if (ap.send) timers.push(window.setTimeout(() => tutor.send(false), 600));
    if (ap.foldAfterMs) timers.push(window.setTimeout(() => tutor.fold(), 600 + ap.foldAfterMs));
    if (ap.focusComposer) timers.push(window.setTimeout(() => composerRef.current?.focus(), 400));
    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (framed || !mobile || !window.visualViewport) return;
    const vv = window.visualViewport;
    const onResize = () => setVvInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    vv.addEventListener('resize', onResize);
    onResize();
    return () => vv.removeEventListener('resize', onResize);
  }, [framed, mobile]);

  const keyboardInset = !mobile || tutor.state.folded ? 0 : framed ? (ui.keyboardOpen ? KEYBOARD_H : 0) : vvInset;
  const pageSource = getSourceInfo(ui.page, tutor.state.notes);

  const ctx: TutorContextValue = {
    tutor,
    ui,
    platform,
    setUi,
    setDock,
    setSheet,
    onSelectFromPage: () => {
      setUi({ selectMode: true, keyboardOpen: false });
      tutor.fold();
    },
    onOpenNote: (noteId: string) => navigate(noteSourceId(noteId)),
    canWiden: area.width >= 900,
    composerRef,
    launcherRef,
  };

  const page = (() => {
    if (ui.page === TEXT_SOURCE_ID)
      return (
        <TextPage
          compact={mobile}
          showTranslation={ui.showTranslation}
          onToggleTranslation={() => setUi({ showTranslation: !ui.showTranslation })}
          hasUnsavedEdits={ui.hasUnsavedEdits}
          onSaveEdits={() => {
            setUi({ hasUnsavedEdits: false });
            tutor.sourceUpdated(TEXT_SOURCE_ID);
          }}
        />
      );
    if (ui.page === DICT_SOURCE_ID)
      return (
        <DictionaryPage
          compact={mobile}
          attachedIds={tutor.active.sourceId === DICT_SOURCE_ID ? tutor.active.composer.attachments.map((a) => a.id) : []}
          onAskCard={(card: DictionaryCard) => attachFromPage(cardAttachment(card))}
        />
      );
    const note = tutor.state.notes[ui.page.replace('note:', '')];
    return (
      <NotePage
        compact={mobile}
        note={note}
        onAsk={() => {
          tutor.openForSource(ui.page);
          if (mobile) setSheet('partial');
          else focusComposer();
        }}
      />
    );
  })();

  const toggles = [
    { id: 'unsaved', label: 'Unsaved source edits', on: ui.hasUnsavedEdits, onToggle: () => setUi({ hasUnsavedEdits: !ui.hasUnsavedEdits }) },
    { id: 'reconnect', label: 'Next answer reconnects', on: tutor.state.flags.reconnectNextStream, onToggle: () => tutor.setFlags({ reconnectNextStream: !tutor.state.flags.reconnectNextStream }) },
    { id: 'failstream', label: 'Next answer fails', on: tutor.state.flags.failNextStream, onToggle: () => tutor.setFlags({ failNextStream: !tutor.state.flags.failNextStream }) },
    { id: 'failsave', label: 'Next save fails', on: tutor.state.flags.failNextSave, onToggle: () => tutor.setFlags({ failNextSave: !tutor.state.flags.failNextSave }) },
    { id: 'conflict', label: 'Note edited elsewhere', on: tutor.state.flags.noteConflict, onToggle: () => tutor.setFlags({ noteConflict: !tutor.state.flags.noteConflict }) },
  ];

  const controls = (
    <PrototypeControls
      scenarioId={scenarioId}
      viewport={props.viewport}
      theme={props.theme}
      onScenario={props.onScenario}
      onViewport={props.onViewport}
      onTheme={props.onTheme}
      onRestart={props.onRestart}
      onSourceUpdate={() => tutor.sourceUpdated(ui.page)}
      toggles={toggles}
      realMobile={props.realMobile}
    />
  );

  const selectionToolbar = (
    <SelectionToolbar mode={ui.selectMode ? 'attach' : 'ask'} sourceTitle={pageSource.title} touch={mobile} onAttach={attachFromPage} />
  );

  if (mobile) {
    return (
      <TutorProvider value={ctx}>
        <div className="relative flex h-full w-full flex-col overflow-hidden bg-background-canvas text-text-primary">
          <MobileTopbar page={ui.page} onNavigate={navigate} />
          <div ref={areaRef} className="relative min-h-0 flex-1">
            <main className="absolute inset-0 overflow-y-auto">{page}</main>
            {ui.selectMode && (
              <div role="status" className="absolute inset-x-3 top-3 z-40 flex items-center gap-2 rounded-xl border border-primary-200 bg-primary-subtle py-1 pl-3.5 pr-1 shadow-md">
                <p className="flex-1 text-sm text-text-primary">Select text on the page to attach it to your question.</p>
                <button
                  type="button"
                  onClick={() => {
                    setUi({ selectMode: false });
                    setSheet(ui.sheet);
                  }}
                  aria-label="Cancel selecting and return to tutor"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-text-secondary hover:bg-background-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                >
                  <XIcon className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}
            {area.height > 0 && <TutorSheet areaHeight={area.height} keyboardInset={keyboardInset} safeBottom={framed ? 20 : 8} />}
            {framed && keyboardInset > 0 && <SimulatedKeyboard height={KEYBOARD_H} />}
          </div>
          {selectionToolbar}
        </div>
        {controls}
      </TutorProvider>
    );
  }

  return (
    <TutorProvider value={ctx}>
      <div className="flex h-full w-full overflow-hidden bg-background-canvas text-text-primary">
        <Sidebar collapsed={ui.sidebarCollapsed} page={ui.page} onNavigate={navigate} onToggle={() => setUi({ sidebarCollapsed: !ui.sidebarCollapsed })} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar source={pageSource} tutorOpen={!tutor.state.folded} onOpenTutor={openTutor} />
          <div ref={areaRef} className="relative min-h-0 flex-1">
            <main className="absolute inset-0 overflow-y-auto">{page}</main>
            {area.width > 0 && <TutorWidget areaWidth={area.width} areaHeight={area.height} />}
          </div>
        </div>
        {selectionToolbar}
      </div>
      {controls}
    </TutorProvider>
  );
}

