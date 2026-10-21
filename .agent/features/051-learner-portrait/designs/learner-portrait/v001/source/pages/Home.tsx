import React from 'react';
import { PortraitStatusCard } from '../components/portrait/PortraitStatusCard';

export function Home() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-6 sm:py-10">
      <header>
        <p className="text-sm text-text-secondary">Tuesday, October 20</p>
        <h1 className="mt-1 text-2xl font-semibold text-text-primary">Good morning, Maya</h1>
      </header>
      <PortraitStatusCard variant="home" />
    </div>
  );
}

