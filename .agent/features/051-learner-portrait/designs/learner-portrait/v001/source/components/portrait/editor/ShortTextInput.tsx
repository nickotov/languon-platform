import React from 'react';
import { Input } from '../../Input';
import { LIMITS } from '../../../data/portraitOptions';
import { validateShortText } from '../../../utils/text';
import { CharCounter } from './CharCounter';

interface ShortTextInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  checkDiagnostic?: boolean;
  onEnter?: () => void;
  externalError?: string;
}

export function ShortTextInput({ label, value, onChange, placeholder, hint, checkDiagnostic, onEnter, externalError }: ShortTextInputProps) {
  const id = React.useId();
  const error = externalError ?? validateShortText(value, LIMITS.customAnswer, checkDiagnostic);
  return (
    <div className="space-y-1">
      <Input
        label={label}
        value={value}
        placeholder={placeholder}
        error={error}
        hint={hint}
        aria-describedby={`${id}-count`}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onEnter) {
            e.preventDefault();
            onEnter();
          }
        }}
      />
      <CharCounter id={`${id}-count`} value={value} max={LIMITS.customAnswer} />
    </div>
  );
}

