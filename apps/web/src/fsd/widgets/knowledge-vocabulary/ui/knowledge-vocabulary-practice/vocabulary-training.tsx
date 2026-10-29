'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    FlashcardPracticeLauncher,
    type FlashcardPracticeLauncherProps,
} from '@/fsd/features/flashcard-training';
import {
    SentenceSetup,
    SentencePracticeSession,
    SentenceHistory,
    useSentenceSetup,
    useSentenceSession,
    useSentenceHistory,
    type SentenceApi,
    type Configuration,
} from '@/fsd/features/sentence-training';
import { useI18n } from '@/fsd/shared/i18n';
export function VocabularyTraining({
    sentenceApi,
    capabilityIdentity,
    ...props
}: FlashcardPracticeLauncherProps & {
    sentenceApi: SentenceApi;
    capabilityIdentity: string;
}) {
    const { locale, t } = useI18n();
    const [setupOpen, setSetupOpen] = useState(false);
    const [running, setRunning] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [fullscreen, setFullscreen] = useState<Promise<boolean>>();
    const capability = useQuery({
        queryKey: ['knowledge-sentence-capability', capabilityIdentity],
        queryFn: () => sentenceApi.capabilities(),
        retry: false,
    });
    const setup = useSentenceSetup({
        api: sentenceApi,
        identity: props.identity,
        initialExplanationLanguage: locale,
        enabled: setupOpen,
    });
    const session = useSentenceSession({
        api: sentenceApi,
        identity: props.identity,
    });
    const history = useSentenceHistory({
        api: sentenceApi,
        identity: props.identity,
        enabled: historyOpen,
    });
    const label = {
        en: 'Sentence practice',
        es: 'Práctica de frases',
        fr: 'Pratique des phrases',
        ru: 'Практика предложений',
    }[locale];
    function start(
        configuration: Configuration,
        fullscreen?: Promise<boolean>,
    ) {
        setSetupOpen(false);
        setFullscreen(fullscreen);
        setRunning(true);
        void session.start(configuration);
    }
    function close() {
        setRunning(false);
        session.reset();
        setup.invalidate();
    }
    function openHistory() {
        setHistoryOpen(true);
        history.invalidate();
    }
    return (
        <>
            <FlashcardPracticeLauncher
                {...props}
                additionalItems={[
                    {
                        label: capability.isPending
                            ? `${label} · ${t('training.checking')}`
                            : capability.isError
                              ? `${label} · ${t('training.unavailable')}`
                              : label,
                        disabled:
                            capability.isPending ||
                            (!capability.isError &&
                                !capability.data?.sentencesEnabled),
                        onSelect: () => {
                            if (capability.isError) void capability.refetch();
                            else setSetupOpen(true);
                        },
                    },
                    {
                        label: {
                            en: 'My sentence practice',
                            es: 'Mi práctica de frases',
                            fr: 'Ma pratique des phrases',
                            ru: 'Моя практика предложений',
                        }[locale],
                        onSelect: openHistory,
                    },
                ]}
            />
            <SentenceSetup
                controller={setup}
                open={setupOpen}
                onClose={() => setSetupOpen(false)}
                onStart={start}
                sourceLanguage={props.sourceLanguage.code}
                targetLanguage={props.targetLanguage.code}
                dictionaryTitle={props.dictionaryTitle}
            />
            <SentencePracticeSession
                controller={session}
                open={running}
                onClose={close}
                dictionaryTitle={props.dictionaryTitle}
                initialFullscreen={fullscreen}
                onOpenHistory={openHistory}
            />
            <SentenceHistory
                controller={history}
                open={historyOpen}
                onClose={() => setHistoryOpen(false)}
            />
        </>
    );
}
