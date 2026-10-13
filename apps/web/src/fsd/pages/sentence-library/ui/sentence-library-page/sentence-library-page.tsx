'use client';
import { useEffect, useMemo, useState } from 'react';
import { SpeechControl } from '@/fsd/features/speech-playback';
import componentStyles from './sentence-library-page.module.css';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { dictionaryApi } from '@/fsd/entities/dictionary';
import { useSessionStore } from '@/fsd/entities/session';
import { useAuth } from '@/fsd/features/auth';
import {
    SentenceLibrary,
    type LibraryTarget,
} from '@/fsd/features/sentence-library';
import {
    createSentenceApi,
    useSentencePreparation,
    SentencePreparationChip,
    SentencePreparationSheet,
    type Configuration,
} from '@/fsd/features/sentence-training';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, ErrorState, LoadingState } from '@/fsd/shared/ui';
export function SentenceLibraryPage({
    dictionaryId,
    shareId,
    exampleId,
}: {
    dictionaryId?: string;
    shareId?: string;
    exampleId?: string;
}) {
    const { requestWithSession } = useAuth();
    const { t, href } = useI18n();
    const router = useRouter();
    const status = useSessionStore((state) => state.status);
    const userId = useSessionStore((state) => state.user?.id);
    const [capability, setCapability] = useState<{
        key: string;
        revision: number;
    } | null>(null);
    const shareKey = capability?.key ?? null;
    const [preparationOpen, setPreparationOpen] = useState(false);
    useEffect(() => {
        if (!shareId) return;
        const update = () =>
            setCapability((current) => ({
                key: window.location.hash.slice(1),
                revision: (current?.revision ?? 0) + 1,
            }));
        update();
        window.addEventListener('hashchange', update);
        return () => window.removeEventListener('hashchange', update);
    }, [shareId]);
    const dictionaryHref = shareId
        ? `/shared/dictionaries/${shareId}`
        : `/dictionaries/${dictionaryId}`;
    useEffect(() => {
        if (status !== 'signed-out') return;
        const returnTo = `${dictionaryHref}/sentences`;
        router.replace(
            href(
                `/login?${new URLSearchParams({ returnTo })}${shareKey ? `#${shareKey}` : ''}`,
            ),
        );
    }, [status, router, href, dictionaryHref, shareKey]);
    const target = useMemo<LibraryTarget>(
        () =>
            shareId
                ? { kind: 'shared', shareId, shareKey: shareKey ?? '' }
                : { kind: 'owner', dictionaryId: dictionaryId ?? '' },
        [shareId, shareKey, dictionaryId],
    );
    const sentenceApi = useMemo(
        () =>
            createSentenceApi({
                target,
                requestWithSession,
                signedIn: status === 'authenticated',
            }),
        [target, requestWithSession, status],
    );
    const preparation = useSentencePreparation({
        api: sentenceApi,
        identity: `${userId ?? 'anonymous'}:${shareId ? `shared:${shareId}` : `owner:${dictionaryId}`}`,
        enabled: status === 'authenticated' && (!shareId || !!shareKey),
    });
    function startPrepared(configuration: Configuration) {
        if (!configuration.preparedBatchId) return;
        const params = new URLSearchParams({
            practice: 'prepared',
            batch: configuration.preparedBatchId,
            direction: configuration.direction,
            mode: configuration.mode,
        });
        router.push(
            href(
                `${dictionaryHref}?${params}${shareKey ? `#${shareKey}` : ''}`,
            ),
        );
    }
    const query = useQuery({
        queryKey: [
            'sentence-library-dictionary',
            userId,
            dictionaryId,
            shareId,
            shareKey,
        ],
        queryFn: async () => {
            if (shareId) {
                const response = await dictionaryApi.readSharedDictionary(
                    shareId,
                    shareKey!,
                    { limit: 1 },
                );
                return response.dictionary;
            }
            const response = await requestWithSession((token) =>
                dictionaryApi.readDictionary(token, dictionaryId!),
            );
            return response.dictionary;
        },
        enabled: status === 'authenticated' && (!shareId || Boolean(shareKey)),
        retry: false,
        gcTime: 0,
    });
    function retry() {
        void query.refetch();
    }
    if (status !== 'authenticated' || query.isPending)
        return (
            <main className={componentStyles.page}>
                <LoadingState>{t('dictionary.editor.loading')}</LoadingState>
            </main>
        );
    if (!query.data)
        return (
            <main className={componentStyles.page}>
                <ErrorState
                    title={t('dictionary.public.unavailable')}
                    action={
                        <Button onClick={retry}>{t('common.retry')}</Button>
                    }
                >
                    {t('dictionary.public.unavailableHelp')}
                </ErrorState>
            </main>
        );
    function renderAudio(exerciseId: string, field: 'prompt' | 'reference') {
        return (
            <SpeechControl
                source={{
                    kind: 'sentence-library',
                    access: target,
                    exerciseId,
                    field,
                }}
                requestWithSession={requestWithSession}
            />
        );
    }
    const identity = `${userId}:${dictionaryHref}:${capability?.revision ?? 0}`;
    return (
        <main className={componentStyles.page}>
            <SentenceLibrary
                key={identity}
                target={target}
                renderAudio={renderAudio}
                dictionary={query.data}
                requestWithSession={requestWithSession}
                identity={identity}
                dictionaryHref={dictionaryHref}
                {...(exampleId ? { exampleId } : {})}
                preparationChip={
                    <SentencePreparationChip
                        controller={preparation}
                        onOpen={() => setPreparationOpen(true)}
                    />
                }
                {...(preparation.preparation
                    ? { onOpenPreparation: () => setPreparationOpen(true) }
                    : {})}
            />
            <SentencePreparationSheet
                controller={preparation}
                open={preparationOpen}
                onClose={() => setPreparationOpen(false)}
                onOpenAiSettings={() => router.push('/profile?tab=account')}
                onRestartSetup={() => {
                    setPreparationOpen(false);
                    router.push(
                        `${dictionaryHref.split('#')[0]}?practice=setup&prep=1${shareId ? window.location.hash : ''}`,
                    );
                }}
                onStart={startPrepared}
                dictionaryTitle={query.data.name}
                sourceLanguage={query.data.sourceLanguage}
                targetLanguage={query.data.targetLanguage}
            />
        </main>
    );
}
