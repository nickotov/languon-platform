import { useCallback, useEffect, useRef, useState } from 'react';
import type { SheetBlock, SheetNode } from '../types/blocks';
import { blockNode, blockText, blocksOf, cloneBlock, htmlText, normalizeNodes, serializeBlocks } from '../utils/sheetNodes';

/**
 * Ordered sheet nodes (one prose segment + learning blocks), whole-block selection and a
 * block-level undo history. Prose keeps the browser's own undo.
 */
export function useSheetBlocks(seed: SheetNode[], onChange: (key: string, count: number) => void, initialSelected: string | null) {
  const [nodes, setNodesState] = useState<SheetNode[]>(() => normalizeNodes(seed));
  const [selectedId, setSelectedId] = useState<string | null>(initialSelected);
  const [flashId, setFlashId] = useState<string | null>(null);
  const history = useRef<SheetNode[][]>([]);
  const nodesRef = useRef(nodes);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    changeRef.current(serializeBlocks(nodes), blocksOf(nodes).length);
  }, [nodes]);

  const commit = useCallback((next: SheetNode[]) => {
    history.current = [...history.current.slice(-30), nodesRef.current];
    const normalized = normalizeNodes(next);
    nodesRef.current = normalized;
    setNodesState(normalized);
  }, []);

  /** Typing in a line between blocks: no block-undo entry (the browser undoes typing), no re-normalizing while focused. */
  const setText = useCallback((id: string, html: string) => {
    const next = nodesRef.current.map((n) => (n.kind === 'text' && n.id === id ? { ...n, html } : n));
    nodesRef.current = next;
    setNodesState(next);
  }, []);

  const flash = useCallback((id: string) => {
    setFlashId(id);
    window.setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 1600);
  }, []);

  const indexOf = (id: string) => nodesRef.current.findIndex((n) => n.id === id);

  const moveTo = useCallback(
    (id: string, target: number) => {
      const list = [...nodesRef.current];
      const from = list.findIndex((n) => n.id === id);
      if (from < 0) return;
      const [node] = list.splice(from, 1);
      const to = Math.max(0, Math.min(target > from ? target - 1 : target, list.length));
      if (to === from) return;
      list.splice(to, 0, node);
      commit(list);
    },
    [commit],
  );

  /** Moves past the neighbouring block (or main text), skipping the writable lines between them. */
  const move = useCallback(
    (id: string, dir: -1 | 1) => {
      const list = nodesRef.current;
      const i = indexOf(id);
      if (i < 0) return;
      if (dir === -1) {
        for (let j = i - 1; j >= 0; j--) if (list[j].kind !== 'text') return moveTo(id, j);
      } else {
        for (let j = i + 1; j < list.length; j++) if (list[j].kind !== 'text') return moveTo(id, j + 1);
      }
    },
    [moveTo],
  );

  const insert = useCallback(
    (blocks: SheetBlock[], at?: number) => {
      const list = [...nodesRef.current];
      const pos = at ?? list.length;
      list.splice(pos, 0, ...blocks.map(blockNode));
      commit(list);
      if (blocks[0]) flash(blocks[0].id);
      return blocks.map((b) => b.id);
    },
    [commit, flash],
  );

  const update = useCallback(
    (block: SheetBlock) => {
      commit(nodesRef.current.map((n) => (n.kind === 'block' && n.id === block.id ? blockNode(block) : n)));
      flash(block.id);
    },
    [commit, flash],
  );

  const duplicate = useCallback(
    (id: string) => {
      const i = indexOf(id);
      const node = nodesRef.current[i];
      if (!node || node.kind !== 'block') return null;
      const copy = cloneBlock(node.block);
      insert([copy], i + 1);
      setSelectedId(copy.id);
      return copy;
    },
    [insert],
  );

  const remove = useCallback(
    (id: string) => {
      commit(nodesRef.current.filter((n) => n.id !== id));
      setSelectedId((cur) => (cur === id ? null : cur));
    },
    [commit],
  );

  const undo = useCallback(() => {
    const popped = history.current.pop();
    if (!popped) return false;
    // Block undo never discards text typed into lines since that snapshot.
    const typed = new Map(nodesRef.current.flatMap((n) => (n.kind === 'text' ? [[n.id, n.html] as const] : [])));
    const prev = normalizeNodes(popped.map((n) => (n.kind === 'text' && typed.has(n.id) ? { ...n, html: typed.get(n.id)! } : n)));
    nodesRef.current = prev;
    setNodesState(prev);
    return true;
  }, []);

  const getBlock = useCallback((id: string | null): SheetBlock | undefined => {
    const n = nodesRef.current.find((x) => x.id === id);
    return n && n.kind === 'block' ? n.block : undefined;
  }, []);

  const blocks = blocksOf(nodes);
  const blockChars =
    blocks.reduce((sum, b) => sum + blockText(b).length, 0) + nodes.reduce((sum, n) => sum + (n.kind === 'text' ? htmlText(n.html).length : 0), 0);

  return { nodes, blocks, blockChars, selectedId, setSelectedId, flashId, flash, move, moveTo, insert, update, duplicate, remove, undo, getBlock, setText };
}

export type SheetBlocksApi = ReturnType<typeof useSheetBlocks>;

