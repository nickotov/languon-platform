import React, { useLayoutEffect } from 'react';
import { ru } from '../../data/strings';

interface DocTitleFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Enter moves the caret into the document body. */
  onEnter: () => void;
  size: 'md' | 'lg' | 'xl';
  titleRef: React.RefObject<HTMLTextAreaElement>;
}

const sizes = {
  md: 'text-2xl',
  lg: 'text-3xl',
  xl: 'text-4xl',
};

/** The one editable document title, inside the canvas. Auto-grows; never wraps into a second field. */
export function DocTitleField({ value, onChange, onEnter, size, titleRef }: DocTitleFieldProps) {
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value, size, titleRef]);

  return (
    <textarea
      ref={titleRef}
      id="doc-title"
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\n/g, ' '))}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
          e.preventDefault();
          onEnter();
        }
      }}
      aria-label={ru.canvas.titleLabel}
      placeholder={ru.canvas.titlePlaceholder}
      spellCheck
      className={`block w-full resize-none overflow-hidden bg-transparent font-bold leading-tight tracking-tight text-text-primary placeholder:text-text-disabled focus:outline-none ${sizes[size]}`}
    />
  );
}

