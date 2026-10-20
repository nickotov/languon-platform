import React, { useMemo, useRef, useState } from 'react';
import { RotateCcwIcon } from 'lucide-react';
import type { Revision } from '../../types/document';
import { useDocState } from '../../hooks/useDocState';
import { useDocChat } from '../../hooks/useDocChat';
import { useWorkspaceEditor } from '../../hooks/useWorkspaceEditor';
import { useElementSize } from '../../hooks/useMediaQuery';
import { buildDocSeed } from '../../utils/docScenarioSetup';
import { PENDING } from '../../utils/richEditor';
import { compareBlocks, formatChars, htmlBlocks, wordCount } from '../../utils/docCompare';
import { Button } from '../Button';
import { InlineAlert } from '../InlineAlert';
import { Toast } from '../Toast';
import { DocNavRail } from './DocNavRail';
import { DocTopBar } from './DocTopBar';
import { EditorToolbar } from './EditorToolbar';
import { DetailsDisclosure } from './DetailsDisclosure';
import { DocEditor } from './DocEditor';
import { ProposalReview } from './ProposalReview';
import { ConflictCompare } from './ConflictCompare';
import { RevisionHistory } from './RevisionHistory';
import { DocDialogs } from './DocDialogs';
import { KnowledgePlaceholder } from './KnowledgePlaceholder';
import { DocChatPanel } from './chat/DocChatPanel';
import { DocChatSheet } from './chat/DocChatSheet';
import { SimulatedKeyboard } from '../demo/SimulatedKeyboard';
import { DocPrototypeControls } from './DocPrototypeControls';
import type { DocPrototypeControlsProps } from './DocPrototypeControls';

const KEYBOARD_H = 252;

interface DocWorkspaceProps {
  scenarioId: string;
  mobile: boolean;
  framed: boolean;
  controls: Omit<DocPrototypeControlsProps, 'flags' | 'onFlags' | 'lowLimits' | 'onLowLimits'>;
}

