'use client';
import { type ReactNode, useEffect, useRef } from 'react';
import { InlineAlert } from '@/fsd/shared/ui';

export function FormMessage({
    children,
    tone = 'error',
}: {
    children: ReactNode;
    tone?: 'error' | 'info' | 'success';
}) {
    const message = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (tone === 'error') {
            message.current?.focus();
        }
    }, [tone]);

    return (
        <InlineAlert ref={message} tone={tone === 'error' ? 'danger' : tone}>
            {children}
        </InlineAlert>
    );
}
