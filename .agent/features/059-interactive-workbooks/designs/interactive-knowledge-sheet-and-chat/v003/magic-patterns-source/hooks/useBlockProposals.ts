import { useCallback, useRef, useState } from 'react';
import type { DocChatMessage } from '../types/document';
import type { ProposalStatus, SheetBlock } from '../types/blocks';
import type { SheetBlocksApi } from './useSheetBlocks';
import type { DocStateApi } from './useDocState';
import type { ProposalHandlers } from '../components/blocks/ProposalCard';
import { blockKey, cloneBlock } from '../utils/sheetNodes';
import { ru } from '../data/strings';

interface Options {
  messages: DocChatMessage[];
  blocks: SheetBlocksApi;
  doc: DocStateApi;
  /** Scroll the sheet to the given block and highlight it. */
  reveal: (blockId: string) => void;
  onReview: (messageId: string) => void;
  onAskAgain: (prompt: string) => void;
}

const APPLY_MS = 650;

/** Review → Apply to working draft. Apply never publishes; Save does. */
export function useBlockProposals({ messages, blocks, doc, reveal, onReview, onAskAgain }: Options) {
  const [statuses, setStatuses] = useState<Record<string, ProposalStatus>>({});
  const [applied, setApplied] = useState<Record<string, string[]>>({});
  const pending = useRef<Set<string>>(new Set());

  const find = useCallback((id: string) => messages.find((m) => m.id === id), [messages]);

  const isStale = useCallback(
    (m: DocChatMessage | undefined) => {
      const p = m?.proposal;
      if (!p?.updatesBlockId) return false;
      const current = blocks.getBlock(p.updatesBlockId);
      return !current || blockKey(current) !== p.basedOnKey;
    },
    [blocks],
  );

  const statusOf = useCallback(
    (id: string): ProposalStatus => {
      const s = statuses[id];
      if (s && s !== 'ready') return s;
      return isStale(find(id)) ? 'stale' : 'ready';
    },
    [statuses, isStale, find],
  );

  const finish = (id: string, inserted: SheetBlock[], title: string) => {
    setStatuses((s) => ({ ...s, [id]: 'applied' }));
    setApplied((a) => ({ ...a, [id]: inserted.map((b) => b.id) }));
    doc.notify({ variant: 'success', title: ru.proposal.appliedToast(title), description: ru.proposal.appliedToastBody, action: { label: ru.blocks.undo, onClick: () => undoApply(id) } });
    if (inserted[0]) reveal(inserted[0].id);
  };

  const undoApply = (id: string) => {
    if (blocks.undo()) {
      setStatuses((s) => ({ ...s, [id]: 'ready' }));
      setApplied((a) => {
        const next = { ...a };
        delete next[id];
        return next;
      });
    }
  };

  const apply = (id: string) => {
    const m = find(id);
    const p = m?.proposal;
    if (!p || pending.current.has(id)) return;
    const st = statusOf(id);
    if (st === 'applied' || st === 'applying' || st === 'stale') return;
    pending.current.add(id);
    setStatuses((s) => ({ ...s, [id]: 'applying' }));
    window.setTimeout(() => {
      pending.current.delete(id);
      if (doc.flags.applyFails) {
        doc.setFlags((f) => ({ ...f, applyFails: false }));
        setStatuses((s) => ({ ...s, [id]: 'failed' }));
        return;
      }
      if (p.updatesBlockId) {
        // Re-check at commit time: the target may have changed while applying.
        if (isStale(m)) {
          setStatuses((s) => ({ ...s, [id]: 'stale' }));
          return;
        }
        const updated = { ...p.blocks[0], id: p.updatesBlockId } as SheetBlock;
        blocks.update(updated);
        finish(id, [updated], updated.title);
      } else {
        const copies = p.blocks.map(cloneBlock);
        blocks.insert(copies);
        finish(id, copies, copies[0]?.title ?? p.label);
      }
    }, APPLY_MS);
  };

  const addSeparate = (id: string) => {
    const p = find(id)?.proposal;
    if (!p) return;
    const copies = p.blocks.map(cloneBlock);
    blocks.insert(copies);
    finish(id, copies, copies[0]?.title ?? p.label);
  };

  const showInSheet = (id: string) => {
    const ids = applied[id] ?? (find(id)?.proposal?.updatesBlockId ? [find(id)!.proposal!.updatesBlockId!] : []);
    const first = ids.find((b) => blocks.getBlock(b));
    if (first) reveal(first);
  };

  const askAgain = (id: string) => {
    const idx = messages.findIndex((m) => m.id === id);
    const question = [...messages.slice(0, idx)].reverse().find((m) => m.role === 'user');
    onAskAgain(question?.text ?? '');
  };

  const handlers: ProposalHandlers = { statusOf, onApply: apply, onReview, onShowInSheet: showInSheet, onAddSeparate: addSeparate, onAskAgain: askAgain };
  return { handlers, statusOf, apply };
}

