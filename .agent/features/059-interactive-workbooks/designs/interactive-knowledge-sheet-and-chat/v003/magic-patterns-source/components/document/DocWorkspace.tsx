import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcwIcon } from 'lucide-react';
import type { MobileTab, Revision, SelectionAction, StarterKind } from '../../types/document';
import { useDocState } from '../../hooks/useDocState';
import { useDocChat } from '../../hooks/useDocChat';
import { useWorkspaceEditor } from '../../hooks/useWorkspaceEditor';
import { NAV_RAIL, resolveLayout, useWorkspaceLayout } from '../../hooks/useWorkspaceLayout';
import { useFloatingToolbar } from '../../hooks/useFloatingToolbar';
import { useElementSize } from '../../hooks/useMediaQuery';
import { useDirection } from '../../contexts/WorkspaceDirectionContext';
import { buildDocSeed } from '../../utils/docScenarioSetup';
import { PENDING } from '../../utils/richEditor';
import { compareBlocks, formatChars, htmlBlocks, wordCount } from '../../utils/docCompare';
import { docTemplates } from '../../data/docTemplates';
import { ru } from '../../data/strings';
import { Button } from '../Button';
import { InlineAlert } from '../InlineAlert';
import { Toast } from '../Toast';
import { DocNavRail } from './DocNavRail';
import { DocTopBar } from './DocTopBar';
import { EditorToolbar } from './EditorToolbar';
import { DocTitleField } from './DocTitleField';
import { DocProperties } from './DocProperties';
import { DocEditor } from './DocEditor';
import { EmptyStarters } from './EmptyStarters';
import { InlineReview } from './InlineReview';
import { ProposalReview } from './ProposalReview';
import { ConflictCompare } from './ConflictCompare';
import { RevisionHistory } from './RevisionHistory';
import { PanelResizer } from './PanelResizer';
import { DocDialogs } from './DocDialogs';
import { KnowledgePlaceholder } from './KnowledgePlaceholder';
import { DocChatPanel } from './chat/DocChatPanel';
import { SimulatedKeyboard } from '../demo/SimulatedKeyboard';
import { DocPrototypeControls } from './DocPrototypeControls';
import type { DocPrototypeControlsProps } from './DocPrototypeControls';
import type { SheetBlock } from '../../types/blocks';
import { useSheetBlocks } from '../../hooks/useSheetBlocks';
import { useBlockProposals } from '../../hooks/useBlockProposals';
import { BlockRuntimeProvider } from '../../contexts/BlockRuntimeContext';
import { SheetBlocks } from '../blocks/SheetBlocks';
import { BlockEditorDialog } from '../blocks/BlockEditorDialog';
import { ProposalReviewPanel } from '../blocks/ProposalReviewPanel';
import { BlockPanels } from '../blocks/BlockPanels';
import type { BlockPanel } from '../blocks/BlockPanels';
import { WorkbookStrip } from './WorkbookStrip';
import { SharedReaderView } from '../reader/SharedReaderView';
import { bs } from '../../data/blockStrings';

const KEYBOARD_H = 252;
const EDIT_ACTIONS: SelectionAction[] = ['correct', 'simplify', 'rephrase'];

interface DocWorkspaceProps {
  scenarioId: string;
  mobile: boolean;
  framed: boolean;
  controls: Omit<DocPrototypeControlsProps, 'flags' | 'onFlags' | 'lowLimits' | 'onLowLimits' | 'failNextReply' | 'onFailNextReply'>;
}

