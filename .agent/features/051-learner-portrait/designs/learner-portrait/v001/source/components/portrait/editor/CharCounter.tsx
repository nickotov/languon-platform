import React from 'react';
import { countChars } from '../../../utils/text';

interface CharCounterProps {
  id: string;
  value: string;
  max: number;
  label?: string;
}

export function CharCounter({ id, value, max, label }: CharCounterProps) {
  const n = countChars(value);
  const over = n > max;
  const near = !over && n > max * 0.9;
  return (
    <p
      id={id}
      className={`text-xs tabular-nums ${over ? 'font-medium text-danger-default' : near ? 'text-warning-default' : 'text-text-tertiary'}`}
      aria-live={over || near ? 'polite' : 'off'}
    >
      {label ? `${label} · ` : ''}
      {n.toLocaleString()} / {max.toLocaleString()}
      {over ? ` · ${(n - max).toLocaleString()} over` : ''}
    </p>
  );
}

