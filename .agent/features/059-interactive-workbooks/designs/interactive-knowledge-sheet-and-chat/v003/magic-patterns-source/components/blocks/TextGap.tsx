import React, { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { hasText } from '../../utils/sheetNodes';
import { bs } from '../../data/blockStrings';

export interface TextGapHandle {
  focusEnd: () => void;
}

interface TextGapProps {
  html: string;
  readOnly: boolean;
  onChange: (html: string) => void;
}

/**
 * A writable line after a block. It stays in place even when empty, so the caret always has somewhere
 * to go between blocks and at the end of the sheet. Uncontrolled while typing to keep the caret stable.
 */
export const TextGap = forwardRef<TextGapHandle, TextGapProps>(function TextGap({ html, readOnly, onChange }, ref) {
  const el = useRef<HTMLDivElement>(null);

  // Only write external content (undo, scenario reset) — never the value the user just typed.
  useLayoutEffect(() => {
    const node = el.current;
    if (node && node.innerHTML !== html) node.innerHTML = html;
  }, [html, readOnly]);

  useImperativeHandle(ref, () => ({
    focusEnd: () => {
      const node = el.current;
      if (!node) return;
      node.focus();
      const range = document.createRange();
      range.selectNodeContents(node);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    },
  }));

  if (readOnly) {
    return hasText(html) ? <div className="doc-prose text-gap-read" dangerouslySetInnerHTML={{ __html: html }} /> : null;
  }

  const sync = () => {
    const node = el.current;
    if (!node) return;
    if (!hasText(node.innerHTML)) {
      // Keep an empty line truly empty so its placeholder can show.
      if (node.innerHTML !== '') node.innerHTML = '';
      onChange('');
    } else onChange(node.innerHTML);
  };

  return (
    <div
      ref={el}
      role="textbox"
      aria-multiline="true"
      aria-label={bs.textGap.label}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      data-placeholder={bs.textGap.placeholder}
      onFocus={() => document.execCommand('defaultParagraphSeparator', false, 'p')}
      onInput={sync}
      onBlur={sync}
      onPaste={(e) => {
        // Pasted material becomes plain text: no foreign markup or scripts in the sheet.
        e.preventDefault();
        document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
      }}
      className="doc-prose text-gap"
    />
  );
});

