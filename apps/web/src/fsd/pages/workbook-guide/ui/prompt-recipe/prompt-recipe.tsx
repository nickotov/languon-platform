'use client';

import { useState } from 'react';
import { Button } from '@/fsd/shared/ui';
import type { GuideUiCopy } from '../copy';
import styles from './prompt-recipe.module.css';

export function PromptRecipe({
    title,
    text,
    copyLabel,
    copy,
}: {
    title: string;
    text: string;
    copyLabel: string;
    copy: GuideUiCopy;
}) {
    const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
    async function handleCopy() {
        try {
            await navigator.clipboard.writeText(text);
            setStatus('copied');
        } catch {
            setStatus('failed');
        }
    }

    const message = status === 'copied' ? copy.copied : copy.copyFailed;
    const hasStatus = status !== 'idle';

    return (
        <section className={styles.root}>
            <h3 className={styles.title}>{title}</h3>
            <pre className={styles.text} tabIndex={0}>
                {text}
            </pre>
            <Button type='button' variant='secondary' onClick={handleCopy}>
                {copyLabel}
            </Button>
            {hasStatus && (
                <p role='status' className={styles.status}>
                    {message}
                </p>
            )}
        </section>
    );
}
