'use client';

import { useState, type ChangeEvent } from 'react';
import { Input, InlineAlert } from '@/fsd/shared/ui';
import type { LearningBlock } from '@languon/contracts';
import type { BlockAuthoringLabels } from './block-labels';

export type UploadBlockAudio = (file: File) => Promise<{ assetId: string }>;

export function AudioBlockUpload({
    upload,
    disabled,
    labels,
    onReady,
}: {
    upload: UploadBlockAudio;
    disabled: boolean;
    labels: BlockAuthoringLabels;
    onReady(block: Extract<LearningBlock, { type: 'audio' }>): void;
}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    async function choose(event: ChangeEvent<HTMLInputElement>) {
        const input = event.currentTarget;
        const file = input.files?.[0];
        if (!file || disabled || busy) return;
        input.value = '';

        if (
            !['audio/wav', 'audio/mpeg'].includes(file.type) ||
            file.size > 5 * 1024 * 1024 ||
            file.size === 0
        ) {
            setError(true);
            return;
        }
        setBusy(true);
        setError(false);
        try {
            const result = await upload(file);
            onReady({
                id: crypto.randomUUID(),
                type: 'audio',
                assetId: result.assetId,
            });
        } catch {
            setError(true);
        } finally {
            setBusy(false);
        }
    }
    return (
        <div aria-busy={busy}>
            <Input
                type='file'
                accept='audio/wav,audio/mpeg'
                label={labels.field('Upload audio (WAV or MP3, up to 5 MiB)')}
                disabled={disabled || busy}
                onChange={choose}
            />
            {error && (
                <InlineAlert tone='error'>
                    {labels.field(
                        'Audio upload failed. Use a WAV or MP3 file up to 5 MiB and try again.',
                    )}
                </InlineAlert>
            )}
        </div>
    );
}
