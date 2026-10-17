import { useEffect, useState } from 'react';
import type { DictionaryCard } from '@languon/contracts';
import { dictionaryApi } from '@/fsd/entities/dictionary';
import type { RequestWithTextSession } from '@/fsd/entities/texts';
import { Button, Skeleton } from '@/fsd/shared/ui';
import { useReadingCopy } from '../../hooks/use-reading-copy';

const normalize = (value: string) =>
    value.normalize('NFKC').trim().toLocaleLowerCase('und');

export function DuplicatePreview({
    dictionaryId,
    term,
    requestWithSession,
}: {
    dictionaryId: string;
    term: string;
    requestWithSession?: RequestWithTextSession | undefined;
}) {
    const t = useReadingCopy();
    const [card, setCard] = useState<DictionaryCard | null>(null);
    const [loading, setLoading] = useState(true);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        const control = new AbortController();
        setLoading(true);
        setCard(null);
        const load = async () => {
            try {
                if (!requestWithSession) return;
                let cursor: string | undefined;
                do {
                    const response = await requestWithSession((token) =>
                        dictionaryApi.listCards(
                            token,
                            dictionaryId,
                            {
                                search: term,
                                limit: 100,
                                lifecycle: 'active',
                                ...(cursor ? { cursor } : {}),
                            },
                            control.signal,
                        ),
                    );
                    if (control.signal.aborted) return;
                    const found = response.data.find(
                        (candidate) =>
                            normalize(candidate.values.source) ===
                            normalize(term),
                    );
                    if (found) {
                        setCard(found);
                        return;
                    }
                    cursor = response.nextCursor ?? undefined;
                } while (cursor);
            } catch {
                /* Keep confirmation available; preview has an explicit retry. */
            } finally {
                if (!control.signal.aborted) setLoading(false);
            }
        };
        void load();
        return () => control.abort();
    }, [dictionaryId, term, requestWithSession, attempt]);

    function retry() {
        setAttempt((value) => value + 1);
    }

    if (loading) return <Skeleton height={44} />;
    if (card)
        return (
            <p>
                {t('texts.collect.preview', {
                    term: card.values.source,
                    translation: card.values.translation,
                })}
            </p>
        );

    return (
        <div role='status'>
            <p>{t('texts.collect.previewError')}</p>
            <Button variant='ghost' size='compact' onClick={retry}>
                {t('texts.collect.retry')}
            </Button>
        </div>
    );
}
