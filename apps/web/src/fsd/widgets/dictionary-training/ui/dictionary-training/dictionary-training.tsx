'use client';

import { BookOpen, MessageSquareText, RefreshCw } from 'lucide-react';
import {
    DictionaryLanguageTagSchema,
    SentenceDirectionSchema,
    SentenceModeSchema,
    SentencePreparationBatchSchema,
} from '@languon/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
    TrainingLauncher,
    type TrainingLauncherProps,
} from '@/fsd/features/flashcard-training';
import {
    createSentenceApi,
    useSentenceSetup,
    useSentenceSession,
    useSentenceHistory,
    SentenceSetup,
    SentencePracticeSession,
    SentenceHistory,
    useSentencePreparation,
    SentencePreparationChip,
    SentencePreparationSheet,
    type Configuration,
    isSentenceAccessLoss,
} from '@/fsd/features/sentence-training';
import { ModelPreferenceSection } from '@/fsd/features/text-ai-preferences';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, ButtonLink, Dialog, type MenuItem } from '@/fsd/shared/ui';

const labels = {
    en: {
        sentence: 'Sentence practice',
        history: 'My practice history',
        preferences: 'AI preferences',
        unavailable: 'Unavailable',
        signin: 'Sign in to practise sentences',
        signinHelp:
            'Your answers, reviews and progress are personal. Sign in to continue.',
        signIn: 'Sign in',
        back: 'Back to dictionary',
        dirty: 'Discard your unsaved model choice?',
        keep: 'Keep editing',
        discard: 'Discard changes',
        close: 'Close',
        library: 'Saved sentences',
    },
    ru: {
        sentence: 'Практика предложений',
        history: 'Моя история практики',
        preferences: 'Настройки ИИ',
        unavailable: 'Недоступно',
        signin: 'Войдите для практики предложений',
        signinHelp:
            'Ваши ответы, отзывы и прогресс личные. Войдите, чтобы продолжить.',
        signIn: 'Войти',
        back: 'Вернуться к словарю',
        dirty: 'Отменить несохранённый выбор модели?',
        keep: 'Продолжить редактирование',
        discard: 'Отменить изменения',
        close: 'Закрыть',
        library: 'Сохранённые предложения',
    },
    fr: {
        sentence: 'Pratique des phrases',
        history: 'Mon historique',
        preferences: 'Préférences IA',
        unavailable: 'Indisponible',
        signin: 'Connectez-vous pour pratiquer',
        signinHelp:
            'Vos réponses, révisions et progrès sont personnels. Connectez-vous pour continuer.',
        signIn: 'Se connecter',
        back: 'Retour au dictionnaire',
        dirty: 'Abandonner votre choix de modèle non enregistré ?',
        keep: 'Continuer à modifier',
        discard: 'Abandonner',
        close: 'Fermer',
        library: 'Phrases enregistrées',
    },
    es: {
        sentence: 'Práctica de frases',
        history: 'Mi historial',
        preferences: 'Preferencias de IA',
        unavailable: 'No disponible',
        signin: 'Inicia sesión para practicar',
        signinHelp:
            'Tus respuestas, revisiones y progreso son personales. Inicia sesión para continuar.',
        signIn: 'Iniciar sesión',
        back: 'Volver al diccionario',
        dirty: '¿Descartar la selección de modelo sin guardar?',
        keep: 'Seguir editando',
        discard: 'Descartar',
        close: 'Cerrar',
        library: 'Frases guardadas',
    },
};

/** Pages/widgets compose sibling feature capabilities without private imports. */
export function DictionaryTraining(props: TrainingLauncherProps) {
    const targetKey =
        props.target.kind === 'owner'
            ? `owner:${props.target.dictionaryId}`
            : `shared:${props.target.shareId}:${props.target.shareKey}`;
    return (
        <TrainingComposition
            key={`${props.identity}:${props.signedIn}:${targetKey}`}
            {...props}
        />
    );
}