export function DocWorkspace({ scenarioId, mobile, framed, controls }: DocWorkspaceProps) {
  const seed = useMemo(() => buildDocSeed(scenarioId, Date.now()), [scenarioId]);
  const doc = useDocState(seed);
  const chat = useDocChat({ messages: seed.messages, references: seed.references, lowLimits: seed.flags.lowLimits });
  const [reviewId, setReviewId] = useState<string | null>(seed.reviewId);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [historyOpened] = useState(() => seed.historyOpen);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const docAreaRef = useRef<HTMLDivElement>(null);
  const area = useElementSize(areaRef);
  const docArea = useElementSize(docAreaRef);

  // Mobile geometry: sheet + (simulated) keyboard must leave the caret and Save visible.
  const keyboardFor = framed && mobile ? (composerFocused ? 'composer' : null) : null;
  const sheetMax = Math.max(220, area.height - 56 - 8);
  const sheetH = Math.min(sheetMax, Math.round(area.height * (sheetExpanded ? 0.86 : 0.6)));
  const sheetHeightWithKeyboard = Math.min(sheetH, Math.max(220, area.height - KEYBOARD_H - 56 - 16));
  const [editorKeyboard, setEditorKeyboard] = useState(false);
  const bottomInset = mobile ? (doc.sheetOpen ? (keyboardFor ? sheetHeightWithKeyboard + KEYBOARD_H : sheetH) : editorKeyboard ? KEYBOARD_H : 72) : 0;

  const { editor, focused } = useWorkspaceEditor(seed, doc, chat, bottomInset);

  // Mobile: typing in the document opens the keyboard and closes the sheet (chat state is kept).
  React.useEffect(() => {
    if (!mobile || !framed) return;
    setEditorKeyboard(focused);
    if (focused && doc.sheetOpen) doc.setSheetOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused]);

  React.useEffect(() => {
    if (historyOpened) doc.openHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openChat = (focus = true) => {
    if (mobile) doc.setSheetOpen(true);
    else if (doc.chatMode === 'closed') doc.setChatMode('docked');
    if (focus && !mobile) window.requestAnimationFrame(() => composerRef.current?.focus());
  };

  const askTutor = () => {
    if (chat.passage) editor.removeTarget(PENDING);
    if (chat.attachSelection(editor)) {
      editor.collapseSelectionToEnd();
      openChat();
    }
  };

  const useInDocument = (id: string) => {
    setReviewId(id);
    if (mobile) doc.setSheetOpen(false);
  };

  const closeReview = () => setReviewId(null);

  const onApplied = (summary: string) => {
    setReviewId(null);
    doc.notify({ variant: 'success', title: summary, description: 'Applied as one edit.', action: { label: 'Undo', onClick: () => editor.undo() } });
  };

  const replaceContent = (html: string, title: string) => {
    editor.setContent(html);
    doc.setTitle(title);
  };

  const resolveConflict = (choice: 'this' | 'other' | 'combine' | 'separate') => {
    const other = doc.conflict;
    if (!other || !editor) return;
    if (choice === 'this' || choice === 'separate') {
      doc.keepRevision(`${other.device} version (kept)`, other.title, other.html, other.device);
      doc.notify(
        choice === 'separate'
          ? { variant: 'success', title: 'Saved as a separate note', description: `“${other.title} (${other.device})” is in Knowledge.` }
          : { variant: 'info', title: 'Continuing with this tab', description: `The ${other.device.toLowerCase()} version is kept in Revision history.` },
      );
    } else if (choice === 'other') {
      doc.keepRevision('This tab’s version (kept)', doc.title, doc.html);
      replaceContent(other.html, other.title);
      doc.notify({ variant: 'info', title: `Continuing with ${other.device.toLowerCase()} version`, description: 'This tab’s edits are kept in Revision history.' });
    } else {
      const { right } = compareBlocks(htmlBlocks(doc.html), htmlBlocks(other.html));
      const extra = right.filter((b) => b.changed).map((b) => b.block.html).join('');
      doc.keepRevision(`${other.device} version (kept)`, other.title, other.html, other.device);
      editor.setContent(`${doc.html}<hr><h2>From ${other.device.toLowerCase()} — combine and delete</h2>${extra}`);
      doc.notify({ variant: 'info', title: 'Both versions in one draft', description: `Sections only on the ${other.device.toLowerCase()} are at the end. Merge them, then delete that section.` });
    }
    doc.setConflict(null);
    doc.setView('editor');
  };

  const restore = (rev: Revision) => {
    if (doc.dirty) doc.keepRevision('Before restore — working draft', doc.title, doc.html);
    replaceContent(rev.html, rev.title);
    doc.setHistoryOpen(false);
    doc.notify({ variant: 'info', title: 'Version restored to your draft', description: 'Save to publish it.' });
  };

  const onBack = () => (doc.dirty ? doc.setDialog('leave') : doc.setView('knowledge'));

  const docChars = editor ? editor.getText().length : 0;
  const width = docArea.width || 900;
  const density = mobile ? 'touch' : width < 620 ? 'compact' : 'full';
  const pagePad = mobile ? 'px-4 py-5' : width >= 900 ? 'px-14 py-12' : width >= 640 ? 'px-10 py-9' : 'px-6 py-7';
  const outerPad = mobile ? '' : width >= 640 ? 'px-6' : 'px-3';
  const chatOpenDesktop = !mobile && (doc.chatMode === 'docked' || doc.chatMode === 'half');
  const reviewMsg = reviewId ? chat.messages.find((m) => m.id === reviewId) : undefined;

  const chatPanel = (
    <DocChatPanel
      chat={chat}
      editor={editor}
      mode={doc.chatMode}
      mobile={mobile}
      docChars={docChars}
      reviewId={reviewId}
      composerRef={composerRef}
      onModeChange={doc.setChatMode}
      onClose={() => {
        if (mobile) {
          doc.setSheetOpen(false);
          window.requestAnimationFrame(() => launcherRef.current?.focus());
        } else doc.setChatMode('closed');
      }}
      onUseInDocument={useInDocument}
      onComposerFocus={setComposerFocused}
    />
  );

  const loadingOrError =
    doc.loadStatus !== 'ready' ? (
      <div className={`mx-auto w-full max-w-3xl ${mobile ? 'p-4' : 'p-8'}`}>
        {doc.loadStatus === 'loading' ? (
          <div role="status" aria-label="Loading document" className="space-y-4 rounded-2xl border border-border-default bg-background-surface p-10">
            <div className="h-7 w-2/3 animate-pulse rounded-lg bg-background-subtle" />
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-4 animate-pulse rounded bg-background-subtle" style={{ width: `${92 - i * 9}%` }} />
            ))}
            <Button size="compact" variant="ghost" onClick={() => doc.setLoadStatus('ready')}>
              Finish loading (demo)
            </Button>
          </div>
        ) : (
          <InlineAlert
            tone="error"
            title="Couldn’t open this document"
            actions={
              <Button size="compact" variant="secondary" leadingIcon={<RotateCcwIcon className="h-4 w-4" />} onClick={() => { doc.setLoadStatus('loading'); window.setTimeout(() => doc.setLoadStatus('ready'), 900); }}>
                Try again
              </Button>
            }
          >
            The connection dropped while loading. Any private draft recovery is safe on the server.
          </InlineAlert>
        )}
      </div>
    ) : null;

  const documentColumn = editor && (
    <div className={`mx-auto w-full ${outerPad} ${mobile ? '' : 'pb-16 pt-5'}`} style={{ maxWidth: mobile ? undefined : 860 }}>
      {doc.saveError && (
        <div className={mobile ? 'px-4 pt-3' : 'mb-3'}>
          <InlineAlert tone="error" title="Couldn’t save" onDismiss={() => doc.setSaveError(false)} actions={<Button size="compact" variant="secondary" onClick={() => doc.save()}>Retry save</Button>}>
            Your edits are still here and recovered privately. The saved version and shared link are unchanged.
          </InlineAlert>
        </div>
      )}
      <div className={mobile ? 'px-4 pt-3' : ''}>
        <DetailsDisclosure meta={doc.meta} open={doc.metaOpen} onToggle={() => doc.setMetaOpen(!doc.metaOpen)} onChange={doc.setMeta} touch={mobile} />
      </div>
      {reviewMsg?.suggestion && (
        <div className={`sticky top-2 z-20 mt-3 ${mobile ? 'px-2' : ''}`}>
          <ProposalReview editor={editor} message={reviewMsg} touch={mobile} onClose={closeReview} onApplied={onApplied} />
        </div>
      )}
      {doc.view === 'conflict' && doc.conflict ? (
        <div className={`mt-4 ${mobile ? 'px-4' : ''}`}>
          <ConflictCompare
            thisTitle={doc.title}
            thisHtml={doc.html}
            other={doc.conflict}
            stacked={width < 760}
            touch={mobile}
            onContinueThis={() => resolveConflict('this')}
            onContinueOther={() => resolveConflict('other')}
            onCombine={() => resolveConflict('combine')}
            onSaveOtherAsNote={() => resolveConflict('separate')}
          />
        </div>
      ) : (
        <article
          aria-label="Document"
          className={`mt-3 bg-background-surface ${mobile ? 'border-y border-border-default' : 'rounded-2xl border border-border-default shadow-sm'} ${pagePad}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) editor.focus('end');
          }}
        >
          <DocEditor
            editor={editor}
            touch={mobile}
            onAskTutor={askTutor}
            onAskOutline={() => {
              chat.setText('Can you suggest an outline for a study note on this topic?');
              openChat();
            }}
          />
        </article>
      )}
    </div>
  );

  const statusFooter = !mobile && editor && doc.loadStatus === 'ready' && doc.view !== 'knowledge' && (
    <div className="flex h-8 shrink-0 items-center justify-between gap-4 border-t border-border-default bg-background-surface px-4 text-xs text-text-tertiary">
      <span>{wordCount(doc.html)} words</span>
      <span className={docChars > chat.docLimit ? 'text-danger-default' : ''}>
        Tutor limit {formatChars(docChars)} / {formatChars(chat.docLimit)} characters
      </span>
    </div>
  );

  const documentArea =
    doc.view === 'knowledge' ? (
      <KnowledgePlaceholder title={doc.title} deleted={deleted} onReopen={() => (deleted ? controls.onRestart() : doc.setView('editor'))} />
    ) : (
      <>
        <DocTopBar
          doc={doc}
          mobile={mobile}
          chatClosed={doc.chatMode === 'closed'}
          onBack={onBack}
          onOpenChat={() => openChat()}
          onSaveCopy={() => doc.notify({ variant: 'success', title: 'Copy saved', description: `“${doc.title} (copy)” is in Knowledge. You’re still editing the original.` })}
        />
        {editor && doc.loadStatus === 'ready' && doc.view === 'editor' && (
          <div className={`shrink-0 border-b border-border-default bg-background-surface ${mobile ? '' : 'px-3 py-1'}`}>
            <div className="mx-auto" style={{ maxWidth: mobile ? undefined : 812 }}>
              <EditorToolbar editor={editor} density={density} />
            </div>
          </div>
        )}
        <div className="relative min-h-0 flex-1 overflow-y-auto" style={{ paddingBottom: mobile ? bottomInset : undefined }}>
          {loadingOrError ?? documentColumn}
        </div>
        {statusFooter}
        {doc.historyOpen && (
          <div className={`absolute z-40 border-l border-border-default shadow-lg ${mobile ? 'inset-0' : 'bottom-0 right-0 top-14 w-96 max-w-full'}`}>
            <RevisionHistory
              revisions={doc.revisions}
              status={doc.historyStatus}
              dirty={doc.dirty}
              savedAt={doc.saved?.savedAt ?? null}
              touch={mobile}
              onClose={() => doc.setHistoryOpen(false)}
              onRetry={doc.retryHistory}
              onRestore={restore}
            />
          </div>
        )}
      </>
    );

  const dialogs = (
    <DocDialogs
      doc={doc}
      onLeave={() => {
        doc.setDialog(null);
        doc.setView('knowledge');
      }}
      onSaveAndLeave={() => doc.save(() => {
        doc.setDialog(null);
        doc.setView('knowledge');
      })}
      onDelete={() => {
        doc.setDialog(null);
        setDeleted(true);
        doc.setView('knowledge');
        doc.notify({ variant: 'info', title: 'Note deleted', description: 'Its draft and shared link were removed. Chats are unaffected.' });
      }}
    />
  );

  const toast = doc.toast && (
    <Toast
      key={doc.toast.id}
      title={doc.toast.title}
      description={doc.toast.description}
      variant={doc.toast.variant}
      action={doc.toast.action}
      onDismiss={() => doc.setToast(null)}
      anchored
      position={mobile ? 'top-right' : 'bottom-left'}
      duration={6000}
    />
  );

  const prototypeControls = (
    <DocPrototypeControls
      {...controls}
      flags={doc.flags}
      onFlags={(patch) => doc.setFlags((f) => ({ ...f, ...patch }))}
      lowLimits={chat.lowLimits}
      onLowLimits={chat.setLowLimits}
    />
  );

  if (mobile) {
    return (
      <div ref={areaRef} className="relative flex h-full w-full flex-col overflow-hidden bg-background-canvas text-text-primary">
        <div ref={docAreaRef} className="relative flex min-h-0 flex-1 flex-col">
          {documentArea}
        </div>
        {doc.view !== 'knowledge' && doc.loadStatus === 'ready' && (
          <DocChatSheet
            open={doc.sheetOpen}
            expanded={sheetExpanded}
            height={keyboardFor ? sheetHeightWithKeyboard : sheetH}
            bottom={keyboardFor ? KEYBOARD_H : 0}
            launcherBottom={editorKeyboard ? KEYBOARD_H + 12 : framed ? 28 : 16}
            hasAttachment={chat.passage !== null}
            onOpen={() => {
              editor.blur();
              doc.setSheetOpen(true);
            }}
            onToggleExpanded={() => setSheetExpanded((e) => !e)}
            launcherRef={launcherRef}
          >
            {chatPanel}
          </DocChatSheet>
        )}
        {framed && (keyboardFor || editorKeyboard) && <SimulatedKeyboard height={KEYBOARD_H} />}
        {dialogs}
        {toast}
        {prototypeControls}
      </div>
    );
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-background-canvas text-text-primary">
      <DocNavRail />
      <div ref={areaRef} className="relative flex min-w-0 flex-1">
        <div ref={docAreaRef} className="relative flex min-w-0 flex-1 flex-col">
          {documentArea}
        </div>
        {chatOpenDesktop && doc.view !== 'knowledge' && (
          <div style={{ width: doc.chatMode === 'half' ? '50%' : 380 }} className="flex shrink-0 flex-col border-l border-border-default transition-all duration-200">
            {chatPanel}
          </div>
        )}
        {doc.chatMode === 'floating' && doc.view !== 'knowledge' && (
          <div style={{ height: Math.min(600, area.height - 48) }} className="absolute bottom-6 right-6 z-40 w-96 overflow-hidden rounded-2xl border border-border-default shadow-lg">
            {chatPanel}
          </div>
        )}
      </div>
      {dialogs}
      {toast}
      {prototypeControls}
    </div>
  );
}

