import React, { useState } from 'react';
import { CheckCircle2Icon, CopyPlusIcon, InfoIcon, LinkIcon, LogInIcon, SendIcon, SparklesIcon } from 'lucide-react';
import type { SheetNode } from '../../types/blocks';
import type { ToastState } from '../../hooks/useDocState';
import { Button } from '../Button';
import { DocNavRail } from '../document/DocNavRail';
import { WorkbookStrip } from '../document/WorkbookStrip';
import { BlockFrame } from '../blocks/BlockFrame';
import { BlockView } from '../blocks/BlockView';
import { hasText } from '../../utils/sheetNodes';
import { BlockPanels } from '../blocks/BlockPanels';
import type { BlockPanel } from '../blocks/BlockPanels';
import { LearnerBlockMenu } from '../blocks/LearnerBlockMenu';
import { bs } from '../../data/blockStrings';

export type ReaderAccess = 'reader' | 'anonymous' | 'revoked';

interface SharedReaderViewProps {
  access: ReaderAccess;
  title: string;
  /** Last explicitly saved prose (normalized by the editor's sanitizer). */
  html: string;
  nodes: SheetNode[];
  mobile: boolean;
  /** Reader completed the sheet earlier and the author saved changes since. */
  updatedSinceCompletion: boolean;
  notify: (t: Omit<ToastState, 'id'>) => void;
  footer: React.ReactNode;
}

const AUTHOR = 'Claire M.';
const noop = () => undefined;

/**
 * What someone with the share link sees: the saved sheet only, no authoring chrome, private practice,
 * a read-only tutor, and Make a copy to edit.
 */
