import React from 'react';
import { Toast } from './Toast';
import { usePrototype } from '../contexts/PrototypeContext';

export function ToastHost() {
  const { toast, clearToast } = usePrototype();
  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-sm">
        <Toast key={toast.id} title={toast.title} description={toast.description} variant={toast.variant} duration={4500} onDismiss={clearToast} />
      </div>
    </div>
  );
}

