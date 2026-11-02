import React from 'react';

const rows = ['azertyuiop', 'qsdfghjklm', 'wxcvbn'];

/** Prototype-only on-screen keyboard used to preview the keyboard-open sheet state. */
export function SimulatedKeyboard({ height }: { height: number }) {
  return (
    <div
      aria-hidden="true"
      onMouseDown={(e) => e.preventDefault()}
      style={{ height }}
      className="absolute inset-x-0 bottom-0 z-40 flex select-none flex-col gap-2 border-t border-border-default bg-background-subtle px-1.5 pb-6 pt-2"
    >
      {rows.map((row) => (
        <div key={row} className="flex justify-center gap-1">
          {row.split('').map((k) => (
            <span key={k} className="flex h-10 flex-1 items-center justify-center rounded-md bg-background-surface text-sm text-text-primary shadow-sm">
              {k}
            </span>
          ))}
        </div>
      ))}
      <div className="flex gap-1">
        <span className="flex h-10 w-16 items-center justify-center rounded-md bg-background-elevated text-xs text-text-secondary">123</span>
        <span className="flex h-10 flex-1 items-center justify-center rounded-md bg-background-surface text-xs text-text-tertiary">espace</span>
        <span className="flex h-10 w-16 items-center justify-center rounded-md bg-background-elevated text-xs text-text-secondary">retour</span>
      </div>
    </div>
  );
}

