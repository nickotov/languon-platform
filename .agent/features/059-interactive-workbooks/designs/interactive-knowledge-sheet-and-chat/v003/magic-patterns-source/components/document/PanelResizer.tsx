import React, { useRef } from 'react';
import { ru } from '../../data/strings';

interface PanelResizerProps {
  width: number;
  min: number;
  max: number;
  /** null resets to the default width. */
  onChange: (width: number | null) => void;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** Drag or keyboard handle on the tutor panel's left edge. */
export function PanelResizer({ width, min, max, onChange }: PanelResizerProps) {
  const start = useRef<{ x: number; w: number } | null>(null);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={ru.chat.resize}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={(e) => {
        start.current = { x: e.clientX, w: width };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        onChange(clamp(start.current.w + (start.current.x - e.clientX), min, max));
      }}
      onPointerUp={() => {
        start.current = null;
      }}
      onDoubleClick={() => onChange(null)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 64 : 16;
        if (e.key === 'ArrowLeft') onChange(clamp(width + step, min, max));
        else if (e.key === 'ArrowRight') onChange(clamp(width - step, min, max));
        else if (e.key === 'Home') onChange(min);
        else if (e.key === 'End') onChange(max);
        else if (e.key === 'Enter') onChange(null);
        else return;
        e.preventDefault();
      }}
      className="group absolute -left-1.5 bottom-0 top-0 z-10 w-3 cursor-col-resize touch-none focus-visible:outline-none"
    >
      <span aria-hidden="true" className="absolute bottom-0 left-1/2 top-0 w-0.5 -translate-x-1/2 rounded-full bg-transparent transition-colors group-hover:bg-primary-200 group-focus-visible:bg-primary-default" />
    </div>
  );
}

