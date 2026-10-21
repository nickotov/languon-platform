import React, { useEffect, useRef, useState } from 'react';
import { SendIcon } from 'lucide-react';
import { IconButton } from '../IconButton';
import { Textarea } from '../Textarea';
import { LIMITS } from '../../data/portraitOptions';
import { usePrototype } from '../../contexts/PrototypeContext';
import { countChars } from '../../utils/text';

interface InterviewComposerProps {
  disabled: boolean;
  onSend: (text: string) => void;
}

export function InterviewComposer({ disabled, onSend }: InterviewComposerProps) {
  const { demoComposerText, setDemoComposerText, costMode, credits } = usePrototype();
  const [text, setText] = useState('');
  const metaId = React.useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const n = countChars(text);
  const max = LIMITS.chatMessage;
  const over = n > max;
  const near = !over && n > max * 0.9;

  useEffect(() => {
    if (demoComposerText !== null) {
      setText(demoComposerText);
      setDemoComposerText(null);
      ref.current?.focus();
    }
  }, [demoComposerText, setDemoComposerText]);

  const send = () => {
    if (!text.trim() || over || disabled) return;
    onSend(text.trim());
    setText('');
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
      aria-label="Message the interviewer"
    >
      <div className="relative">
        <Textarea
          ref={ref}
          aria-label="Message the interviewer — ask what a question means or answer in your own words"
          aria-invalid={over || undefined}
          aria-describedby={metaId}
          value={text}
          rows={3}
          resize="none"
          className="pr-14"
          placeholder="Ask a question or answer in your own words…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className="absolute bottom-3 right-3">
          <IconButton
            type="submit"
            icon={<SendIcon />}
            label="Send message"
            variant="primary"
            size="md"
            rounded
            showTooltip={false}
            disabled={disabled || over || !text.trim()}
          />
        </div>
      </div>
      <p
        id={metaId}
        aria-live={over || near ? 'polite' : 'off'}
        className={`mt-1 px-1 text-xs tabular-nums ${over ? 'font-medium text-danger-default' : near ? 'text-warning-default' : 'text-text-tertiary'}`}
      >
        {over
          ? `${n.toLocaleString()}/${max.toLocaleString()} characters — shorten to send, nothing was cut`
          : `${n.toLocaleString()}/${max.toLocaleString()} characters · ${costMode === 'paid' ? `uses credits (${credits} left)` : 'free'}`}
      </p>
    </form>
  );
}

