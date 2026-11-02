import { useEffect, useRef, useState } from 'react';
import type { RichEditor } from '../utils/richEditor';

/** Direction C: the toolbar only shows while the document (or the toolbar itself) has focus. */
export function useFloatingToolbar(editor: RichEditor, enabled: boolean) {
  const pillRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let timer = 0;
    const update = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const active = document.activeElement as HTMLElement | null;
        const inPill = !!active && !!pillRef.current?.contains(active);
        const inPopup = !!active?.closest?.('[role="menu"],[role="dialog"],[data-radix-popper-content-wrapper]');
        setVisible(editor.hasFocus() || inPill || inPopup);
      }, 0);
    };
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
    };
  }, [editor, enabled]);

  return { pillRef, visible: enabled && visible };
}

