import React from 'react';
import { GraduationCapIcon } from 'lucide-react';

export function TutorMark({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'h-6 w-6 rounded-md' : 'h-8 w-8 rounded-lg';
  const icon = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  return (
    <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center bg-primary-subtle text-primary-default ${box}`}>
      <GraduationCapIcon className={icon} />
    </span>
  );
}