export function DocWorkspace({ scenarioId, mobile, framed, controls }: DocWorkspaceProps) {
  const seed = useMemo(() => buildDocSeed(scenarioId, Date.now()), [scenarioId]);
  const direction = useDirection();
  const doc = useDocState(seed);
  const chat = useDocChat({ messages: seed.messages, references: seed.references, lowLimits: seed.flags.lowLimits, failNextReply: seed.flags.failNextReply });
  const layout = useWorkspaceLayout(seed.chatMode, seed.layoutExplicit);
  const [reviewId, setReviewId] = useState<string | null>(seed.reviewId);
  const [inlineId, setInlineId] = useState<string | null>(seed.inlineReviewId);
  const [mobileTab, setMobileTabState] = useState<MobileTab>(seed.mobileTab);
  const [unread, setUnread] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [titleHidden, setTitleHidden] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const docAreaRef = useRef<HTMLDivElement>(null);
  const area = useElementSize(areaRef);
  const docArea = useElementSize(docAreaRef);

  // ---------- learning blocks ----------
  const blocks = useSheetBlocks(seed.nodes, doc.onBlocksChange, seed.selectedBlockId);
  // Sheet setting: tinted containers for learning blocks (on by default).
  const [blockAccents, setBlockAccents] = useState(true);
  const [blockEditor, setBlockEditor] = useState<{ block: SheetBlock; isNew: boolean } | null>(() => {
    const n = seed.nodes.find((x) => x.kind === 'block' && x.id === seed.editorBlockId);
    return n && n.kind === 'block' ? { block: n.block, isNew: false } : null;
  });
  const [reviewProposalId, setReviewProposalId] = useState<string | null>(seed.proposalReviewId);
  const [learner, setLearner] = useState(seed.learnerPreview);
  const [blockPanel, setBlockPanel] = useState<BlockPanel | null>(null);

  useEffect(() => chat.setBlockChars(blocks.blockChars), [blocks.blockChars, chat]);

  const revealBlock = (id: string) => {
    if (mobile) setMobileTabState('doc');
    blocks.flash(id);
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        const el = scrollRef.current?.querySelector<HTMLElement>(`[data-block-id="${id}"]`);
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        el?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
      }),
    );
  };

  const proposals = useBlockProposals({
    messages: chat.messages,
    blocks,
    doc,
    reveal: revealBlock,
    onReview: setReviewProposalId,
    onAskAgain: (prompt) => {
      chat.setText(prompt);
      window.requestAnimationFrame(() => composerRef.current?.focus());
    },
  });

  const applyBlockEdit = (next: SheetBlock) => {
    if (blockEditor?.isNew) blocks.insert([next]);
    else blocks.update(next);
    setBlockEditor(null);
    blocks.setSelectedId(next.id);
    doc.notify({ variant: 'success', title: blockEditor?.isNew ? ru.blocks.added : ru.editor.applied, description: ru.editor.appliedBody, action: { label: ru.blocks.undo, onClick: () => blocks.undo() } });
  };

  // Direction A keeps today's card and review panel; B and C use the open canvas and inline review.
  const card = direction === 'minimal';
  const aiActions = direction !== 'minimal';
  const inlineCapable = direction !== 'minimal';

  const [editorFocusedForKb, setEditorFocusedForKb] = useState(false);
  const editorKeyboard = framed && mobile && mobileTab === 'doc' && editorFocusedForKb;
  const composerKeyboard = framed && mobile && mobileTab === 'tutor' && composerFocused;
  const { editor, focused } = useWorkspaceEditor(seed, doc, chat, editorKeyboard ? KEYBOARD_H : 0);
  const floating = useFloatingToolbar(editor, direction === 'editorial' && !mobile);

  useEffect(() => setEditorFocusedForKb(focused), [focused]);

  useEffect(() => {
    if (seed.historyOpen) doc.openHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Compact title in the top bar once the in-canvas title scrolls away.
  useEffect(() => {
    const el = titleRef.current;
    const root = scrollRef.current;
    if (!el || !root) {
      setTitleHidden(false);
      return;
    }
    const io = new IntersectionObserver(([entry]) => setTitleHidden(!entry.isIntersecting), { root, threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [doc.view, doc.loadStatus, mobileTab]);

  const setMobileTab = (tab: MobileTab) => {
    setMobileTabState(tab);
    if (tab === 'tutor') setUnread(false);
  };

  // When an edit reply completes, open its review in the document; flag unread replies on mobile.
  const statuses = useRef<Record<string, string | undefined>>({});
  useEffect(() => {
    for (const m of chat.messages) {
      if (m.role !== 'tutor') continue;
      const prev = statuses.current[m.id];
      if (prev && prev !== 'done' && m.status === 'done') {
        if (m.suggestion?.kind === 'replace' && m.action && EDIT_ACTIONS.includes(m.action)) {
          if (inlineCapable) {
            setInlineId(m.id);
            setReviewId(null);
          } else {
            setReviewId(m.id);
            setInlineId(null);
          }
        }
        if (mobile && mobileTab === 'doc') setUnread(true);
      }
      statuses.current[m.id] = m.status;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.messages]);

  const openTutor = (focusComposer: boolean) => {
    if (mobile) setMobileTab('tutor');
    else if (layout.mode === 'focus') layout.setMode('split');
    if (focusComposer) window.requestAnimationFrame(() => window.requestAnimationFrame(() => composerRef.current?.focus()));
  };

  const onAction = (action: SelectionAction) => {
    const info = editor.selectionInfo();
    if (!info) return;
    if (chat.passage) editor.removeTarget(PENDING);
    chat.attachRange(editor, info.range, info.text, info.heading);
    editor.collapseSelectionToEnd();
    if (action === 'ask') {
      openTutor(true);
      return;
    }
    const ok = chat.send(editor, { text: ru.actionPrompts[action], action, passage: { text: info.text, blockLabel: info.heading } });
    if (!ok || !EDIT_ACTIONS.includes(action)) openTutor(false);
  };

  const onStart = (kind: StarterKind) => {
    if (kind === 'write') editor.focus('start');
    else if (kind === 'outline') {
      chat.send(editor, { text: ru.starters.outlinePrompt });
      openTutor(false);
    } else {
      editor.replaceAll(docTemplates[kind]);
      doc.notify({ variant: 'success', title: ru.toasts.templateInserted, description: ru.toasts.templateBody, action: { label: ru.toasts.undo, onClick: () => editor.undo() } });
    }
  };

  const notifyApplied = (title: string) =>
    doc.notify({ variant: 'success', title, description: ru.inline.appliedBody, action: { label: ru.inline.undo, onClick: () => editor.undo() } });

  const showInline = (id: string) => {
    setInlineId(id);
    setReviewId(null);
    if (mobile) setMobileTab('doc');
  };

  const useInDocument = (id: string) => {
    setReviewId(id);
    setInlineId(null);
    if (mobile) setMobileTab('doc');
  };

  const inlineMsg = inlineId ? chat.messages.find((m) => m.id === inlineId) : undefined;
  const reviewMsg = reviewId ? chat.messages.find((m) => m.id === reviewId) : undefined;

  const acceptInline = () => {
    const target = inlineMsg?.targetId ? editor.getTarget(inlineMsg.targetId) : undefined;
    if (!inlineMsg?.suggestion || !target) return;
    editor.replaceRange(target.range, inlineMsg.suggestion.inlineHtml);
    editor.removeTarget(inlineMsg.targetId!);
    setInlineId(null);
    notifyApplied(ru.inline.applied);
  };

  const replaceContent = (html: string, title: string) => {
    editor.setContent(html);
    doc.setTitle(title);
  };

  const resolveConflict = (choice: 'this' | 'other' | 'combine' | 'separate') => {
    const other = doc.conflict;
    if (!other) return;
    if (choice === 'this' || choice === 'separate') {
      doc.keepRevision(ru.toasts.keptOther(other.device), other.title, other.html, other.device);
      doc.notify(
        choice === 'separate'
          ? { variant: 'success', title: ru.toasts.separate, description: ru.toasts.separateBody(other.title, other.device) }
          : { variant: 'info', title: ru.toasts.continueThis, description: ru.toasts.continueThisBody(other.device) },
      );
    } else if (choice === 'other') {
      doc.keepRevision(ru.toasts.keptThis, doc.title, doc.html);
      replaceContent(other.html, other.title);
      doc.notify({ variant: 'info', title: ru.toasts.continueOther(other.device), description: ru.toasts.continueOtherBody });
    } else {
      const { right } = compareBlocks(htmlBlocks(doc.html), htmlBlocks(other.html));
      const extra = right.filter((b) => b.changed).map((b) => b.block.html).join('');
      doc.keepRevision(ru.toasts.keptOther(other.device), other.title, other.html, other.device);
      editor.setContent(`${doc.html}<hr><h2>${ru.toasts.combineHeading(other.device)}</h2>${extra}`);
      doc.notify({ variant: 'info', title: ru.toasts.combined, description: ru.toasts.combinedBody(other.device) });
    }
    doc.setConflict(null);
    doc.setView('editor');
  };

  const restore = (rev: Revision) => {
    if (doc.dirty) doc.keepRevision(ru.toasts.beforeRestore, doc.title, doc.html);
    replaceContent(rev.html, rev.title);
    doc.setHistoryOpen(false);
    doc.notify({ variant: 'info', title: ru.toasts.restored, description: ru.toasts.restoredBody });
  };

  const onBack = () => (doc.dirty ? doc.setDialog('leave') : doc.setView('knowledge'));

  // ---------- geometry ----------
  const docChars = editor.getText().length + blocks.blockChars;
  const width = docArea.width || 900;
  const vw = area.width + NAV_RAIL;
  const resolved = resolveLayout(mobile ? 0 : area.width, layout.mode, layout.width);
  const compact = !mobile && (vw < 1280 || width < 820);
  const density = mobile ? 'touch' : width < 700 ? 'compact' : 'full';
  const padX = mobile ? 'px-4' : width >= 900 ? 'px-12' : width >= 640 ? 'px-8' : 'px-5';
  const titleSize = mobile ? 'md' : direction === 'editorial' ? 'xl' : direction === 'minimal' ? 'md' : 'lg';
  const ready = doc.loadStatus === 'ready' && doc.view !== 'knowledge';
  const showToolbar = ready && doc.view === 'editor' && !learner;

  const chatPanel = (
    <DocChatPanel
      chat={chat}
      editor={editor}
      mobile={mobile}
      docTitle={doc.title}
      docChars={docChars}
      docEmpty={editor.isEmpty}
      activeSuggestionId={inlineId ?? reviewId}
      inlineCapable={inlineCapable}
      composerRef={composerRef}
      onClose={
        mobile
          ? undefined
          : () => {
              layout.setMode('focus');
              window.requestAnimationFrame(() => document.getElementById('layout-focus')?.focus());
            }
      }
      onUseInDocument={useInDocument}
      onShowInline={showInline}
      onComposerFocus={setComposerFocused}
      proposals={proposals.handlers}
    />
  );

  const loadingOrError =
    doc.loadStatus !== 'ready' ? (
      <div className={`mx-auto w-full max-w-3xl ${mobile ? 'p-4' : 'px-12 py-10'}`}>
        {doc.loadStatus === 'loading' ? (
          <div role="status" aria-label={ru.canvas.loadingAria} className="space-y-4">
            <div className="h-9 w-2/3 animate-pulse rounded-lg bg-background-subtle" />
            <div className="h-6 w-1/3 animate-pulse rounded-md bg-background-subtle" />
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-4 animate-pulse rounded bg-background-subtle" style={{ width: `${92 - i * 9}%` }} />
            ))}
            <Button size="compact" variant="ghost" onClick={() => doc.setLoadStatus('ready')}>
              {ru.canvas.finishLoading}
            </Button>
          </div>
        ) : (
          <InlineAlert
            tone="error"
            title={ru.canvas.loadErrorTitle}
            actions={
              <Button
                size="compact"
                variant="secondary"
                leadingIcon={<RotateCcwIcon className="h-4 w-4" />}
                onClick={() => {
                  doc.setLoadStatus('loading');
                  window.setTimeout(() => doc.setLoadStatus('ready'), 900);
                }}
              >
                {ru.canvas.tryAgain}
              </Button>
            }
          >
            {ru.canvas.loadErrorBody}
          </InlineAlert>
        )}
      </div>
    ) : null;

  const canvasInner = (
    <div className={`doc-column doc-${direction}`}>
      {learner && (
        <div role="note" className="mb-6 flex flex-wrap items-center gap-2 rounded-xl bg-primary-subtle px-3 py-2">
          <p className="min-w-0 flex-1 text-sm leading-6 text-text-primary">{ru.learner.banner}</p>
          <Button size={mobile ? 'default' : 'compact'} variant="secondary" onClick={() => setLearner(false)}>
            {ru.learner.exit}
          </Button>
        </div>
      )}
      <WorkbookStrip touch={mobile} canReorder={!learner} onNavigate={(t) => doc.notify({ variant: 'info', title: bs.workbook.goTo(t), description: bs.workbook.navNote })} />
      <DocTitleField value={doc.title} onChange={doc.changeTitle} onEnter={() => editor.focus('start')} size={titleSize} titleRef={titleRef} />
      <div className="mb-6 mt-3">
        <DocProperties meta={doc.meta} onChange={doc.setMeta} touch={mobile} />
      </div>
      <SheetBlocks
        api={blocks}
        authoring={!learner}
        touch={mobile}
        onEdit={(block, isNew) => setBlockEditor({ block, isNew })}
        onPreview={() => {
          blocks.setSelectedId(null);
          setLearner(true);
          scrollRef.current?.scrollTo({ top: 0 });
        }}
        notify={doc.notify}
        onPanel={setBlockPanel}
        onFocusProseEnd={() => editor.focus('end')}
        accent={blockAccents}
        prose={
      <DocEditor
        editor={editor}
        touch={mobile}
        proseClass="doc-prose"
        aiActions={aiActions}
        busy={chat.streaming}
        onAction={onAction}
        readOnly={learner}
        overlay={
          inlineMsg?.suggestion && (
            <InlineReview
              editor={editor}
              message={inlineMsg}
              touch={mobile}
              onAccept={acceptInline}
              onReject={() => setInlineId(null)}
              onCompare={() => {
                setReviewId(inlineMsg.id);
                setInlineId(null);
              }}
            />
          )
        }
      />
        }
      />
      {editor.isEmpty && blocks.blocks.length === 0 && !learner && <EmptyStarters touch={mobile} aiBusy={chat.streaming} onStart={onStart} />}
    </div>
  );

  const reviewMsgProposal = reviewProposalId ? chat.messages.find((m) => m.id === reviewProposalId) : undefined;
  const overlays = (
    <>
      {blockEditor && (
        <BlockEditorDialog
          key={blockEditor.block.id}
          block={blockEditor.block}
          isNew={blockEditor.isNew}
          mobile={mobile}
          fieldAiFails={doc.flags.fieldCheckFails}
          onApply={applyBlockEdit}
          onClose={() => setBlockEditor(null)}
        />
      )}
      {reviewMsgProposal?.proposal && (
        <ProposalReviewPanel
          messageId={reviewMsgProposal.id}
          proposal={reviewMsgProposal.proposal}
          status={proposals.statusOf(reviewMsgProposal.id)}
          mobile={mobile}
          onApply={() => {
            proposals.apply(reviewMsgProposal.id);
            setReviewProposalId(null);
          }}
          onClose={() => setReviewProposalId(null)}
        />
      )}
      <BlockPanels
        panel={blockPanel}
        mobile={mobile}
        libraryFails={doc.flags.librarySaveFails}
        onClose={() => setBlockPanel(null)}
        notify={doc.notify}
        onInsert={(copy) => {
          const originalId = blockPanel?.kind === 'copy' ? blockPanel.block.id : null;
          const i = blocks.nodes.findIndex((n) => n.id === originalId);
          blocks.insert([copy], i >= 0 ? i + 1 : undefined);
          revealBlock(copy.id);
        }}
      />
    </>
  );

  const documentColumn = (
    <div className={`mx-auto w-full ${mobile ? 'pb-10' : card ? 'px-6 pb-16 pt-6' : 'pb-24'}`} style={{ maxWidth: card && !mobile ? 900 : undefined }}>
      {reviewMsg?.suggestion && (
        <div className={`sticky top-2 z-30 mx-auto ${mobile ? 'px-2 pt-2' : card ? 'mb-3' : 'max-w-3xl px-6 pt-4'}`}>
          <ProposalReview editor={editor} message={reviewMsg} touch={mobile} onClose={() => setReviewId(null)} onApplied={(t) => {
            setReviewId(null);
            notifyApplied(t);
          }} />
        </div>
      )}
      {doc.view === 'conflict' && doc.conflict ? (
        <div className={mobile ? 'p-4' : 'mx-auto max-w-5xl px-6 pt-6'}>
          <ConflictCompare
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
          aria-label={ru.canvas.documentLabel}
          className={`${padX} ${card && !mobile ? 'rounded-2xl border border-border-default bg-background-surface py-12 shadow-sm' : mobile ? 'pt-5' : direction === 'editorial' ? 'pt-20' : 'pt-10'}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) editor.focus('end');
          }}
        >
          {canvasInner}
        </article>
      )}
    </div>
  );

  const toolbarRow =
    showToolbar &&
    (direction === 'editorial' && !mobile ? (
      <div
        ref={floating.pillRef}
        aria-hidden={!floating.visible}
        className={`absolute left-1/2 top-14 z-20 -translate-x-1/2 rounded-xl border border-border-default bg-background-elevated p-1 shadow-md transition-opacity duration-150 ${floating.visible ? 'opacity-100' : 'invisible opacity-0'}`}
      >
        <EditorToolbar editor={editor} density={density} />
      </div>
    ) : (
      <div className={`shrink-0 border-b bg-background-surface transition-colors ${mobile ? 'border-border-default' : card || titleHidden ? 'border-border-default px-3 py-1' : 'border-transparent px-3 py-1'}`}>
        <div className="mx-auto flex justify-center" style={{ maxWidth: mobile ? undefined : 860 }}>
          <EditorToolbar editor={editor} density={density} />
        </div>
      </div>
    ));

  const docPane = (
    <>
      {toolbarRow}
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto" style={{ paddingBottom: editorKeyboard ? KEYBOARD_H : undefined }}>
        {loadingOrError ?? documentColumn}
      </div>
    </>
  );

  const history = doc.historyOpen && (
    <div className={`absolute z-40 border-l border-border-default shadow-lg ${mobile ? 'inset-0' : 'bottom-0 right-0 top-12 w-96 max-w-full'}`}>
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
  );

  const topBar = (
    <DocTopBar
      doc={doc}
      mobile={mobile}
      compact={compact}
      showTitle={titleHidden}
      layoutMode={layout.mode}
      allowChatMode={resolved.allowChatMode}
      onLayout={layout.setMode}
      onBack={onBack}
      onSaveCopy={() => doc.notify({ variant: 'success', title: ru.toasts.copySaved, description: ru.toasts.copySavedBody(doc.title) })}
      stats={ru.topBar.stats(ru.common.words(wordCount(doc.html)), ru.common.chars(formatChars(docChars)))}
      mobileTab={mobileTab}
      onMobileTab={setMobileTab}
      tutorUnread={unread}
      blockAccents={blockAccents}
      onBlockAccents={setBlockAccents}
    />
  );

  const dialogs = (
    <DocDialogs
      doc={doc}
      onLeave={() => {
        doc.setDialog(null);
        doc.setView('knowledge');
      }}
      onSaveAndLeave={() =>
        doc.save(() => {
          doc.setDialog(null);
          doc.setView('knowledge');
        })
      }
      onDelete={() => {
        doc.setDialog(null);
        setDeleted(true);
        doc.setView('knowledge');
        doc.notify({ variant: 'info', title: ru.toasts.deleted, description: ru.toasts.deletedBody });
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
      failNextReply={chat.failNextReply}
      onFailNextReply={chat.setFailNextReply}
    />
  );

  const knowledge = <KnowledgePlaceholder title={doc.title} deleted={deleted} onReopen={() => (deleted ? controls.onRestart() : doc.setView('editor'))} />;

  const viewer = seed.viewer;
  const withRuntime = (node: React.ReactNode) => (
    <BlockRuntimeProvider
      touch={mobile}
      speechUnavailable={doc.flags.speechUnavailable}
      aiCheckFails={doc.flags.fieldCheckFails}
      role={viewer === 'anonymous' ? 'anonymous' : viewer === 'author' ? 'author' : 'reader'}
    >
      {node}
    </BlockRuntimeProvider>
  );

  // Someone with the share link sees the last saved sheet only — never the working draft or the author's chat.
  if (viewer !== 'author') {
    return withRuntime(
      <SharedReaderView
        access={viewer}
        title={doc.saved?.title ?? doc.title}
        html={doc.saved?.html ?? ''}
        nodes={seed.nodes}
        mobile={mobile}
        updatedSinceCompletion={seed.updatedSinceCompletion}
        notify={doc.notify}
        footer={
          <>
            {toast}
            {prototypeControls}
          </>
        }
      />,
    );
  }

  if (mobile) {
    return withRuntime(
      <div ref={areaRef} className="relative flex h-full w-full flex-col overflow-hidden bg-background-surface text-text-primary">
        {doc.view === 'knowledge' ? (
          knowledge
        ) : (
          <>
            {topBar}
            <div ref={docAreaRef} id="panel-doc" role="tabpanel" aria-labelledby="tab-doc" className={`${mobileTab === 'doc' ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col`}>
              {docPane}
            </div>
            <div id="panel-tutor" role="tabpanel" aria-labelledby="tab-tutor" className={`${mobileTab === 'tutor' ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col`} style={{ paddingBottom: composerKeyboard ? KEYBOARD_H : undefined }}>
              {ready ? chatPanel : null}
            </div>
            {history}
          </>
        )}
        {framed && (editorKeyboard || composerKeyboard) && <SimulatedKeyboard height={KEYBOARD_H} />}
        {overlays}
        {dialogs}
        {toast}
        {prototypeControls}
      </div>,
    );
  }

  return withRuntime(
    <div className="relative flex h-full w-full overflow-hidden bg-background-canvas text-text-primary">
      <DocNavRail />
      <div ref={areaRef} className="relative flex min-w-0 flex-1">
        <div ref={docAreaRef} className={`relative flex min-w-0 flex-1 flex-col ${card ? 'bg-background-canvas' : 'bg-background-surface'}`}>
          {doc.view === 'knowledge' ? (
            knowledge
          ) : (
            <>
              {topBar}
              {docPane}
              {history}
            </>
          )}
        </div>
        {ready && resolved.kind === 'inline' && (
          <div style={{ width: resolved.chatWidth }} className="relative flex shrink-0 flex-col border-l border-border-default">
            {resolved.resizable && <PanelResizer width={resolved.chatWidth} min={resolved.minWidth} max={resolved.maxWidth} onChange={layout.setWidth} />}
            {chatPanel}
          </div>
        )}
        {ready && resolved.kind === 'overlay' && (
          <div style={{ width: resolved.chatWidth }} className="absolute bottom-0 right-0 top-12 z-30 flex flex-col border-l border-border-default shadow-lg">
            {chatPanel}
          </div>
        )}
      </div>
      {overlays}
      {dialogs}
      {toast}
      {prototypeControls}
    </div>,
  );
}

