import { useEffect, useRef, useState } from 'react';
import type { DocStateApi } from './useDocState';
import type { DocChatApi } from './useDocChat';
import type { DocSeed } from '../utils/docScenarioSetup';
import { RichEditor } from '../utils/richEditor';

/** Creates the editor, seeds scenario targets, and keeps the caret clear of overlays. */
export function useWorkspaceEditor(seed: DocSeed, doc: DocStateApi, chat: DocChatApi, bottomInset: number) {
  const [editor] = useState(() => new RichEditor(seed.html));
  const [focused, setFocused] = useState(false);
  const [, setTick] = useState(0);
  const seeded = useRef(false);
  const docRef = useRef(doc);
  docRef.current = doc;
  const chatRef = useRef(chat);
  chatRef.current = chat;
  const insetRef = useRef(bottomInset);
  insetRef.current = bottomInset;

  useEffect(() => {
    editor.onChange = () => {
      docRef.current.onEditorChange(editor.getHTML(), editor.getText());
      setTick((t) => t + 1);
    };
    editor.onSelect = () => {
      setTick((t) => t + 1);
      if (editor.hasFocus() && insetRef.current) editor.ensureCaretVisible(insetRef.current);
    };
    editor.onMount = (ed) => {
      if (seeded.current) return;
      seeded.current = true;
      docRef.current.markInitialized(ed.getHTML(), ed.getText());
      for (const t of seed.seedTargets) {
        const r = ed.findTextRange(t.sentence);
        if (!r) continue;
        ed.setTarget(t.messageId, r, t.sentence);
        if (t.changeTo) ed.replaceText(t.changeTo.find, t.changeTo.replace);
      }
      if (seed.pendingPassage) {
        const r = ed.findTextRange(seed.pendingPassage);
        if (r) chatRef.current.attachRange(ed, r, seed.pendingPassage);
      }
      setTick((t) => t + 1);
    };
    // Editor may already be mounted before this effect runs.
    if (editor.el && !seeded.current) editor.onMount(editor);

    const onSel = () => editor.handleSelectionChange();
    const onFocusIn = () => setFocused(editor.hasFocus());
    const onFocusOut = () => window.setTimeout(onFocusIn, 0);
    document.addEventListener('selectionchange', onSel);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('selectionchange', onSel);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  useEffect(() => {
    if (editor.hasFocus() && bottomInset) editor.ensureCaretVisible(bottomInset);
  }, [editor, bottomInset]);

  // Cmd/Ctrl+S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        docRef.current.save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return { editor, focused };
}

