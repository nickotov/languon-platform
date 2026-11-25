import { useEffect, useEffectEvent, useRef, useState } from 'react';
import {
    SentenceDirectionSchema,
    SentenceModeSchema,
    SentencePreparationBatchSchema,
    type SentencePreparationBatch,
} from '@languon/contracts';
import type { Configuration } from '@/fsd/features/sentence-training';

type Manifest = Pick<SentencePreparationBatch, 'id' | 'preparedEntryIds'>;

export function usePreparedPracticeLaunch({
    search,
    enabled,
    load,
    start,
}: {
    search: Pick<URLSearchParams, 'get'>;
    enabled: boolean;
    load: ((id: string) => Promise<Manifest>) | undefined;
    start(configuration: Configuration): void;
}) {
    const prepared = search.get('practice') === 'prepared';
    const batch = search.get('batch');
    const mode = search.get('mode');
    const direction = search.get('direction');
    const completed = useRef<string | null>(null);
    const [failedIntent, setFailedIntent] = useState<string | null>(null);
    const startCurrentSession = useEffectEvent(start);
    const intent = prepared ? JSON.stringify([batch, direction, mode]) : null;

    useEffect(() => {
        if (!intent || completed.current !== intent) {
            completed.current = null;
            setFailedIntent(null);
        }

        if (!intent || !enabled || !load || completed.current === intent) {
            return;
        }

        const id = SentencePreparationBatchSchema.shape.id.safeParse(batch);
        const parsedDirection = SentenceDirectionSchema.safeParse(direction);
        const parsedMode = SentenceModeSchema.safeParse(mode);
        if (!id.success || !parsedDirection.success || !parsedMode.success) {
            setFailedIntent(intent);

            return;
        }

        // Cleanup invalidates only this request. A replacement effect must still
        // be able to launch the same batch with its newly selected configuration.
        let current = true;
        void load(id.data).then(
            (manifest) => {
                if (!current) {
                    return;
                }

                if (!manifest.preparedEntryIds.length) {
                    setFailedIntent(intent);

                    return;
                }

                completed.current = intent;
                startCurrentSession({
                    direction: parsedDirection.data,
                    mode: parsedMode.data,
                    scope: {
                        type: 'manual',
                        entryIds: manifest.preparedEntryIds,
                    },
                    preparedBatchId: manifest.id,
                });
            },
            () => {
                if (current) {
                    setFailedIntent(intent);
                }
            },
        );

        return () => {
            current = false;
        };
    }, [batch, direction, enabled, intent, load, mode]);

    return enabled && intent !== null && failedIntent === intent;
}