function TrainingComposition(props: TrainingLauncherProps) {
    const { locale, href, t } = useI18n();
    const copy = labels[locale];
    const pathname = usePathname();
    const router = useRouter();
    const search = useSearchParams();
    const root = useRef<HTMLDivElement>(null);
    const dictionaryId =
        props.target.kind === 'owner' ? props.target.dictionaryId : undefined;
    const shareId =
        props.target.kind === 'shared' ? props.target.shareId : undefined;
    const shareKey =
        props.target.kind === 'shared' ? props.target.shareKey : undefined;
    const api = useMemo(
        () =>
            createSentenceApi({
                target: dictionaryId
                    ? { kind: 'owner', dictionaryId }
                    : {
                          kind: 'shared',
                          shareId: shareId!,
                          shareKey: shareKey!,
                      },
                signedIn: props.signedIn,
                requestWithSession: props.requestWithSession,
            }),
        [
            dictionaryId,
            shareId,
            shareKey,
            props.signedIn,
            props.requestWithSession,
        ],
    );
    const [capability, setCapability] = useState<
        'loading' | 'enabled' | 'disabled' | 'error'
    >('loading');
    const [capabilityRevision, setCapabilityRevision] = useState(0);
    const [setupOpen, setSetupOpen] = useState(false);
    const [restartPreparation, setRestartPreparation] = useState(false);
    const [preparationOpen, setPreparationOpen] = useState(false);
    const consumedLaunch = useRef<string | null>(null);
    const [preparedLaunchError, setPreparedLaunchError] = useState(false);
    const [running, setRunning] = useState(false);
    const [fullscreen, setFullscreen] = useState<
        Promise<boolean> | undefined
    >();
    const [historyOpen, setHistoryOpen] = useState(false);
    const [signinOpen, setSigninOpen] = useState(false);
    const [preferencesOpen, setPreferencesOpen] = useState(false);
    const [preferenceDirty, setPreferenceDirty] = useState(false);
    const [confirmPreferenceClose, setConfirmPreferenceClose] = useState(false);
    const afterPreferenceClose = useRef<(() => void) | null>(null);
    const [accessLost, setAccessLost] = useState(false);
    const session = useSentenceSession({ api, identity: props.identity });
    const preparation = useSentencePreparation({
        api,
        identity: `${props.identity.split(':')[0]}:${dictionaryId ? `owner:${dictionaryId}` : `shared:${shareId}`}`,
        enabled: props.signedIn && !accessLost,
    });
    const setup = useSentenceSetup({
        api,
        identity: props.identity,
        initialExplanationLanguage: DictionaryLanguageTagSchema.catch(
            'en',
        ).parse(props.sourceLanguage.code),
        enabled: setupOpen && props.signedIn,
    });
    const history = useSentenceHistory({
        api,
        identity: props.identity,
        enabled: historyOpen,
        direction: session.configuration?.direction,
    });
    const exerciseHistory = useSentenceHistory({
        api,
        identity: props.identity,
        enabled: running && !!session.exercise,
        direction: session.configuration?.direction,
        exerciseId: session.exercise?.id,
    });
    const refreshExerciseHistory = exerciseHistory.refresh;
    const accessError = [
        session.error,
        session.referenceError,
        session.progressError,
        setup.error,
        setup.entriesError,
        history.error,
        exerciseHistory.error,
    ].find((error) => error && isSentenceAccessLoss(error));
    const blocked = accessLost || !!accessError;
    useEffect(() => {
        const launch = search.get('practice');
        if (!launch) {
            consumedLaunch.current = null;
            return;
        }
        const intent = `${launch}:${search.get('prep') ?? ''}:${search.get('batch') ?? ''}`;
        if (
            consumedLaunch.current === intent ||
            capability !== 'enabled' ||
            blocked
        )
            return;
        consumedLaunch.current = intent;
        if (!props.signedIn) setSigninOpen(true);
        else if (launch === 'setup') setSetupOpen(true);
        else if (launch === 'progress') setPreparationOpen(true);
        else if (launch === 'prepared' && api.preparedBatch) {
            const batchId = SentencePreparationBatchSchema.shape.id.safeParse(
                search.get('batch'),
            );
            const direction = SentenceDirectionSchema.safeParse(
                search.get('direction'),
            );
            const mode = SentenceModeSchema.safeParse(search.get('mode'));
            if (!batchId.success || !direction.success || !mode.success) {
                setPreparedLaunchError(true);
                return;
            }
            setPreparedLaunchError(false);
            let cancelled = false;
            void api
                .preparedBatch(batchId.data)
                .then((batch) => {
                    if (cancelled) return;
                    if (!batch.preparedEntryIds.length)
                        throw new Error('Prepared batch unavailable');
                    start({
                        direction: direction.data,
                        mode: mode.data,
                        scope: {
                            type: 'manual',
                            entryIds: batch.preparedEntryIds,
                        },
                        preparedBatchId: batch.id,
                        ...(preparation.explanationLanguage
                            ? {
                                  explanationLanguage:
                                      preparation.explanationLanguage,
                              }
                            : {}),
                    });
                })
                .catch(() => {
                    if (!cancelled) setPreparedLaunchError(true);
                });
            return () => {
                cancelled = true;
            };
        }
    }, [search, capability, blocked, props.signedIn]);
    useEffect(() => {
        if (!accessError) return;
        setAccessLost(true);
        setSetupOpen(false);
        setHistoryOpen(false);
        setRunning(false);
        setPreferencesOpen(false);
        setConfirmPreferenceClose(false);
        session.reset();
        setup.invalidate();
        history.invalidate();
        exerciseHistory.invalidate();
    }, [
        accessError,
        session.reset,
        setup.invalidate,
        history.invalidate,
        exerciseHistory.invalidate,
    ]);
    useEffect(() => {
        if (session.attempt?.id) refreshExerciseHistory();
    }, [session.attempt?.id, refreshExerciseHistory]);

    useEffect(() => {
        let live = true;
        setCapability('loading');
        void api.capabilities().then(
            (result) => {
                if (live)
                    setCapability(
                        result.sentencesEnabled ? 'enabled' : 'disabled',
                    );
            },
            () => {
                if (live) setCapability('error');
            },
        );
        return () => {
            live = false;
        };
    }, [api, capabilityRevision]);

    function restoreFocus() {
        requestAnimationFrame(() =>
            root.current?.querySelector<HTMLButtonElement>('button')?.focus(),
        );
    }
    function openSetup() {
        if (!props.signedIn) {
            setSigninOpen(true);
            return;
        }
        setRestartPreparation(false);
        setSetupOpen(true);
    }
    function openLibrary() {
        const capabilityFragment =
            props.target.kind === 'shared' ? `#${props.target.shareKey}` : '';
        router.push(
            href(
                `${pathname.replace(/\/$/, '')}/sentences${capabilityFragment}`,
            ),
        );
    }
    function closePractice() {
        setRunning(false);
        setPreferencesOpen(false);
        session.reset();
        restoreFocus();
    }
    function start(configuration: Configuration, request?: Promise<boolean>) {
        setSetupOpen(false);
        setFullscreen(request);
        setRunning(true);
        void session.start(configuration);
    }
    function closePreferences(afterClose?: () => void) {
        if (preferenceDirty) {
            afterPreferenceClose.current = afterClose ?? null;
            setConfirmPreferenceClose(true);
            return;
        }
        setPreferencesOpen(false);
        afterClose?.();
    }
    function keepPreferenceChoice() {
        afterPreferenceClose.current = null;
        setConfirmPreferenceClose(false);
    }
    function discardPreferenceChoice() {
        setConfirmPreferenceClose(false);
        setPreferencesOpen(false);
        setPreferenceDirty(false);
        const afterClose = afterPreferenceClose.current;
        afterPreferenceClose.current = null;
        afterClose?.();
    }
    const items: MenuItem[] = [
        {
            label: copy.library,
            icon: <MessageSquareText className='h-4 w-4' />,
            disabled: blocked || !props.signedIn || capability !== 'enabled',
            onSelect: openLibrary,
        },
        {
            label:
                capability === 'loading'
                    ? `${copy.sentence} · ${t('training.checking')}`
                    : capability === 'disabled'
                      ? `${copy.sentence} · ${copy.unavailable}`
                      : copy.sentence,
            icon:
                capability === 'error' ? (
                    <RefreshCw className='h-4 w-4' />
                ) : (
                    <MessageSquareText className='h-4 w-4' />
                ),
            disabled:
                blocked ||
                capability === 'loading' ||
                capability === 'disabled' ||
                !!props.archived,
            closeOnSelect: capability !== 'error',
            onSelect:
                capability === 'error'
                    ? () => setCapabilityRevision((v) => v + 1)
                    : openSetup,
        },
        {
            label: copy.history,
            icon: <BookOpen className='h-4 w-4' />,
            disabled:
                blocked ||
                !props.signedIn ||
                capability !== 'enabled' ||
                !!props.archived,
            onSelect: () => setHistoryOpen(true),
        },
    ];
    const preferencesContent = (
        <>
            {preferencesOpen && (
                <section
                    className='mx-auto w-full max-w-3xl space-y-5 px-4 py-5'
                    aria-label={copy.preferences}
                >
                    <h3 className='text-lg font-semibold'>
                        {copy.preferences}
                    </h3>
                    <ModelPreferenceSection
                        requestWithSession={props.requestWithSession}
                        onDirtyChange={setPreferenceDirty}
                        taskInProgress={session.busy}
                    />
                </section>
            )}
            <Dialog
                open={confirmPreferenceClose}
                onClose={keepPreferenceChoice}
                size='sm'
                title={copy.dirty}
                footer={
                    <>
                        <Button
                            variant='secondary'
                            onClick={keepPreferenceChoice}
                        >
                            {copy.keep}
                        </Button>
                        <Button onClick={discardPreferenceChoice}>
                            {copy.discard}
                        </Button>
                    </>
                }
            >
                <p>{copy.dirty}</p>
            </Dialog>
        </>
    );
    const returnTo = pathname + (search.toString() ? `?${search}` : '');
    const signInHref =
        href(`/login?returnTo=${encodeURIComponent(returnTo)}`) +
        (props.target.kind === 'shared' ? `#${props.target.shareKey}` : '');
    if (blocked)
        return (
            <div ref={root}>
                {preparedLaunchError ? (
                    <p role='alert' className='text-sm text-danger-default'>
                        {copy.unavailable}
                    </p>
                ) : null}
                <TrainingLauncher {...props} additionalItems={items} />
                <p className='mt-2 text-sm text-text-secondary'>
                    {copy.unavailable}
                </p>
                <ButtonLink href={href('/dictionaries')}>
                    {copy.back}
                </ButtonLink>
            </div>
        );
    return (
        <div ref={root}>
            {preparedLaunchError ? (
                <p role='alert' className='text-sm text-danger-default'>
                    {copy.unavailable}
                </p>
            ) : null}
            <SentencePreparationChip
                controller={preparation}
                onOpen={() => setPreparationOpen(true)}
            />
            <TrainingLauncher {...props} additionalItems={items} />
            <SentenceSetup
                controller={setup}
                open={setupOpen}
                onClose={() => {
                    setSetupOpen(false);
                    setRestartPreparation(false);
                    restoreFocus();
                }}
                onStart={start}
                sourceLanguage={props.sourceLanguage.code}
                targetLanguage={props.targetLanguage.code}
                dictionaryTitle={props.dictionaryTitle}
                preparation={preparation}
                initialPreparationEnabled={
                    restartPreparation || search.get('prep') === '1'
                }
                onViewPreparation={() => setPreparationOpen(true)}
                onOpenLibrary={openLibrary}
            />
            <SentencePreparationSheet
                controller={preparation}
                open={preparationOpen}
                onClose={() => setPreparationOpen(false)}
                onRestartSetup={() => {
                    setPreparationOpen(false);
                    setRestartPreparation(true);
                    setSetupOpen(true);
                }}
                onStart={(configuration) => {
                    setPreparationOpen(false);
                    start(configuration);
                }}
                dictionaryTitle={props.dictionaryTitle}
                sourceLanguage={props.sourceLanguage.code}
                targetLanguage={props.targetLanguage.code}
                onOpenLibrary={openLibrary}
                onOpenAiSettings={() =>
                    router.push(href('/profile?tab=account'))
                }
            />
            {running && (
                <SentencePracticeSession
                    controller={session}
                    open={running}
                    dictionaryTitle={props.dictionaryTitle}
                    {...(fullscreen ? { initialFullscreen: fullscreen } : {})}
                    onClose={closePractice}
                    onOpenPreferences={() => setPreferencesOpen(true)}
                    preferencesContent={preferencesContent}
                    preferencesOpen={preferencesOpen}
                    onPreferencesClose={closePreferences}
                    onOpenHistory={() => setHistoryOpen(true)}
                    historyOpen={historyOpen}
                    onHistoryClose={() => setHistoryOpen(false)}
                    historyContent={
                        <SentenceHistory
                            controller={history}
                            inline
                            open={historyOpen}
                            onClose={() => setHistoryOpen(false)}
                        />
                    }
                    previousAttempts={exerciseHistory.attempts.filter(
                        (attempt) => attempt.id !== session.attempt?.id,
                    )}
                    previousAttemptsLoading={exerciseHistory.loading}
                    previousAttemptsError={exerciseHistory.error}
                    onRetryPreviousAttempts={exerciseHistory.refresh}
                />
            )}
            {!running && (
                <SentenceHistory
                    controller={history}
                    open={historyOpen}
                    onClose={() => {
                        setHistoryOpen(false);
                        restoreFocus();
                    }}
                />
            )}
            <Dialog
                open={signinOpen}
                onClose={() => setSigninOpen(false)}
                title={copy.signin}
                footer={
                    <>
                        <Button
                            variant='secondary'
                            onClick={() => setSigninOpen(false)}
                        >
                            {copy.back}
                        </Button>
                        <ButtonLink href={signInHref}>{copy.signIn}</ButtonLink>
                    </>
                }
            >
                <p>{copy.signinHelp}</p>
            </Dialog>
        </div>
    );
}
