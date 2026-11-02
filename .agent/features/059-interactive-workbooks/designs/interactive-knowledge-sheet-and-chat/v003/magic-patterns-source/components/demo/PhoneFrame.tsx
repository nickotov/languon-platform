import React from 'react';

interface PhoneFrameProps {
  width: number;
  children: React.ReactNode;
}

/** Prototype-only device frame for previewing the mobile layout on desktop. */
export function PhoneFrame({ width, children }: PhoneFrameProps) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-background-subtle p-6">
      <div
        style={{ width: width + 16, height: 'min(844px, calc(100vh - 48px))' }}
        className="relative flex flex-col overflow-hidden rounded-3xl border-8 border-neutral-900 bg-background-canvas shadow-lg"
      >
        <div className="flex h-7 shrink-0 items-center justify-between bg-background-surface px-5 text-xs font-semibold text-text-primary" aria-hidden="true">
          <span>9:41</span>
          <span className="h-1.5 w-12 rounded-full bg-neutral-900" />
          <span>100%</span>
        </div>
        <div className="relative min-h-0 flex-1">{children}</div>
        <span className="pointer-events-none absolute bottom-1.5 left-1/2 z-50 h-1 w-28 -translate-x-1/2 rounded-full bg-text-primary" aria-hidden="true" />
      </div>
    </div>
  );
}