export function SharedReaderView({ access, title, html, nodes, mobile, updatedSinceCompletion, notify, footer }: SharedReaderViewProps) {
  const [completed, setCompleted] = useState(updatedSinceCompletion);
  const [panel, setPanel] = useState<BlockPanel | null>(null);
  const [expandAll, setExpandAll] = useState<Record<string, { open: boolean; at: number }>>({});
  const signedIn = access === 'reader';
  const size = mobile ? 'default' : 'compact';

  if (access === 'revoked') {
    return (
      <div className="relative flex h-full w-full bg-background-canvas text-text-primary">
        {!mobile && <DocNavRail />}
        <main className="flex flex-1 items-center justify-center p-6">
          <div className="max-w-md text-center" role="alert">
            <LinkIcon className="mx-auto h-6 w-6 text-text-tertiary" aria-hidden="true" />
            <h1 className="mt-3 text-xl font-semibold text-text-primary">{bs.roles.revokedTitle}</h1>
            <p className="mt-2 text-sm leading-6 text-text-secondary">{bs.roles.revokedBody}</p>
            <div className="mt-5 flex justify-center">
              <Button size={size} variant="secondary" onClick={() => notify({ variant: 'info', title: bs.roles.revokedAction, description: bs.workbook.goTo('Knowledge') })}>
                {bs.roles.revokedAction}
              </Button>
            </div>
          </div>
        </main>
        {footer}
      </div>
    );
  }

  const tutor = (
    <aside aria-label={bs.roles.tutorTitle} className={`flex flex-col bg-background-surface ${mobile ? 'border-t border-border-default' : 'w-[360px] shrink-0 border-l border-border-default'}`}>
      <header className="flex items-center gap-2 border-b border-border-default px-4 py-3">
        <SparklesIcon className="h-4 w-4 text-primary-default" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-text-primary">{bs.roles.tutorTitle}</h2>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <p className="text-xs leading-5 text-text-tertiary">{bs.roles.tutorScope}</p>
        {signedIn && (
          <>
            <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-user-message-bg px-3 py-2 text-sm leading-6 text-text-primary">{bs.roles.tutorSample.q}</p>
            <p className="text-sm leading-6 text-text-primary">{bs.roles.tutorSample.a}</p>
          </>
        )}
      </div>
      <div className="border-t border-border-default p-3">
        {signedIn ? (
          <div className="flex items-end gap-2 rounded-xl border border-border-strong px-3 py-2">
            <label htmlFor="reader-q" className="sr-only">
              {bs.roles.tutorPlaceholder}
            </label>
            <textarea id="reader-q" rows={1} placeholder={bs.roles.tutorPlaceholder} className="min-w-0 flex-1 resize-none bg-transparent text-sm leading-6 text-text-primary placeholder:text-text-tertiary focus:outline-none" />
            <button type="button" aria-label="Send" className={`inline-flex items-center justify-center rounded-lg bg-primary-default text-background-surface hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${mobile ? 'h-11 w-11' : 'h-8 w-8'}`}>
              <SendIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 text-sm text-text-secondary">{bs.roles.tutorSignIn}</p>
            <Button size={size} variant="secondary" leadingIcon={<LogInIcon className="h-4 w-4" />} onClick={noop}>
              {bs.roles.signIn}
            </Button>
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <div className="relative flex h-full w-full overflow-hidden bg-background-canvas text-text-primary">
      {!mobile && <DocNavRail />}
      <div className="flex min-w-0 flex-1 flex-col bg-background-surface">
        <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border-default px-4 py-2">
          <p className="min-w-0 flex-1 truncate text-xs text-text-tertiary">{bs.roles.sharedBy(AUTHOR)}</p>
          {signedIn ? (
            <Button
              size={size}
              variant="secondary"
              leadingIcon={<CopyPlusIcon className="h-4 w-4" />}
              onClick={() => notify({ variant: 'success', title: bs.roles.copyMade, description: bs.roles.copyMadeBody })}
            >
              {bs.roles.makeCopy}
            </Button>
          ) : (
            <Button size={size} leadingIcon={<LogInIcon className="h-4 w-4" />} onClick={noop}>
              {bs.roles.signIn}
            </Button>
          )}
        </header>
        <div className={`min-h-0 flex-1 overflow-y-auto ${mobile ? '' : 'flex'}`}>
          <article className={`mx-auto w-full min-w-0 max-w-[720px] flex-1 ${mobile ? 'px-4 pb-10 pt-5' : 'px-10 pb-24 pt-8'}`}>
            <WorkbookStrip touch={mobile} canReorder={false} currentCompleted={completed} onNavigate={(t) => notify({ variant: 'info', title: bs.workbook.goTo(t) })} />
            <p className="mb-4 flex items-start gap-1.5 rounded-lg bg-background-subtle px-3 py-2 text-xs leading-5 text-text-secondary">
              <InfoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {signedIn ? bs.roles.readerNote : bs.roles.anonymousNote}
            </p>
            <h1 className="text-3xl font-semibold leading-tight tracking-tight text-text-primary">{title}</h1>
            <div className="mt-6">
              {nodes.map((n) =>
                n.kind === 'prose' ? (
                  <div key="prose" className="doc-prose" dangerouslySetInnerHTML={{ __html: html }} />
                ) : n.kind === 'text' ? (
                  hasText(n.html) ? <div key={n.id} className="doc-prose text-gap-read" dangerouslySetInnerHTML={{ __html: n.html }} /> : null
                ) : (
                  <div key={n.id} className="my-6">
                    <BlockFrame
                      block={n.block}
                      accent
                      authoring={false}
                      touch={mobile}
                      selected={false}
                      flashing={false}
                      dragging={false}
                      onSelect={noop}
                      onDeselect={noop}
                      onMove={noop}
                      onDelete={noop}
                      onUndo={noop}
                      onDragStart={noop}
                      onDragEnd={noop}
                      learnerMenu={
                        n.block.type === 'vocabulary' ? (
                          <LearnerBlockMenu
                            block={n.block}
                            touch={mobile}
                            allOpen={!!expandAll[n.id]?.open}
                            onToggleAll={() => setExpandAll((s) => ({ ...s, [n.id]: { open: !s[n.id]?.open, at: Date.now() } }))}
                            onPanel={setPanel}
                          />
                        ) : undefined
                      }
                    >
                      <BlockView block={n.block} variant="learner" scope="reader" expandAll={expandAll[n.id]} />
                    </BlockFrame>
                  </div>
                ),
              )}
            </div>
            {signedIn && (
              <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-border-default pt-4">
                {completed ? (
                  <p className="inline-flex items-center gap-1.5 text-sm font-medium text-success-default">
                    <CheckCircle2Icon className="h-4 w-4" aria-hidden="true" />
                    {bs.roles.completed}
                  </p>
                ) : (
                  <Button size={size} variant="secondary" leadingIcon={<CheckCircle2Icon className="h-4 w-4" />} onClick={() => setCompleted(true)}>
                    {bs.roles.markComplete}
                  </Button>
                )}
                {completed && updatedSinceCompletion && <span className="rounded-full bg-warning-subtle px-2 py-0.5 text-xs font-medium text-warning-default">{bs.roles.updatedSince}</span>}
              </div>
            )}
          </article>
          {mobile ? tutor : null}
        </div>
      </div>
      {!mobile && tutor}
      <BlockPanels panel={panel} mobile={mobile} libraryFails={false} onClose={() => setPanel(null)} notify={notify} />
      {footer}
    </div>
  );
}

